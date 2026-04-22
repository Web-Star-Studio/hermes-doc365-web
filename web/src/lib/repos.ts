/**
 * Small data-access helpers used by route handlers and server components.
 * Everything here enforces single-user / same-org scoping — the caller passes
 * the authenticated user's id and org id; queries never fan out past them.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actionRequests,
  auditEvents,
  conversations,
  fileAttachments,
  messages,
  organizations,
  users,
  type DbActionRequest,
  type DbAuditEvent,
  type DbConversation,
  type DbMessage,
  type DbFileAttachment,
} from "@/db/schema";

export async function listConversations(userId: string, orgId: string) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      status: conversations.status,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, orgId),
        eq(conversations.userId, userId),
      ),
    )
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversation(
  id: string,
  userId: string,
  orgId: string,
): Promise<DbConversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.organizationId, orgId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMessages(conversationId: string): Promise<DbMessage[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

export async function listFiles(
  conversationId: string,
): Promise<DbFileAttachment[]> {
  return db
    .select()
    .from(fileAttachments)
    .where(eq(fileAttachments.conversationId, conversationId))
    .orderBy(asc(fileAttachments.createdAt));
}

export async function createConversation(
  userId: string,
  orgId: string,
  title?: string,
): Promise<DbConversation> {
  const [row] = await db
    .insert(conversations)
    .values({
      userId,
      organizationId: orgId,
      title: title ?? null,
    })
    .returning();
  return row;
}

export async function touchConversation(id: string) {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));
}

export async function updateConversationTitle(
  id: string,
  userId: string,
  orgId: string,
  title: string | null,
): Promise<boolean> {
  const rows = await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.organizationId, orgId),
        eq(conversations.userId, userId),
      ),
    )
    .returning({ id: conversations.id });
  return rows.length > 0;
}

export async function appendMessage(
  conversationId: string,
  senderType: "user" | "assistant" | "system",
  content: string,
  metadata?: Record<string, unknown>,
): Promise<DbMessage> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId,
      senderType,
      content,
      metadataJson: metadata ?? null,
    })
    .returning();
  await touchConversation(conversationId);
  return row;
}

/**
 * Cheap title heuristic: first N characters of the first user message.
 * Used when the user sends the first message in an untitled conversation.
 */
export function deriveTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "…";
}

// ── Operator-scope helpers (admin console) ─────────────────────────────
//
// These functions DO NOT filter by user_id. They MUST only be called from
// routes/pages that already verified `session.user.role === "operator"`.
// Route protection happens in `middleware.ts` + layout-level re-checks.

export async function listConversationsForOperator() {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      status: conversations.status,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      userId: conversations.userId,
      organizationId: conversations.organizationId,
      userEmail: users.email,
      orgName: organizations.name,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.userId))
    .innerJoin(organizations, eq(organizations.id, conversations.organizationId))
    .orderBy(desc(conversations.updatedAt))
    .limit(200);
}

export async function getConversationForOperator(
  id: string,
): Promise<DbConversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listActionRequests(
  conversationId: string,
): Promise<DbActionRequest[]> {
  return db
    .select()
    .from(actionRequests)
    .where(eq(actionRequests.conversationId, conversationId))
    .orderBy(desc(actionRequests.requestedAt));
}

export async function listAuditEvents(
  conversationId: string,
): Promise<DbAuditEvent[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.conversationId, conversationId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
}
