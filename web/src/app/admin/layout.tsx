/**
 * Operator-only shell. The `middleware.ts` check already enforces role, but
 * we double-check here because middleware can be bypassed in dev via direct
 * fetches and defence-in-depth costs nothing.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";

import { auth } from "@/lib/auth";
import { t } from "@/lib/i18n/pt-BR";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "operator") redirect("/");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-3">
          <Shield className="h-5 w-5 text-amber-600" />
          <h1 className="text-sm font-semibold">{t.admin.title}</h1>
          <div className="flex-1" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> {t.app.name}
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
