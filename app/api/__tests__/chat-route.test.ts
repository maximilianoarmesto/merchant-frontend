/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  createChatRouteHandler,
  type AdapterResolver,
  type ChatProvider,
} from "../chat/route";
import type {
  ChatAdapter,
  ChatMessage,
  ToolDefinition,
} from "@/lib/chat-adapter";

interface AdapterCall {
  provider: ChatProvider;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  apiKey: string;
  model: string;
}

interface FakeAdapterOptions {
  turns?: string[][];
  throwOn?: "construct" | "stream" | "first" | "mid";
  errorStatus?: number;
  errorMessage?: string;
}

function makeFakeAdapter(
  provider: ChatProvider,
  recorder: AdapterCall[],
  opts: FakeAdapterOptions = {}
): ChatAdapter {
  const turns = opts.turns ?? [["chunk-1", "chunk-2"]];
  return {
    stream(messages, tools, apiKey, model) {
      recorder.push({ provider, messages, tools, apiKey, model });
      if (opts.throwOn === "stream") {
        const err = new Error(opts.errorMessage ?? "stream-construct-failure") as Error & { status?: number };
        if (opts.errorStatus) err.status = opts.errorStatus;
        throw err;
      }
      return {
        async *[Symbol.asyncIterator]() {
          for (let t = 0; t < turns.length; t++) {
            for (let i = 0; i < turns[t].length; i++) {
              if (opts.throwOn === "first" && t === 0 && i === 0) {
                const err = new Error(opts.errorMessage ?? "first-iter-failure") as Error & { status?: number };
                if (opts.errorStatus) err.status = opts.errorStatus;
                throw err;
              }
              if (opts.throwOn === "mid" && t === 0 && i === 1) {
                const err = new Error(opts.errorMessage ?? "mid-iter-failure") as Error & { status?: number };
                if (opts.errorStatus) err.status = opts.errorStatus;
                throw err;
              }
              yield turns[t][i];
            }
          }
        },
      };
    },
  };
}

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string> {
  expect(res.body).not.toBeNull();
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function parseSse(text: string): { events: Array<{ event?: string; data: string }>; raw: string } {
  const events: Array<{ event?: string; data: string }> = [];
  const frames = text.split("\n\n");
  for (const frame of frames) {
    if (!frame.trim()) continue;
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, raw: text };
}

const VALID_BODY = {
  messages: [{ role: "user" as const, content: "hi" }],
  provider: "openai" as ChatProvider,
  apiKey: "sk-test-secret-xyz",
  model: "gpt-4o-mini",
};

describe("POST /api/chat — body schema (AC ac-1)", () => {
  it("accepts a body with messages, provider, apiKey, model and returns 200", async () => {
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["hello"]] })
    );
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages).toEqual(VALID_BODY.messages);
    expect(calls[0].model).toBe(VALID_BODY.model);
    expect(calls[0].apiKey).toBe(VALID_BODY.apiKey);
    await readStream(res);
  });

  it("rejects body missing messages", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest({ ...VALID_BODY, messages: undefined }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_messages");
  });

  it("rejects body missing apiKey", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest({ ...VALID_BODY, apiKey: undefined }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("missing_api_key");
  });

  it("rejects body missing model", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest({ ...VALID_BODY, model: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON body", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest("not-json{"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_json");
  });
});

describe("POST /api/chat — streaming response (AC ac-2)", () => {
  it("returns a text/event-stream response with chunks delivered as SSE data frames", async () => {
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["alpha", "beta", "gamma"]] })
    );
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
    const text = await readStream(res);
    const { events } = parseSse(text);
    const deltas: string[] = [];
    let sawDone = false;
    for (const ev of events) {
      if (ev.data === "[DONE]") {
        sawDone = true;
        continue;
      }
      const parsed = JSON.parse(ev.data) as { delta?: string };
      if (parsed.delta) deltas.push(parsed.delta);
    }
    expect(deltas).toEqual(["alpha", "beta", "gamma"]);
    expect(sawDone).toBe(true);
  });
});

describe("POST /api/chat — provider routing (AC ac-3)", () => {
  it("routes to the OpenAI adapter when provider === 'openai'", async () => {
    const calls: AdapterCall[] = [];
    let openaiBuilt = 0;
    let anthropicBuilt = 0;
    const resolver: AdapterResolver = (p) => {
      if (p === "openai") {
        openaiBuilt++;
        return makeFakeAdapter(p, calls, { turns: [["x"]] });
      }
      anthropicBuilt++;
      return makeFakeAdapter(p, calls, { turns: [["y"]] });
    };
    const handler = createChatRouteHandler(resolver);
    const res = await handler(buildRequest({ ...VALID_BODY, provider: "openai" }));
    await readStream(res);
    expect(openaiBuilt).toBe(1);
    expect(anthropicBuilt).toBe(0);
    expect(calls[0].provider).toBe("openai");
  });

  it("routes to the Anthropic adapter when provider === 'anthropic'", async () => {
    const calls: AdapterCall[] = [];
    let openaiBuilt = 0;
    let anthropicBuilt = 0;
    const resolver: AdapterResolver = (p) => {
      if (p === "openai") {
        openaiBuilt++;
        return makeFakeAdapter(p, calls, { turns: [["x"]] });
      }
      anthropicBuilt++;
      return makeFakeAdapter(p, calls, { turns: [["y"]] });
    };
    const handler = createChatRouteHandler(resolver);
    const res = await handler(buildRequest({
      ...VALID_BODY,
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    }));
    await readStream(res);
    expect(anthropicBuilt).toBe(1);
    expect(openaiBuilt).toBe(0);
    expect(calls[0].provider).toBe("anthropic");
  });

  it("rejects an unknown provider with 400", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest({ ...VALID_BODY, provider: "google" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_provider");
  });
});

describe("POST /api/chat — tool propagation (AC ac-4)", () => {
  it("streams deltas from a multi-turn loop where the adapter calls a tool and resumes", async () => {
    // The fake adapter yields two turns. This mirrors the adapter's internal
    // behavior of: emit some text -> run a tool -> emit final text. From the
    // route's perspective, both turns' deltas must reach the consumer in the
    // SAME request cycle (no second client roundtrip).
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["before-tool"], ["after-tool"]] })
    );
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const text = await readStream(res);
    const { events } = parseSse(text);
    const deltas = events
      .filter((e) => e.data !== "[DONE]")
      .map((e) => (JSON.parse(e.data) as { delta?: string }).delta)
      .filter((d): d is string => typeof d === "string");
    expect(deltas).toEqual(["before-tool", "after-tool"]);
  });

  it("forwards the commerceTools array to the adapter so tools are available to the LLM", async () => {
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["ok"]] })
    );
    const res = await handler(buildRequest(VALID_BODY));
    await readStream(res);
    const { commerceTools } = await import("@/lib/chat-tools");
    expect(calls[0].tools).toBe(commerceTools);
    expect(calls[0].tools.length).toBeGreaterThan(0);
    expect(calls[0].tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "list_products",
        "get_product",
        "create_checkout_session",
        "process_payment",
        "list_orders",
      ])
    );
  });
});

