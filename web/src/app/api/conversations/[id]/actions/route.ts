/**
 * POST /api/conversations/:id/actions
 *
 * Create an `action_request` row before the client runs the Hermes turn.
 * For side-effect actions (submit_orizon…) this row is created with
 * `approval_status='pending'` and must be flipped to `'approved'` via
 * `/actions/:id/approve` before the chat turn is allowed.
 *
 * For informational/preparatory actions the row is created with
 * `approval_status='not_required'` and the client can immediately run the
 * chat turn referencing the new `action_request_id`.
 *
 * Returning `idempotency_key` lets the client forward it to the adapter so
 * downstream real-world tools (e.g. Orizon RPA) can dedupe retries.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { actionRequests } from "@/db/schema";
import { getConversation } from "@/lib/repos";
import type { ActionType } from "@/lib/adapter-client";

export const runtime = "nodejs";

const SIDE_EFFECT: ReadonlySet<ActionType> = new Set(["submit_orizon"]);

const bodySchema = z.object({
  action_type: z.enum([
    "analyze_files",
    "check_pending",
    "validate_submission",
    "draft_recurso",
    "prepare_orizon",
    "submit_orizon",
  ]),
  payload: z.record(z.unknown()).optional(),
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

  const actionType = parsed.action_type as ActionType;
  const approvalRequired = SIDE_EFFECT.has(actionType);
  const idempotencyKey = randomUUID();

  const [row] = await db
    .insert(actionRequests)
    .values({
      conversationId: id,
      requestedByUserId: user.id,
      actionType,
      approvalStatus: approvalRequired ? "pending" : "not_required",
      executionStatus: "not_started",
      idempotencyKey,
      payloadJson: parsed.payload ?? null,
    })
    .returning();

  return Response.json({
    action_request_id: row.id,
    action_type: row.actionType,
    approval_required: approvalRequired,
    approval_status: row.approvalStatus,
    execution_status: row.executionStatus,
    idempotency_key: row.idempotencyKey,
  });
}
