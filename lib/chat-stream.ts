import type { ChatMessage } from "@/lib/chat-adapter";
import type { StoredMessage } from "@/lib/conversation-store";

/**
 * Event protocol consumed by the chat message renderer. A {@link ChatStreamer}
 * yields these as the assistant reply is produced:
 *  - `text`     — a chunk of assistant text to append to the live bubble
 *  - `tool`     — a tool execution has STARTED (drives the loading indicator)
 *  - `tool_end` — the named tool finished
 *  - `error`    — the stream failed (the consumer should stop and surface it)
 */
export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string }
  | { type: "tool_end"; tool: string }
  | { type: "error"; message: string };

/**
 * Produces the assistant reply for a conversation as a stream of events.
 * Injected into ChatPanel so tests can drive it deterministically; the default
 * production implementation is {@link createApiChatStreamer}.
 */
export type ChatStreamer = (
  messages: StoredMessage[],
  signal?: AbortSignal
) => AsyncIterable<ChatStreamEvent>;

/**
 * Human-facing labels for the "thinking" indicator, keyed by the commerce tool
 * name (see lib/chat-tools.ts). Unknown tools fall back to a generic label.
 */
export const TOOL_LABELS: Record<string, string> = {
  list_products: "🔍 Browsing catalog…",
  get_product: "🔍 Looking up product…",
  create_checkout_session: "🛒 Creating checkout session…",
  process_payment: "💳 Processing payment…",
  list_orders: "📦 Fetching your orders…",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? `⚙️ Running ${tool}…`;
}

/**
 * Translate persisted StoredMessages into the adapter's ChatMessage shape:
 * drops timestamps and folds the `tool` role into `assistant` (the adapter
 * protocol has no user-visible `tool` role — see the StoredMessage vs
 * ChatMessage decision entry).
 */
export function storedToChatMessages(messages: StoredMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.content,
  }));
}

export interface ApiChatStreamerOptions {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Default streamer: POSTs the conversation to `/api/chat` and parses the SSE
 * wire format (`data: {"delta":"..."}` frames, `data: [DONE]` terminator,
 * `event: error` frames) into {@link ChatStreamEvent}s.
 *
 * NOTE: the current /api/chat route only emits text deltas — it does not
 * surface tool-execution boundaries — so this default never yields `tool`
 * events. The tool indicator is still fully supported by the protocol and is
 * exercised via an injected streamer; wiring tool events through the route is a
 * follow-up task.
 */
export function createApiChatStreamer(
  opts: ApiChatStreamerOptions
): ChatStreamer {
  const endpoint = opts.endpoint ?? "/api/chat";
  const doFetch = opts.fetchImpl ?? fetch;

  return async function* (messages, signal) {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: storedToChatMessages(messages),
        provider: opts.provider,
        apiKey: opts.apiKey,
        model: opts.model,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      let message = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) message = String(data.error);
      } catch {
        /* keep default */
      }
      yield { type: "error", message };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are delimited by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseSseFrame(frame);
        if (event) {
          if (event.kind === "done") return;
          if (event.kind === "delta") yield { type: "text", delta: event.delta };
          if (event.kind === "error")
            yield { type: "error", message: event.message };
        }
      }
    }
  };
}

type ParsedFrame =
  | { kind: "delta"; delta: string }
  | { kind: "error"; message: string }
  | { kind: "done" }
  | null;

function parseSseFrame(frame: string): ParsedFrame {
  const lines = frame.split("\n");
  let isError = false;
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      isError = line.slice(6).trim() === "error";
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }
  if (data === "") return null;
  if (data === "[DONE]") return { kind: "done" };
  try {
    const parsed = JSON.parse(data);
    if (isError) {
      return { kind: "error", message: String(parsed.error ?? "stream error") };
    }
    if (typeof parsed.delta === "string") {
      return { kind: "delta", delta: parsed.delta };
    }
  } catch {
    return null;
  }
  return null;
}
