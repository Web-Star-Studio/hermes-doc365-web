"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, Send, Loader2, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";
import { t } from "@/lib/i18n/pt-BR";
import { QuickActions } from "@/components/quick-actions";
import { FileDropzone } from "@/components/file-dropzone";
import { ApprovalModal } from "@/components/approval-modal";
import type { ActionType } from "@/lib/adapter-client";

export interface UIMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface UIFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadComplete: boolean;
}

interface Props {
  conversation: { id: string; title: string };
  initialMessages: UIMessage[];
  initialFiles: UIFile[];
  orizonSubmitEnabled: boolean;
}

export function ConversationView({
  conversation,
  initialMessages,
  initialFiles,
  orizonSubmitEnabled,
}: Props) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [files, setFiles] = useState<UIFile[]>(initialFiles);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    action: ActionType;
    label: string;
    actionRequestId: string;
    idempotencyKey: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    queueMicrotask(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const [streamingAssistant, setStreamingAssistant] = useState<string>("");
  const [streamingStatus, setStreamingStatus] = useState<string>("");

  const sendTurn = useCallback(
    async (opts: {
      content: string;
      actionOrigin?: ActionType;
      approvalState?: "none" | "granted";
      actionRequestId?: string | null;
      idempotencyKey?: string | null;
    }) => {
      setError(null);
      setSending(true);
      setStreamingAssistant("");
      setStreamingStatus("");
      const now = new Date().toISOString();

      // Optimistic user message (only if there's actual content).
      if (opts.content.trim()) {
        setMessages((m) => [
          ...m,
          {
            id: `tmp-${Date.now()}`,
            sender: "user",
            content: opts.content,
            createdAt: now,
          },
        ]);
        scrollToBottom();
      }

      try {
        const res = await fetch(
          `/api/conversations/${conversation.id}/messages/stream`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "text/event-stream",
            },
            body: JSON.stringify({
              content: opts.content,
              action_origin: opts.actionOrigin ?? "chat",
              approval_state: opts.approvalState ?? "none",
              action_request_id: opts.actionRequestId ?? null,
              idempotency_key: opts.idempotencyKey ?? null,
            }),
          },
        );
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => "");
          throw new Error(body || res.statusText || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        let finalMessage = "";

        streamLoop: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, idx).replace(/\r$/, "");
            buffer = buffer.slice(idx + 1);
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim() || "message";
            } else if (line.startsWith("data:")) {
              const raw = line.slice(5).trim();
              if (!raw) continue;
              try {
                const payload = JSON.parse(raw);
                if (currentEvent === "step") {
                  setStreamingStatus(String(payload.description ?? ""));
                } else if (currentEvent === "tool_progress") {
                  setStreamingStatus(
                    `${payload.tool ?? "ferramenta"}${
                      payload.status ? `: ${payload.status}` : ""
                    }`,
                  );
                } else if (currentEvent === "message") {
                  if (payload.final) finalMessage = String(payload.content ?? "");
                  const content = String(payload.content ?? "");
                  if (content) setStreamingAssistant(content);
                } else if (currentEvent === "error") {
                  throw new Error(String(payload.message ?? "erro"));
                } else if (currentEvent === "done") {
                  break streamLoop;
                }
                scrollToBottom();
              } catch {
                // ignore non-JSON data
              }
            } else if (line === "") {
              currentEvent = "message";
            }
          }
        }

        // Finalise — server already persisted. Promote the tmp-* user bubble
        // to a stable id and append the assistant reply. Next page load will
        // pull authoritative rows from Postgres.
        if (finalMessage) {
          setMessages((m) => {
            const keptUser = m.map((x) =>
              x.id.startsWith("tmp-")
                ? { ...x, id: `local-user-${Date.now()}` }
                : x,
            );
            return [
              ...keptUser,
              {
                id: `local-asst-${Date.now()}`,
                sender: "assistant" as const,
                content: finalMessage,
                createdAt: new Date().toISOString(),
              },
            ];
          });
        }
        setStreamingAssistant("");
        setStreamingStatus("");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg.includes("503") || msg.toLowerCase().includes("adapter")
            ? t.status.adapterDown
            : t.errors.generic,
        );
        setMessages((m) => m.filter((x) => !x.id.startsWith("tmp-")));
        setStreamingAssistant("");
        setStreamingStatus("");
      } finally {
        setSending(false);
      }
    },
    [conversation.id, scrollToBottom],
  );

  async function onSubmitComposer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput("");
    await sendTurn({ content: trimmed });
  }

  const sideEffectActions = useMemo<ActionType[]>(
    () => ["submit_orizon"],
    [],
  );

  async function runAction(action: ActionType, label: string) {
    setError(null);

    // Create the action_request row first so we have an auditable id
    // regardless of whether this turn requires approval.
    let actionReq: {
      action_request_id: string;
      approval_required: boolean;
      idempotency_key: string;
    };
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action_type: action }),
      });
      if (!res.ok) throw new Error(await res.text());
      actionReq = await res.json();
    } catch (e) {
      console.error("create action_request failed", e);
      setError(t.errors.generic);
      return;
    }

    if (sideEffectActions.includes(action) || actionReq.approval_required) {
      setPendingApproval({
        action,
        label,
        actionRequestId: actionReq.action_request_id,
        idempotencyKey: actionReq.idempotency_key,
      });
      return;
    }

    await sendTurn({
      content: "",
      actionOrigin: action,
      actionRequestId: actionReq.action_request_id,
      idempotencyKey: actionReq.idempotency_key,
    });
  }

  async function confirmApproval() {
    if (!pendingApproval) return;
    const { action, actionRequestId, idempotencyKey } = pendingApproval;
    setPendingApproval(null);

    // 1. Flip approval_status → approved server-side (audit-logged).
    try {
      const res = await fetch(
        `/api/conversations/${conversation.id}/actions/${actionRequestId}/approve`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error("approve failed", e);
      setError(t.errors.generic);
      return;
    }

    // 2. Run the chat turn with approval_state=granted.
    await sendTurn({
      content: "",
      actionOrigin: action,
      approvalState: "granted",
      actionRequestId,
      idempotencyKey,
    });
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px]">
      {/* CENTER ── messages + composer */}
      <div className="flex flex-col min-h-0">
        <header className="border-b px-6 py-3">
          <h1 className="font-medium truncate">{conversation.title}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.composer.placeholder}
            </p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          {streamingAssistant && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 text-sm max-w-[78%] whitespace-pre-wrap bg-muted text-foreground">
                <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                  {t.conversations.hermesSaid}
                </p>
                {streamingAssistant}
                <span className="inline-block w-2 h-3 ml-0.5 bg-current opacity-60 animate-pulse" />
              </div>
            </div>
          )}
          {sending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />{" "}
              {streamingStatus || t.composer.waiting}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={onSubmitComposer}
          className="border-t bg-muted/10 px-6 py-3 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={t.composer.placeholder}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {sending ? t.composer.sending : t.composer.send}
          </Button>
        </form>
      </div>

      {/* RIGHT SIDEBAR ── files + quick actions */}
      <aside className="border-l bg-muted/10 flex flex-col min-h-0">
        <div className="p-4 border-b">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t.files.panelTitle}
          </p>
          <FileDropzone
            conversationId={conversation.id}
            onUploadedAction={(f) => setFiles((xs) => [...xs, f])}
          />
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-3">
              {t.files.empty}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {files.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2 text-xs",
                    !f.uploadComplete && "opacity-60",
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-muted-foreground">
                      {f.mimeType.split("/")[1]?.toUpperCase() ?? f.mimeType} •{" "}
                      {formatBytes(f.sizeBytes)}
                      {!f.uploadComplete ? ` • ${t.files.uploading}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t.actions.panelTitle}
          </p>
          <QuickActions
            orizonSubmitEnabled={orizonSubmitEnabled}
            disabled={sending}
            onActionAction={runAction}
          />
        </div>
      </aside>

      <ApprovalModal
        open={!!pendingApproval}
        action={pendingApproval?.action ?? null}
        label={pendingApproval?.label ?? ""}
        fileCount={files.filter((f) => f.uploadComplete).length}
        onConfirmAction={confirmApproval}
        onCancelAction={() => setPendingApproval(null)}
      />

      {/* tiny placeholder to silence unused imports in minimal mode */}
      <span className="sr-only">
        <Paperclip className="inline-block" />
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.sender === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm max-w-[78%] whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
          {isUser ? t.conversations.youSaid : t.conversations.hermesSaid}
        </p>
        {message.content}
      </div>
    </div>
  );
}