describe("POST /api/chat — structured non-streaming error (AC ac-5)", () => {
  it("returns 401 JSON when the adapter throws an auth-like error before any chunk", async () => {
    const handler = createChatRouteHandler((p) =>
      makeFakeAdapter(p, [], {
        turns: [["never"]],
        throwOn: "first",
        errorStatus: 401,
        errorMessage: "401 Incorrect API key provided",
      })
    );
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.code).toBe("invalid_api_key");
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 JSON (non-stream) when provider is misconfigured", async () => {
    const handler = createChatRouteHandler(() => {
      throw new Error("unreachable resolver");
    });
    // Body validation rejects 'google' before the resolver runs.
    const res = await handler(buildRequest({ ...VALID_BODY, provider: "google" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.code).toBe("invalid_provider");
  });

  it("returns 500 JSON when the resolver throws for a syntactically valid provider", async () => {
    const handler = createChatRouteHandler(() => {
      throw new Error("resolver-broken");
    });
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.code).toBe("provider_misconfigured");
  });

  it("returns 502 JSON when the adapter throws synchronously on stream() before any chunk", async () => {
    const handler = createChatRouteHandler((p) =>
      makeFakeAdapter(p, [], {
        turns: [["never"]],
        throwOn: "stream",
        errorMessage: "upstream-network-error",
      })
    );
    const res = await handler(buildRequest(VALID_BODY));
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.code).toBe("provider_error");
  });
});

describe("POST /api/chat — does not store or log the API key (AC ac-6)", () => {
  const SECRET = "sk-super-secret-9999";

  it("never writes the apiKey to console (logs/warns/errors)", async () => {
    const captured: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => {
      const orig = console[m];
      const spy = (...args: unknown[]) => {
        captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      };
      (console as unknown as Record<string, unknown>)[m] = spy as unknown;
      return { m, orig };
    });
    try {
      const handler = createChatRouteHandler((p) =>
        makeFakeAdapter(p, [], {
          turns: [["never"]],
          throwOn: "first",
          errorStatus: 401,
          errorMessage: `401 Incorrect API key provided: ${SECRET}`,
        })
      );
      const res = await handler(buildRequest({ ...VALID_BODY, apiKey: SECRET }));
      await res.text().catch(() => undefined);
    } finally {
      for (const s of spies) (console as unknown as Record<string, unknown>)[s.m] = s.orig;
    }
    for (const line of captured) expect(line).not.toContain(SECRET);
  });

  it("does not echo the apiKey in response headers or success body", async () => {
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["chunk"]] })
    );
    const res = await handler(buildRequest({ ...VALID_BODY, apiKey: SECRET }));
    expect(res.status).toBe(200);
    res.headers.forEach((value) => {
      expect(value).not.toContain(SECRET);
    });
    const text = await readStream(res);
    expect(text).not.toContain(SECRET);
    // sanity: adapter did receive it (it has to in order to call the provider),
    // but the route did not retain/echo it
    expect(calls[0].apiKey).toBe(SECRET);
  });

  it("does not echo the apiKey in validation error responses", async () => {
    const handler = createChatRouteHandler(() => makeFakeAdapter("openai", []));
    const res = await handler(buildRequest({ ...VALID_BODY, apiKey: SECRET, model: "" }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
  });

  it("does not retain the apiKey on the module — no global capture between requests", async () => {
    const calls: AdapterCall[] = [];
    const handler = createChatRouteHandler(
      (p) => makeFakeAdapter(p, calls, { turns: [["x"]] })
    );
    await readStream(await handler(buildRequest({ ...VALID_BODY, apiKey: "key-A" })));
    await readStream(await handler(buildRequest({ ...VALID_BODY, apiKey: "key-B" })));
    expect(calls[0].apiKey).toBe("key-A");
    expect(calls[1].apiKey).toBe("key-B");
    // The route module exports nothing that holds a key.
    const mod = await import("../chat/route");
    const exportedNames = Object.keys(mod);
    for (const name of exportedNames) {
      const v = (mod as Record<string, unknown>)[name];
      if (typeof v === "string") {
        expect(v).not.toContain("key-A");
        expect(v).not.toContain("key-B");
      }
    }
  });
});
