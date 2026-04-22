/**
 * Builds the context envelope sent to the FastAPI adapter on each Hermes turn.
 * Mirrors PRD §17.1: authenticated user, org, conversation, prior messages,
 * file refs, action origin, approval state.
 */

import { db } from "@/db";
import { desc, eq } from "drizzle-orm";
import { fileAttachments, messages } from "@/db/schema";
import type {
  AdapterChatRequest,
  AdapterFileRef,
  AdapterHistoryMessage,
  ActionType,
} from "@/lib/adapter-client";

const MAX_HISTORY = 30; // matches ADAPTER_HISTORY_TURNS default

export interface EnvelopeInput {
  conversationId: string;
  user: {
    id: string;
    organizationId: string;
    role: "user" | "operator";
  };
  userMessage: string;
  actionOrigin?: ActionType;
  approvalState?: "none" | "pending" | "granted" | "denied";
  actionRequestId?: string | null;
  idempotencyKey?: string | null;
}

export async function buildEnvelope(
  input: EnvelopeInput,
): Promise<AdapterChatRequest> {
  const [history, files] = await Promise.all([
    loadHistory(input.conversationId),
    loadFiles(input.conversationId),
  ]);

  return {
    conversation_id: input.conversationId,
    user: {
      user_id: input.user.id,
      organization_id: input.user.organizationId,
      role: input.user.role,
    },
    user_message: input.userMessage,
    history,
    files,
    action_origin: input.actionOrigin ?? "chat",
    approval_state: input.approvalState ?? "none",
    action_request_id: input.actionRequestId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  };
}

async function loadHistory(
  conversationId: string,
): Promise<AdapterHistoryMessage[]> {
  const rows = await db
    .select({
      senderType: messages.senderType,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY);

  // We selected newest-first for the cap; flip back to chronological order
  // before sending — Hermes expects oldest-first history.
  return rows
    .reverse()
    .map((r) => ({ sender: r.senderType, content: r.content }));
}

async function loadFiles(conversationId: string): Promise<AdapterFileRef[]> {
  const rows = await db
    .select({
      id: fileAttachments.id,
      storageKey: fileAttachments.storageKey,
      originalName: fileAttachments.originalName,
      mimeType: fileAttachments.mimeType,
      sizeBytes: fileAttachments.sizeBytes,
      uploadComplete: fileAttachments.uploadComplete,
    })
    .from(fileAttachments)
    .where(eq(fileAttachments.conversationId, conversationId));

  return rows
    .filter((r) => r.uploadComplete)
    .map((r) => ({
      attachment_id: r.id,
      storage_key: r.storageKey,
      original_name: r.originalName,
      mime_type: r.mimeType,
      size_bytes: Number(r.sizeBytes),
    }));
}
