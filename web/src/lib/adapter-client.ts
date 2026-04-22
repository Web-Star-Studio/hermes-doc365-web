/**
 * Typed HTTP client used by Next.js to call the FastAPI Hermes adapter.
 *
 * - Signs every request body with HMAC-SHA256 keyed on ADAPTER_HMAC_SECRET.
 * - Matches the header scheme expected by `adapter/src/adapter/signing.py`.
 * - Auth.js session secret is NEVER shared with the adapter.
 */

import { createHmac } from "node:crypto";

type HistorySender = "user" | "assistant" | "system";
type ApprovalState = "none" | "pending" | "granted" | "denied";

export type ActionType =
  | "chat"
  | "analyze_files"
  | "check_pending"
  | "validate_submission"
  | "draft_recurso"
  | "prepare_orizon"
  | "submit_orizon";

export interface AdapterHistoryMessage {
  sender: HistorySender;
  content: string;
}

export interface AdapterFileRef {
  attachment_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface AdapterUserContext {
  user_id: string;
  organization_id: string;
  role: "user" | "operator";
}

export interface AdapterChatRequest {
  conversation_id: string;
  user: AdapterUserContext;
  user_message: string;
  history: AdapterHistoryMessage[];
  files: AdapterFileRef[];
  action_origin: ActionType;
  approval_state: ApprovalState;
  action_request_id?: string | null;
  idempotency_key?: string | null;
}

export interface AdapterChatResponse {
  assistant_message: string;
  usage: Record<string, number> | null;
  action_executed: boolean;
  action_result_summary: string | null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function sign(secret: string, timestamp: string, body: string): string {
  const h = createHmac("sha256", secret);
  h.update(timestamp);
  h.update(".");
  h.update(body);
  return `sha256=${h.digest("hex")}`;
}

export async function postChat(
  payload: AdapterChatRequest,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<AdapterChatResponse> {
  const base = requireEnv("ADAPTER_URL");
  const secret = requireEnv("ADAPTER_HMAC_SECRET");
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign(secret, timestamp, body);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 120_000);
  if (opts?.signal) {
    opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  try {
    const res = await fetch(`${base}/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-doc365-signature": signature,
        "x-doc365-timestamp": timestamp,
      },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AdapterError(res.status, text || res.statusText);
    }
    return (await res.json()) as AdapterChatResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Open an SSE connection to the adapter's `/chat/stream` endpoint.
 * Returns the raw Fetch `Response` whose body the caller pipes to the
 * browser (typically via a Next.js route handler).
 *
 * We return the `Response` rather than parsing SSE server-side so the
 * route handler can use `ReadableStream` piping and keep the hop thin.
 */
export async function postChatStream(
  payload: AdapterChatRequest,
  opts?: { signal?: AbortSignal },
): Promise<Response> {
  const base = requireEnv("ADAPTER_URL");
  const secret = requireEnv("ADAPTER_HMAC_SECRET");
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign(secret, timestamp, body);

  const res = await fetch(`${base}/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "text/event-stream",
      "x-doc365-signature": signature,
      "x-doc365-timestamp": timestamp,
    },
    body,
    signal: opts?.signal,
    // Long-lived stream; disable the usual cache paths.
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    const text = !res.ok ? await res.text().catch(() => "") : "no body";
    throw new AdapterError(res.status, text || res.statusText);
  }
  return res;
}

export class AdapterError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`adapter ${status}: ${body}`);
    this.name = "AdapterError";
  }
}
