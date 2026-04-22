import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createConversation } from "@/lib/repos";

// Server component that creates a conversation on hit and redirects to it.
// Using a server component keeps the UX to a single click in the sidebar.
export default async function NewConversationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const convo = await createConversation(user.id, user.organizationId);
  redirect(`/c/${convo.id}`);
}
