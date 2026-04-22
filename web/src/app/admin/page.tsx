import Link from "next/link";

import { listConversationsForOperator } from "@/lib/repos";
import { t } from "@/lib/i18n/pt-BR";
import { formatPtBrDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const items = await listConversationsForOperator();
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.admin.conversations}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t.conversations.emptyTitle}
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Conversa</th>
                <th className="text-left p-2 font-medium">Usuário</th>
                <th className="text-left p-2 font-medium">Organização</th>
                <th className="text-left p-2 font-medium">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t hover:bg-accent/40">
                  <td className="p-2">
                    <Link
                      href={`/admin/conversations/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      {c.title ?? t.conversations.untitled}
                    </Link>
                  </td>
                  <td className="p-2 text-muted-foreground">{c.userEmail}</td>
                  <td className="p-2 text-muted-foreground">{c.orgName}</td>
                  <td className="p-2 text-muted-foreground">
                    {formatPtBrDate(new Date(c.updatedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
