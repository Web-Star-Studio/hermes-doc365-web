/**
 * POST /api/conversations/:id/messages — one Hermes turn.
 *
 * Flow (Phase 1, non-streaming):
 *   1. Auth, verify conversation belongs to user.
 *   2. If `content` is non-empty, persist user Message.
 *   3. Build envelope, call adapter /chat (HMAC-signed).
 *   4. Persist assistant Message, update conversation.updatedAt.
 *   5. If conversation has no title and this is the first user message,
 *      derive a title from that message.
 *   6. Return both persisted messages to the client for state reconciliation.
 *
 * Side-effect actions still return here — `action_origin` + `approval_state`
 * are forwarded to the adapter which enforces the approval gate server-side.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { appendMessage, deriveTitle, getConversation } from "@/lib/repos";
import { buildEnvelope } from "@/lib/hermes-envelope";
import { postChat, AdapterError } from "@/lib/adapter-client";
import type { ActionType } from "@/lib/adapter-client";

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

  // 2. Persist user message (only if content present; actions may have empty content).
  let persistedUser = null;
  if (parsed.content.trim()) {
    persistedUser = await appendMessage(id, "user", parsed.content);

    // Derive conversation title if first user message and no title yet.
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

  // 3. Build envelope + call adapter.
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

  try {
    const reply = await postChat(envelope, { timeoutMs: 120_000 });

    const persistedAssistant = await appendMessage(
      id,
      "assistant",
      reply.assistant_message,
      {
        action_origin: parsed.action_origin,
        action_executed: reply.action_executed,
        action_result_summary: reply.action_result_summary,
      },
    );

    return Response.json({
      user_message: persistedUser
        ? {
            id: persistedUser.id,
            sender: "user",
            content: persistedUser.content,
            createdAt: persistedUser.createdAt.toISOString(),
          }
        : null,
      assistant_message: {
        id: persistedAssistant.id,
        sender: "assistant",
        content: persistedAssistant.content,
        createdAt: persistedAssistant.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof AdapterError) {
      console.error("adapter error", e.status, e.body);
      return new Response(`adapter ${e.status}: ${e.body}`, {
        status: e.status >= 500 ? 503 : e.status,
      });
    }
    console.error("unknown adapter failure", e);
    return new Response("adapter unreachable", { status: 503 });
  }
}
