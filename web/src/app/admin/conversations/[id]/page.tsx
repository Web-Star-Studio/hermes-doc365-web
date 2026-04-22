import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getConversationForOperator,
  listActionRequests,
  listAuditEvents,
  listFiles,
  listMessages,
} from "@/lib/repos";
import { t } from "@/lib/i18n/pt-BR";
import { formatBytes, formatPtBrDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminConversationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const convo = await getConversationForOperator(id);
  if (!convo) notFound();

  const [msgs, files, actions, audits] = await Promise.all([
    listMessages(id),
    listFiles(id),
    listActionRequests(id),
    listAuditEvents(id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← {t.admin.conversations}
        </Link>
        <h2 className="mt-1 text-lg font-semibold">
          {convo.title ?? t.conversations.untitled}
        </h2>
        <p className="text-xs text-muted-foreground">
          ID: {convo.id} · {t.conversations.updatedAt}{" "}
          {formatPtBrDate(new Date(convo.updatedAt))}
        </p>
      </div>

      {/* Messages */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Mensagens</h3>
        {msgs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma mensagem.</p>
        ) : (
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className="rounded-md border p-3 text-sm">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  {m.senderType === "user"
                    ? t.conversations.youSaid
                    : m.senderType === "assistant"
                      ? t.conversations.hermesSaid
                      : "Sistema"}{" "}
                  · {formatPtBrDate(new Date(m.createdAt))}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Files */}
      <section>
        <h3 className="text-sm font-semibold mb-2">{t.admin.files}</h3>
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.files.empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {files.map((f) => (
              <li
                key={f.id}
                className="rounded-md border p-2 text-xs flex items-center gap-3"
              >
                <span className="font-medium truncate flex-1">
                  {f.originalName}
                </span>
                <span className="text-muted-foreground">
                  {f.mimeType} · {formatBytes(f.sizeBytes)}
                  {f.uploadComplete ? " · ✓" : " · pendente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Action requests */}
      <section>
        <h3 className="text-sm font-semibold mb-2">{t.admin.actionHistory}</h3>
        {actions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma ação registrada.
          </p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">Ação</th>
                  <th className="text-left p-2 font-medium">Aprovação</th>
                  <th className="text-left p-2 font-medium">Execução</th>
                  <th className="text-left p-2 font-medium">Solicitada</th>
                  <th className="text-left p-2 font-medium">Executada</th>
                  <th className="text-left p-2 font-medium">Resumo</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 font-medium">{a.actionType}</td>
                    <td className="p-2">{a.approvalStatus}</td>
                    <td className="p-2">{a.executionStatus}</td>
                    <td className="p-2 text-muted-foreground">
                      {formatPtBrDate(new Date(a.requestedAt))}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {a.executedAt
                        ? formatPtBrDate(new Date(a.executedAt))
                        : "—"}
                    </td>
                    <td className="p-2 text-muted-foreground max-w-xs truncate">
                      {a.resultSummary ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit */}
      <section>
        <h3 className="text-sm font-semibold mb-2">{t.admin.audit}</h3>
        {audits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum evento de auditoria.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {audits.map((a) => (
              <li
                key={a.id}
                className="rounded-md border p-2 text-xs flex items-baseline gap-3"
              >
                <span className="font-mono">{a.actionType}</span>
                <span className="text-muted-foreground">
                  {a.targetType}
                  {a.targetId ? ` ${a.targetId.slice(0, 8)}` : ""}
                </span>
                <span className="flex-1" />
                <span className="text-muted-foreground">
                  {formatPtBrDate(new Date(a.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
