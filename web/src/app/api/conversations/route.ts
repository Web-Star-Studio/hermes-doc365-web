/**
 * POST /api/conversations  — create a new conversation.
 * GET  /api/conversations  — list conversations for the current user.
 */
import { auth } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/repos";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const items = await listConversations(
    session.user.id,
    session.user.organizationId,
  );
  return Response.json({ items });
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const convo = await createConversation(
    session.user.id,
    session.user.organizationId,
  );
  return Response.json({ id: convo.id }, { status: 201 });
}
