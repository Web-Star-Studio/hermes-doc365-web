import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n/pt-BR";

export const metadata: Metadata = {
  title: `${t.app.name} — ${t.app.tagline}`,
  description: t.app.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
