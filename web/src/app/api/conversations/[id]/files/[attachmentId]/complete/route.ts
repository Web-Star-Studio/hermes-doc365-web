/**
 * POST /api/conversations/:id/files/:attachmentId/complete
 *
 * The browser calls this after its presigned PUT succeeds so the server can
 * (a) confirm the object actually landed in S3 via a HEAD request, and
 * (b) flip `upload_complete=true` so the envelope builder includes it.
 *
 * The HEAD also gives us the real byte size — we compare against what the
 * client claimed at presign time and refuse if they mismatch too much.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fileAttachments } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getConversation } from "@/lib/repos";
import { headObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const user = session.user;

  const { id, attachmentId } = await ctx.params;
  const convo = await getConversation(id, user.id, user.organizationId);
  if (!convo) return new Response("Not Found", { status: 404 });

  const rows = await db
    .select()
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.id, attachmentId),
        eq(fileAttachments.conversationId, id),
      ),
    )
    .limit(1);

  const attachment = rows[0];
  if (!attachment) return new Response("Not Found", { status: 404 });
  if (attachment.uploadedByUserId !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  // Confirm the object actually exists in S3 before we promise callers it does.
  const head = await headObject(attachment.storageKey);
  if (!head) {
    return Response.json(
      { error: "upload_not_found" },
      { status: 409 },
    );
  }

  // Size sanity-check: if the client lied at presign time the payer-rule
  // engine downstream could trip on truncation. Allow a tiny variance to
  // accommodate S3 rounding but no more than ~1%.
  const claimed = attachment.sizeBytes;
  const actual = head.size;
  const delta = Math.abs(actual - claimed);
  if (delta > 1024 && delta / Math.max(claimed, 1) > 0.01) {
    return Response.json(
      { error: "size_mismatch", claimed, actual },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(fileAttachments)
    .set({
      uploadComplete: true,
      sizeBytes: actual,
    })
    .where(eq(fileAttachments.id, attachmentId))
    .returning();

  return Response.json({
    id: updated.id,
    original_name: updated.originalName,
    mime_type: updated.mimeType,
    size_bytes: updated.sizeBytes,
    upload_complete: updated.uploadComplete,
  });
}
