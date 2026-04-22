/**
 * POST /api/conversations/:id/actions/:actionId/approve
 *
 * Records a user's explicit approval of a side-effect action. The approval
 * itself is auditable — we always write an `audit_events` row with the
 * `action_type`, who approved, and when.
 *
 * The actual execution happens on the next chat turn, which must forward
 * `action_request_id` and `approval_state='granted'` in the envelope. The
 * adapter re-verifies the approval gate server-side on that request.
 *
 * Idempotent: calling approve twice is a no-op (second call returns the same
 * row). Approving an already-executed action returns 409 to surface UI bugs.
 */

import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { actionRequests, auditEvents } from "@/db/schema";
import { getConversation } from "@/lib/repos";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; actionId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const user = session.user;

  const { id, actionId } = await ctx.params;
  const convo = await getConversation(id, user.id, user.organizationId);
  if (!convo) return new Response("Not Found", { status: 404 });

  const rows = await db
    .select()
    .from(actionRequests)
    .where(
      and(
        eq(actionRequests.id, actionId),
        eq(actionRequests.conversationId, id),
      ),
    )
    .limit(1);

  const action = rows[0];
  if (!action) return new Response("Not Found", { status: 404 });

  // Idempotency: already approved → return the same row without mutating.
  if (action.approvalStatus === "approved") {
    return Response.json({
      action_request_id: action.id,
      approval_status: action.approvalStatus,
      approved_at: action.approvedAt?.toISOString() ?? null,
      execution_status: action.executionStatus,
      idempotency_key: action.idempotencyKey,
      already_approved: true,
    });
  }

  if (action.approvalStatus === "denied") {
    return Response.json(
      { error: "action_denied" },
      { status: 409 },
    );
  }

  if (action.executionStatus !== "not_started") {
    return Response.json(
      { error: "already_executed" },
      { status: 409 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(actionRequests)
    .set({
      approvalStatus: "approved",
      approvedByUserId: user.id,
      approvedAt: now,
    })
    .where(eq(actionRequests.id, actionId))
    .returning();

  // Auditable approval event, independent of the chat-turn action_executed
  // event written by the stream route later.
  await db.insert(auditEvents).values({
    organizationId: user.organizationId,
    userId: user.id,
    conversationId: id,
    actionType: `${action.actionType}.approved`,
    targetType: "action_request",
    targetId: action.id,
    metadataJson: {
      idempotency_key: action.idempotencyKey,
    },
  });

  return Response.json({
    action_request_id: updated.id,
    approval_status: updated.approvalStatus,
    approved_at: updated.approvedAt?.toISOString() ?? null,
    execution_status: updated.executionStatus,
    idempotency_key: updated.idempotencyKey,
    already_approved: false,
  });
}
