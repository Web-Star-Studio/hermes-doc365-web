import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/repos";
import { t } from "@/lib/i18n/pt-BR";
import { Button } from "@/components/ui/button";
import { formatPtBrDate } from "@/lib/utils";

export default async function ConversationsHomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const items = await listConversations(user.id, user.organizationId);

  return (
    <main className="flex-1 p-8 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{t.nav.conversations}</h1>
          <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-lg border p-10 text-center space-y-4">
            <h2 className="text-lg font-medium">{t.conversations.emptyTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {t.conversations.emptyBody}
            </p>
            <Button asChild>
              <Link href="/conversations/new">
                <MessageSquarePlus className="h-4 w-4" />{" "}
                {t.conversations.createButton}
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.id}`}
                  className="block px-4 py-3 hover:bg-accent"
                >
                  <p className="font-medium">
                    {c.title ?? t.conversations.untitled}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.conversations.updatedAt}{" "}
                    {formatPtBrDate(new Date(c.updatedAt))}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
