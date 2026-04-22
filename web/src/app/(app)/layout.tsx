import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Shield, LogOut, MessageSquare } from "lucide-react";

import { auth, signOut } from "@/lib/auth";
import { listConversations } from "@/lib/repos";
import { t } from "@/lib/i18n/pt-BR";
import { Button } from "@/components/ui/button";
import { cn, formatPtBrDate } from "@/lib/utils";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const items = await listConversations(user.id, user.organizationId);

  async function doLogout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground grid grid-cols-[260px_1fr]">
      {/* LEFT SIDEBAR ── conversations */}
      <aside className="border-r bg-muted/20 flex flex-col min-h-0">
        <div className="p-3">
          <Button asChild className="w-full" size="sm">
            <Link href="/conversations/new">
              <Plus className="h-4 w-4" /> {t.nav.newConversation}
            </Link>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          <p className="px-2 pt-2 pb-1 text-xs uppercase text-muted-foreground tracking-wide">
            {t.nav.conversations}
          </p>
          {items.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              {t.conversations.emptyTitle}
            </p>
          ) : (
            items.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.id}`}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent",
                )}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">
                    {c.title ?? t.conversations.untitled}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.conversations.updatedAt}{" "}
                    {formatPtBrDate(new Date(c.updatedAt))}
                  </span>
                </span>
              </Link>
            ))
          )}
        </nav>

        <footer className="border-t p-3 space-y-1">
          {user.role === "operator" && (
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href="/admin">
                <Shield className="h-4 w-4" /> {t.nav.admin}
              </Link>
            </Button>
          )}
          <div className="flex items-center gap-2 justify-between min-w-0 px-2 pt-1">
            <p className="text-xs text-muted-foreground truncate min-w-0">
              {user.email}
            </p>
            <form action={doLogout} className="shrink-0">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={t.auth.logout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </footer>
      </aside>

      {/* MAIN PANEL ── children render the chat or conversations home */}
      <section className="min-h-0 flex flex-col">{children}</section>
    </div>
  );
}
