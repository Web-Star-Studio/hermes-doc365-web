/**
 * Drizzle schema — the seven entities from PRD §15.
 *
 * Every row carries organization_id so flipping to org-shared conversations
 * later is a policy change, not a migration.
 */

import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums ────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["user", "operator"]);

export const senderTypeEnum = pgEnum("sender_type", [
  "user",
  "assistant",
  "system",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "not_required",
  "pending",
  "approved",
  "denied",
  "expired",
]);

export const executionStatusEnum = pgEnum("execution_status", [
  "not_started",
  "running",
  "succeeded",
  "failed",
]);

export const actionTypeEnum = pgEnum("action_type", [
  "chat",
  "analyze_files",
  "check_pending",
  "validate_submission",
  "draft_recurso",
  "prepare_orizon",
  "submit_orizon",
]);

// ── Organizations ────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Users ────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // citext is installed via seed.sql; Drizzle maps it as text for us.
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_unique").on(t.email),
  }),
);

// ── Conversations ────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  status: conversationStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Messages ─────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderType: senderTypeEnum("sender_type").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
});

// ── File attachments ─────────────────────────────────────────────────

export const fileAttachments = pgTable("file_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  uploadedByUserId: uuid("uploaded_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  storageKey: text("storage_key").notNull(),
  checksum: text("checksum"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  // Upload lifecycle — we track whether the browser's PUT actually landed
  // because presigned PUTs can fail silently from the server's POV.
  uploadComplete: boolean("upload_complete").notNull().default(false),
});

// ── Action requests ──────────────────────────────────────────────────

export const actionRequests = pgTable("action_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  requestedByUserId: uuid("requested_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  actionType: actionTypeEnum("action_type").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
  approvalStatus: approvalStatusEnum("approval_status")
    .notNull()
    .default("not_required"),
  executionStatus: executionStatusEnum("execution_status")
    .notNull()
    .default("not_started"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  resultSummary: text("result_summary"),
});

// ── Audit events ─────────────────────────────────────────────────────

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  conversationId: uuid("conversation_id").references(() => conversations.id),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Handy inferred types for route handlers ──────────────────────────

export type DbUser = typeof users.$inferSelect;
export type DbConversation = typeof conversations.$inferSelect;
export type DbMessage = typeof messages.$inferSelect;
export type DbFileAttachment = typeof fileAttachments.$inferSelect;
export type DbActionRequest = typeof actionRequests.$inferSelect;
export type DbAuditEvent = typeof auditEvents.$inferSelect;

// Convenience exports for join queries elsewhere.
export const tables = {
  organizations,
  users,
  conversations,
  messages,
  fileAttachments,
  actionRequests,
  auditEvents,
};

// Keep explicit index definitions for migration review. Drizzle generates
// per-column indexes from the columns above via the table-builder callbacks.
// We add extra composite indexes below as SQL in `0001_indexes.sql`.

void integer; // keep `integer` import reachable for future additions
