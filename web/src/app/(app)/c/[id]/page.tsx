import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getConversation, listFiles, listMessages } from "@/lib/repos";
import { ConversationView } from "./conversation-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const { id } = await params;
  const convo = await getConversation(id, user.id, user.organizationId);
  if (!convo) notFound();

  const [msgs, files] = await Promise.all([listMessages(id), listFiles(id)]);

  return (
    <ConversationView
      conversation={{
        id: convo.id,
        title: convo.title,
      }}
      initialMessages={msgs.map((m) => ({
        id: m.id,
        sender: m.senderType,
        content: m.content,
        createdAt: m.createdAt.toString(),
      }))}
      initialFiles={files.map((f) => ({
        id: f.id,
        name: f.originalName,
        mimeType: f.mimeType,
        sizeBytes: Number(f.sizeBytes),
        uploadComplete: f.uploadComplete,
      }))}
      orizonSubmitEnabled={process.env.ORIZON_SUBMIT_ENABLED === "true"}
    />
  );
}
