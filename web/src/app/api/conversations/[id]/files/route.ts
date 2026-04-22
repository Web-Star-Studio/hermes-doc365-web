/**
 * POST /api/conversations/:id/files — presign a PUT URL + create a pending
 * `file_attachments` row. Completion is confirmed via the sibling
 * /complete route after the browser's PUT succeeds.
 *
 * Rejects unsupported mime types and oversize uploads client- and server-side.
 */

import { z } from "zod";
import { db } from "@/db";
import { fileAttachments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getConversation } from "@/lib/repos";
import {
  buildStorageKey,
  getPresignedPutUrl,
} from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

const ACCEPTED = new Set([
  "application/xml",
  "text/xml",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

const bodySchema = z.object({
  original_name: z.string().min(1).max(255),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
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

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!ACCEPTED.has(payload.mime_type)) {
    return Response.json(
      { error: "unsupported_mime" },
      { status: 415 },
    );
  }
  if (payload.size_bytes > MAX_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }

  const storageKey = buildStorageKey({
    orgId: user.organizationId,
    conversationId: id,
    originalName: payload.original_name,
  });

  const [row] = await db
    .insert(fileAttachments)
    .values({
      conversationId: id,
      uploadedByUserId: user.id,
      originalName: payload.original_name,
      mimeType: payload.mime_type,
      sizeBytes: payload.size_bytes,
      storageKey,
      uploadComplete: false,
    })
    .returning();

  const uploadUrl = await getPresignedPutUrl({
    key: storageKey,
    contentType: payload.mime_type,
    contentLengthBytes: payload.size_bytes,
  });

  return Response.json({
    attachment_id: row.id,
    storage_key: row.storageKey,
    upload_url: uploadUrl,
  });
}
