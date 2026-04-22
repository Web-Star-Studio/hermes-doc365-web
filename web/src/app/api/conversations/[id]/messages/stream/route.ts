/**
 * POST /api/conversations/:id/messages/stream — streamed Hermes turn.
 *
 * Mirrors the shape of the non-streaming `/messages` route but proxies the
 * adapter's SSE stream back to the browser while intercepting three events
 * for server-side persistence:
 *
 *   - event: message  → buffered into the final assistant reply
 *   - event: action_executed → we persist an `audit_events` row on receipt
 *   - event: done     → close the stream; persist the buffered message
 *
 * We forward every event (including ones we intercept) to the browser so the
 * client UX stays identical to what the adapter emits.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { actionRequests, auditEvents, conversations } from "@/db/schema";
import { appendMessage, deriveTitle, getConversation } from "@/lib/repos";
import { buildEnvelope } from "@/lib/hermes-envelope";
import { postChatStream, AdapterError, type ActionType } from "@/lib/adapter-client";

export const runtime = "nodejs";

const bodySchema = z.object({
  content: z.string().default(""),
  action_origin: z
    .enum([
      "chat",
      "analyze_files",
      "check_pending",
      "validate_submission",
      "draft_recurso",
      "prepare_orizon",
      "submit_orizon",
    ])
    .default("chat"),
  approval_state: z.enum(["none", "pending", "granted"]).default("none"),
  action_request_id: z.string().uuid().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const user = session.user;

  const { id } = await ctx.params;
  const convo = await getConversation(id, user.id, user.organizationId);
  if (!convo) return new Response("Not Found", { status: 404 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (parsed.content.trim()) {
    await appendMessage(id, "user", parsed.content);
    if (!convo.title) {
      const title = deriveTitle(parsed.content);
      await db
        .update(conversations)
        .set({ title })
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.userId, user.id),
          ),
        );
    }
  }

  const envelope = await buildEnvelope({
    conversationId: id,
    user: {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
    },
    userMessage: parsed.content,
    actionOrigin: parsed.action_origin as ActionType,
    approvalState: parsed.approval_state,
    actionRequestId: parsed.action_request_id ?? null,
    idempotencyKey: parsed.idempotency_key ?? null,
  });

  let adapterRes: Response;
  try {
    adapterRes = await postChatStream(envelope);
  } catch (e) {
    if (e instanceof AdapterError) {
      console.error("adapter stream error", e.status, e.body);
      return new Response(`adapter ${e.status}`, {
        status: e.status >= 500 ? 503 : e.status,
      });
    }
    console.error("unknown adapter failure", e);
    return new Response("adapter unreachable", { status: 503 });
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Forward every chunk untouched, and parse a line-buffered copy for
  // side-effects (final message persistence, audit events).
  (async () => {
    const reader = adapterRes.body!.getReader();
    let buffer = "";
    let currentEvent = "message";
    let assistantMessage = "";
    let actionExecutedEvent: {
      action_type: string;
      action_request_id: string | null;
      summary: string | null;
      success: boolean;
    } | null = null;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Passthrough.
        await writer.write(value);

        // Server-side parse.
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);

          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim() || "message";
          } else if (line.startsWith("data:")) {
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const payload = JSON.parse(raw);
              if (currentEvent === "message") {
                if (payload.final) assistantMessage = payload.content ?? assistantMessage;
                else if (!assistantMessage) assistantMessage = payload.content ?? "";
              } else if (currentEvent === "action_executed") {
                actionExecutedEvent = {
                  action_type: String(payload.action_type),
                  action_request_id: payload.action_request_id ?? null,
                  summary: payload.summary ?? null,
                  success: Boolean(payload.success),
                };
              }
            } catch {
              // Non-JSON data line (e.g. ping); ignore.
            }
          } else if (line === "") {
            // event boundary — reset.
            currentEvent = "message";
          }
        }
      }
    } catch (e) {
      console.error("stream relay failed", e);
    } finally {
      // Persist the buffered assistant message + any audit event.
      try {
        if (assistantMessage.trim()) {
          await appendMessage(id, "assistant", assistantMessage, {
            action_origin: parsed.action_origin,
            action_executed: !!actionExecutedEvent,
            action_result_summary: actionExecutedEvent?.summary ?? null,
          });
        }
        if (actionExecutedEvent) {
          await db.insert(auditEvents).values({
            organizationId: user.organizationId,
            userId: user.id,
            conversationId: id,
            actionType: actionExecutedEvent.action_type,
            targetType: "action_request",
            targetId: actionExecutedEvent.action_request_id,
            metadataJson: {
              summary: actionExecutedEvent.summary,
              success: actionExecutedEvent.success,
            },
          });

          // Mark the linked action_request row as executed so the admin
          // console and future retries see an accurate lifecycle.
          if (actionExecutedEvent.action_request_id) {
            await db
              .update(actionRequests)
              .set({
                executionStatus: actionExecutedEvent.success
                  ? "succeeded"
                  : "failed",
                executedAt: new Date(),
                resultSummary: actionExecutedEvent.summary ?? null,
              })
              .where(eq(actionRequests.id, actionExecutedEvent.action_request_id));
          }
        }
      } catch (persistErr) {
        console.error("persist-after-stream failed", persistErr);
      }
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
