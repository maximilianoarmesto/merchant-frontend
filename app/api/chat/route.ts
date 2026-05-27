import { NextRequest } from "next/server";
import type { ChatAdapter, ChatMessage } from "@/lib/chat-adapter";
import { OpenAIAdapter } from "@/lib/openai-adapter";
import { AnthropicAdapter } from "@/lib/anthropic-adapter";
import { commerceTools } from "@/lib/chat-tools";

export const runtime = "nodejs";

export type ChatProvider = "openai" | "anthropic";

export interface ChatRouteBody {
  messages: ChatMessage[];
  provider: ChatProvider;
  apiKey: string;
  model: string;
  conversationId?: string;
}

export type AdapterResolver = (provider: ChatProvider) => ChatAdapter;

const defaultResolver: AdapterResolver = (provider) => {
  if (provider === "openai") return new OpenAIAdapter();
  if (provider === "anthropic") return new AnthropicAdapter();
  throw new Error(`Unknown provider: ${provider}`);
};

interface ValidationError {
  status: number;
  code: string;
  message: string;
}

function validateBody(raw: unknown): ChatRouteBody | ValidationError {
  if (!raw || typeof raw !== "object") {
    return { status: 400, code: "invalid_body", message: "Request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;
  const { messages, provider, apiKey, model } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, code: "invalid_messages", message: "messages must be a non-empty array" };
  }
  for (const m of messages) {
    if (!m || typeof m !== "object") {
      return { status: 400, code: "invalid_messages", message: "each message must be an object with role and content" };
    }
    const mm = m as Record<string, unknown>;
    if (typeof mm.content !== "string") {
      return { status: 400, code: "invalid_messages", message: "each message must have a string content" };
    }
    if (mm.role !== "system" && mm.role !== "user" && mm.role !== "assistant") {
      return { status: 400, code: "invalid_messages", message: "each message role must be system|user|assistant" };
    }
  }
  if (provider !== "openai" && provider !== "anthropic") {
    return { status: 400, code: "invalid_provider", message: "provider must be 'openai' or 'anthropic'" };
  }
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { status: 400, code: "missing_api_key", message: "apiKey must be a non-empty string" };
  }
  if (typeof model !== "string" || model.length === 0) {
    return { status: 400, code: "invalid_model", message: "model must be a non-empty string" };
  }

  return {
    messages: messages as ChatMessage[],
    provider,
    apiKey,
    model,
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
  };
}

function isValidationError(v: ChatRouteBody | ValidationError): v is ValidationError {
  return (v as ValidationError).code !== undefined && (v as ValidationError).status !== undefined;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function classifyUpstreamError(err: unknown): { status: number; code: string; message: string } {
  const e = err as { status?: number; message?: string; name?: string };
  const raw = typeof e?.message === "string" ? e.message : String(err);
  if (e?.status === 401 || /401|unauthorized|invalid.*api.?key/i.test(raw)) {
    return { status: 401, code: "invalid_api_key", message: "Invalid or unauthorized API key" };
  }
  if (e?.status === 403 || /403|forbidden/i.test(raw)) {
    return { status: 403, code: "forbidden", message: "Provider rejected the request" };
  }
  if (typeof e?.status === "number" && e.status >= 400 && e.status < 500) {
    return { status: e.status, code: "provider_request_error", message: raw };
  }
  return { status: 502, code: "provider_error", message: raw };
}

export function createChatRouteHandler(
  resolveAdapter: AdapterResolver = defaultResolver
) {
  return async function POST(request: NextRequest): Promise<Response> {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError(400, "invalid_json", "Request body is not valid JSON");
    }

    const parsed = validateBody(raw);
    if (isValidationError(parsed)) {
      return jsonError(parsed.status, parsed.code, parsed.message);
    }

    let adapter: ChatAdapter;
    try {
      adapter = resolveAdapter(parsed.provider);
    } catch (err) {
      return jsonError(500, "provider_misconfigured", (err as Error).message);
    }

    let iterator: AsyncIterator<string>;
    try {
      const iterable = adapter.stream(parsed.messages, commerceTools, parsed.apiKey, parsed.model);
      iterator = iterable[Symbol.asyncIterator]();
    } catch (err) {
      const c = classifyUpstreamError(err);
      return jsonError(c.status, c.code, c.message);
    }

    let first: IteratorResult<string>;
    try {
      first = await iterator.next();
    } catch (err) {
      const c = classifyUpstreamError(err);
      return jsonError(c.status, c.code, c.message);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        const sendEvent = (event: string, data: string) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        try {
          if (!first.done) {
            send(JSON.stringify({ delta: first.value }));
          }
          for (;;) {
            const next = await iterator.next();
            if (next.done) break;
            send(JSON.stringify({ delta: next.value }));
          }
          send("[DONE]");
        } catch (err) {
          const c = classifyUpstreamError(err);
          sendEvent("error", JSON.stringify({ error: c.message, code: c.code }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  };
}

export const POST = createChatRouteHandler();
