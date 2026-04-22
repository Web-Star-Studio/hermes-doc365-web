/**
 * PATCH /api/conversations/:id — update conversation fields (title).
 */
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getConversation, updateConversationTitle } from "@/lib/repos";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().max(200).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const user = session.user;

  const { id } = await ctx.params;
  const convo = await getConversation(id, user.id, user.organizationId);
  if (!convo) return new Response("Not Found", { status: 404 });

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (parsed.title === undefined) {
    return new Response("Bad Request", { status: 400 });
  }

  const trimmed = parsed.title.trim();
  const title = trimmed.length > 0 ? trimmed : null;

  const ok = await updateConversationTitle(id, user.id, user.organizationId, title);
  if (!ok) return new Response("Not Found", { status: 404 });

  return Response.json({ title });
}
