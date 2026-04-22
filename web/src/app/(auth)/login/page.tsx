import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { t } from "@/lib/i18n/pt-BR";

export const metadata: Metadata = { title: `${t.auth.loginTitle} — ${t.app.name}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/conversations");

  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border bg-background shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t.auth.loginTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.auth.loginSubtitle}
          </p>
        </div>
        <LoginForm nextHref={params.next} initialError={params.error} />
        <p className="text-center text-xs text-muted-foreground">
          {t.app.footer}
        </p>
      </div>
    </main>
  );
}
