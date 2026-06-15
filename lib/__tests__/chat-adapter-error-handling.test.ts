/**
 * Provider-adapter unit tests focused on the contract this task cares about:
 *   - single-turn text responses (no tool calls)
 *   - multi-turn tool-call loops (tool call -> tool result -> final text)
 *   - error propagation: invalid API key (401/403), rate limit (429), network error
 *   - exactly-once tool execution per tool call
 *   - both adapters conform to the shared `ChatAdapter` interface and produce
 *     identical output shapes for equivalent inputs
 *
 * Every SDK is mocked through the adapters' client-factory seam, so NO real HTTP
 * is ever performed. SDK errors are constructed from the *real* OpenAI/Anthropic
 * error classes so the "structured error" propagation is tested faithfully.
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  OpenAIAdapter,
  type OpenAIClientFactory,
  type OpenAIClientLike,
} from "../openai-adapter";
import {
  AnthropicAdapter,
  type AnthropicClientFactory,
  type AnthropicClientLike,
  type AnthropicMessageStream,
} from "../anthropic-adapter";
import type { ChatAdapter, ToolDefinition } from "../chat-adapter";

// ============================================================
// Realistic SDK error builders (real error classes from each SDK)
// ============================================================

function headers(): Headers {
  return new Headers();
}

const openaiErrors = {
  auth: () =>
    new OpenAI.AuthenticationError(
      401,
      { error: { message: "Incorrect API key provided" } },
      "Incorrect API key provided",
      headers()
    ),
  forbidden: () =>
    new OpenAI.PermissionDeniedError(
      403,
      { error: { message: "You do not have access" } },
      "You do not have access",
      headers()
    ),
  rateLimit: () =>
    new OpenAI.RateLimitError(
      429,
      { error: { message: "Rate limit reached" } },
      "Rate limit reached",
      headers()
    ),
  network: () => new OpenAI.APIConnectionError({ message: "Connection error" }),
};

const anthropicErrors = {
  auth: () =>
    new Anthropic.AuthenticationError(
      401,
      { error: { message: "invalid x-api-key" } },
      "invalid x-api-key",
      headers()
    ),
  forbidden: () =>
    new Anthropic.PermissionDeniedError(
      403,
      { error: { message: "request not allowed" } },
      "request not allowed",
      headers()
    ),
  rateLimit: () =>
    new Anthropic.RateLimitError(
      429,
      { error: { message: "rate limited" } },
      "rate limited",
      headers()
    ),
  network: () =>
    new Anthropic.APIConnectionError({ message: "Connection error" }),
};

// ============================================================
// OpenAI fake client
// ============================================================

type OpenAIScript =
  | { kind: "text"; deltas: string[] }
  | { kind: "tool"; calls: Array<{ id: string; name: string; arguments: string }> }
  | { kind: "throw"; error: unknown } // create() rejects (pre-stream: auth/rate)
  | { kind: "throw-iter"; error: unknown }; // stream iteration throws (mid-stream/network)

type OpenAIChunk = {
  choices: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
};

function openaiChunksForTurn(turn: Extract<OpenAIScript, { kind: "text" | "tool" }>): OpenAIChunk[] {
  if (turn.kind === "text") {
    const chunks: OpenAIChunk[] = turn.deltas.map((d) => ({
      choices: [{ delta: { content: d }, finish_reason: null }],
    }));
    chunks.push({ choices: [{ delta: {}, finish_reason: "stop" }] });
    return chunks;
  }
  const chunks: OpenAIChunk[] = [];
  turn.calls.forEach((c, idx) => {
    chunks.push({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: idx, id: c.id, function: { name: c.name, arguments: c.arguments } },
            ],
          },
        },
      ],
    });
  });
  chunks.push({ choices: [{ delta: {}, finish_reason: "tool_calls" }] });
  return chunks;
}

function makeOpenAIFactory(scripted: OpenAIScript[]): {
  factory: OpenAIClientFactory;
  observed: { apiKey: string | null; calls: number };
} {
  const observed = { apiKey: null as string | null, calls: 0 };
  const factory: OpenAIClientFactory = (apiKey: string) => {
    observed.apiKey = apiKey;
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: async () => {
            observed.calls += 1;
            const turn = scripted.shift();
            if (!turn) throw new Error("openai-fake: no more scripted turns");
            if (turn.kind === "throw") throw turn.error;
            if (turn.kind === "throw-iter") {
              return (async function* () {
                // Surface a connection error partway through streaming.
                throw turn.error;
                // eslint-disable-next-line no-unreachable
                yield undefined as never;
              })();
            }
            const chunks = openaiChunksForTurn(turn);
            return (async function* () {
              for (const c of chunks) yield c as never;
            })();
          },
        },
      },
    };
    return client;
  };
  return { factory, observed };
}

// ============================================================
// Anthropic fake client
// ============================================================

type AnthropicScript =
  | { kind: "text"; deltas: string[] }
  | { kind: "tool"; blocks: Array<{ id: string; name: string; input: Record<string, unknown> }> }
  | { kind: "throw"; error: unknown }; // iteration throws (auth/rate/network)

function makeAnthropicFactory(scripted: AnthropicScript[]): {
  factory: AnthropicClientFactory;
  observed: { apiKey: string | null; calls: number };
} {
  const observed = { apiKey: null as string | null, calls: 0 };
  const factory: AnthropicClientFactory = (apiKey: string) => {
    observed.apiKey = apiKey;
    const client: AnthropicClientLike = {
      messages: {
        stream: (): AnthropicMessageStream => {
          observed.calls += 1;
          const turn = scripted.shift();
          if (!turn) throw new Error("anthropic-fake: no more scripted turns");

          if (turn.kind === "throw") {
            return Object.assign(
              (async function* () {
                throw turn.error;
                // eslint-disable-next-line no-unreachable
                yield undefined as never;
              })(),
              { finalMessage: async () => Promise.reject(turn.error) as never }
            );
          }

          let events: Array<{ type: string; index?: number; delta?: { type: string; text?: string } }> = [];
          let final: { stop_reason: string; content: unknown[] };
          if (turn.kind === "text") {
            events = turn.deltas.map((d) => ({
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: d },
            }));
            final = {
              stop_reason: "end_turn",
              content: [{ type: "text", text: turn.deltas.join("") }],
            };
          } else {
            final = {
              stop_reason: "tool_use",
              content: turn.blocks.map((b) => ({
                type: "tool_use",
                id: b.id,
                name: b.name,
                input: b.input,
              })),
            };
          }
          return Object.assign(
            (async function* () {
              for (const e of events) yield e as never;
            })(),
            { finalMessage: async () => final as never }
          );
        },
      },
    };
    return client;
  };
  return { factory, observed };
}

// ============================================================
// Helpers
// ============================================================

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

/** Returns the error thrown while draining the stream, or null if it completed. */
async function captureError(iter: AsyncIterable<string>): Promise<unknown> {
  try {
    await collect(iter);
    return null;
  } catch (err) {
    return err;
  }
}

function makeTrackedTool(name: string, ret = `result:${name}`): {
  tool: ToolDefinition;
  execute: jest.Mock;
} {
  const execute = jest.fn(async () => ret);
  return {
    tool: {
      name,
      description: `Tool ${name}`,
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute,
    },
    execute,
  };
}

// ============================================================
// AC1 / AC3: single-turn text response (no tool calls)
// ============================================================

describe("single-turn text response (AC1, AC3)", () => {
  it("OpenAI yields a single text response with no tool calls", async () => {
    const { factory, observed } = makeOpenAIFactory([
      { kind: "text", deltas: ["Hello", ", world"] },
    ]);
    const out = await collect(
      new OpenAIAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "sk-openai",
        "gpt-4o"
      )
    );
    expect(out.join("")).toBe("Hello, world");
    expect(observed.calls).toBe(1); // one round-trip, no tool loop
  });

  it("Anthropic yields a single text response with no tool calls", async () => {
    const { factory, observed } = makeAnthropicFactory([
      { kind: "text", deltas: ["Hello", ", world"] },
    ]);
    const out = await collect(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "sk-ant",
        "claude-sonnet-4-5"
      )
    );
    expect(out.join("")).toBe("Hello, world");
    expect(observed.calls).toBe(1);
  });
});

// ============================================================
// AC2 / AC3 / AC7: multi-turn tool-call loop + exactly-once execution
// ============================================================

describe("multi-turn tool-call loop (AC2, AC3, AC7)", () => {
  it("OpenAI runs tool call -> tool result -> final text, executing the tool exactly once", async () => {
    const { tool, execute } = makeTrackedTool("echo", "result:echo");
    const { factory, observed } = makeOpenAIFactory([
      { kind: "tool", calls: [{ id: "call_1", name: "echo", arguments: "{}" }] },
      { kind: "text", deltas: ["final answer"] },
    ]);
    const out = await collect(
      new OpenAIAdapter(factory).stream(
        [{ role: "user", content: "use the tool" }],
        [tool],
        "sk-openai",
        "gpt-4o"
      )
    );
    expect(out.join("")).toBe("final answer");
    expect(observed.calls).toBe(2); // tool turn + final turn
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("Anthropic runs tool call -> tool result -> final text, executing the tool exactly once", async () => {
    const { tool, execute } = makeTrackedTool("echo", "result:echo");
    const { factory, observed } = makeAnthropicFactory([
      { kind: "tool", blocks: [{ id: "tu_1", name: "echo", input: {} }] },
      { kind: "text", deltas: ["final answer"] },
    ]);
    const out = await collect(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "use the tool" }],
        [tool],
        "sk-ant",
        "claude-sonnet-4-5"
      )
    );
    expect(out.join("")).toBe("final answer");
    expect(observed.calls).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("OpenAI executes each tool exactly once when a single turn emits two tool calls", async () => {
    const a = makeTrackedTool("alpha", "result:alpha");
    const b = makeTrackedTool("beta", "result:beta");
    const { factory } = makeOpenAIFactory([
      {
        kind: "tool",
        calls: [
          { id: "call_a", name: "alpha", arguments: "{}" },
          { id: "call_b", name: "beta", arguments: "{}" },
        ],
      },
      { kind: "text", deltas: ["done"] },
    ]);
    await collect(
      new OpenAIAdapter(factory).stream(
        [{ role: "user", content: "use both tools" }],
        [a.tool, b.tool],
        "sk-openai",
        "gpt-4o"
      )
    );
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(b.execute).toHaveBeenCalledTimes(1);
  });

  it("Anthropic executes each tool exactly once when a single turn emits two tool calls", async () => {
    const a = makeTrackedTool("alpha", "result:alpha");
    const b = makeTrackedTool("beta", "result:beta");
    const { factory } = makeAnthropicFactory([
      {
        kind: "tool",
        blocks: [
          { id: "tu_a", name: "alpha", input: {} },
          { id: "tu_b", name: "beta", input: {} },
        ],
      },
      { kind: "text", deltas: ["done"] },
    ]);
    await collect(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "use both tools" }],
        [a.tool, b.tool],
        "sk-ant",
        "claude-sonnet-4-5"
      )
    );
    expect(a.execute).toHaveBeenCalledTimes(1);
    expect(b.execute).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// AC4: invalid API key (401/403) propagates a structured error
// ============================================================

describe("invalid API key propagates a structured error (AC4)", () => {
  it("OpenAI propagates a 401 AuthenticationError", async () => {
    const { factory } = makeOpenAIFactory([{ kind: "throw", error: openaiErrors.auth() }]);
    const err = await captureError(
      new OpenAIAdapter(factory).stream([{ role: "user", content: "hi" }], [], "bad-key", "gpt-4o")
    );
    expect(err).toBeInstanceOf(OpenAI.APIError);
    expect((err as { status?: number }).status).toBe(401);
  });

  it("OpenAI propagates a 403 PermissionDeniedError", async () => {
    const { factory } = makeOpenAIFactory([{ kind: "throw", error: openaiErrors.forbidden() }]);
    const err = await captureError(
      new OpenAIAdapter(factory).stream([{ role: "user", content: "hi" }], [], "bad-key", "gpt-4o")
    );
    expect((err as { status?: number }).status).toBe(403);
  });

  it("Anthropic propagates a 401 AuthenticationError", async () => {
    const { factory } = makeAnthropicFactory([{ kind: "throw", error: anthropicErrors.auth() }]);
    const err = await captureError(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "bad-key",
        "claude-sonnet-4-5"
      )
    );
    expect(err).toBeInstanceOf(Anthropic.APIError);
    expect((err as { status?: number }).status).toBe(401);
  });

  it("Anthropic propagates a 403 PermissionDeniedError", async () => {
    const { factory } = makeAnthropicFactory([
      { kind: "throw", error: anthropicErrors.forbidden() },
    ]);
    const err = await captureError(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "bad-key",
        "claude-sonnet-4-5"
      )
    );
    expect((err as { status?: number }).status).toBe(403);
  });
});

// ============================================================
// AC5: rate limiting (429) propagates a structured error
// ============================================================

describe("rate limiting propagates a structured error (AC5)", () => {
  it("OpenAI propagates a 429 RateLimitError", async () => {
    const { factory } = makeOpenAIFactory([{ kind: "throw", error: openaiErrors.rateLimit() }]);
    const err = await captureError(
      new OpenAIAdapter(factory).stream([{ role: "user", content: "hi" }], [], "sk-openai", "gpt-4o")
    );
    expect(err).toBeInstanceOf(OpenAI.RateLimitError);
    expect((err as { status?: number }).status).toBe(429);
  });

  it("Anthropic propagates a 429 RateLimitError", async () => {
    const { factory } = makeAnthropicFactory([
      { kind: "throw", error: anthropicErrors.rateLimit() },
    ]);
    const err = await captureError(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "sk-ant",
        "claude-sonnet-4-5"
      )
    );
    expect(err).toBeInstanceOf(Anthropic.RateLimitError);
    expect((err as { status?: number }).status).toBe(429);
  });
});

// ============================================================
// Network errors propagate (part of the error-handling AC set)
// ============================================================

describe("network errors propagate as structured connection errors", () => {
  it("OpenAI propagates an APIConnectionError raised mid-stream", async () => {
    const { factory } = makeOpenAIFactory([
      { kind: "throw-iter", error: openaiErrors.network() },
    ]);
    const err = await captureError(
      new OpenAIAdapter(factory).stream([{ role: "user", content: "hi" }], [], "sk-openai", "gpt-4o")
    );
    expect(err).toBeInstanceOf(OpenAI.APIConnectionError);
  });

  it("Anthropic propagates an APIConnectionError raised mid-stream", async () => {
    const { factory } = makeAnthropicFactory([
      { kind: "throw", error: anthropicErrors.network() },
    ]);
    const err = await captureError(
      new AnthropicAdapter(factory).stream(
        [{ role: "user", content: "hi" }],
        [],
        "sk-ant",
        "claude-sonnet-4-5"
      )
    );
    expect(err).toBeInstanceOf(Anthropic.APIConnectionError);
  });

  it("a tool is never executed when the model call fails before any tool turn", async () => {
    const { tool, execute } = makeTrackedTool("echo");
    const { factory } = makeOpenAIFactory([{ kind: "throw", error: openaiErrors.network() }]);
    await captureError(
      new OpenAIAdapter(factory).stream([{ role: "user", content: "hi" }], [tool], "sk", "gpt-4o")
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

// ============================================================
// AC6: shared ChatAdapter conformance + identical output shapes
// ============================================================

describe("ChatAdapter conformance and identical output shapes (AC6)", () => {
  it("both adapters are assignable to ChatAdapter and expose a stream() returning an async iterable", async () => {
    const { factory: of } = makeOpenAIFactory([{ kind: "text", deltas: ["x"] }]);
    const { factory: af } = makeAnthropicFactory([{ kind: "text", deltas: ["x"] }]);
    const adapters: ChatAdapter[] = [new OpenAIAdapter(of), new AnthropicAdapter(af)];

    for (const adapter of adapters) {
      const iter = adapter.stream([{ role: "user", content: "hi" }], [], "key", "model");
      expect(typeof (iter as AsyncIterable<string>)[Symbol.asyncIterator]).toBe("function");
      const chunks = await collect(iter);
      // Output shape: an array of strings.
      expect(Array.isArray(chunks)).toBe(true);
      for (const c of chunks) expect(typeof c).toBe("string");
    }
  });

  it("both adapters produce an identical chunk stream for an equivalent tool-call -> final-text exchange", async () => {
    const oTool = makeTrackedTool("echo", "result:echo");
    const aTool = makeTrackedTool("echo", "result:echo");

    const openaiChunks = await collect(
      new OpenAIAdapter(
        makeOpenAIFactory([
          { kind: "tool", calls: [{ id: "call_1", name: "echo", arguments: "{}" }] },
          { kind: "text", deltas: ["The answer ", "is 4"] },
        ]).factory
      ).stream([{ role: "user", content: "q" }], [oTool.tool], "sk-openai", "gpt-4o")
    );

    const anthropicChunks = await collect(
      new AnthropicAdapter(
        makeAnthropicFactory([
          { kind: "tool", blocks: [{ id: "tu_1", name: "echo", input: {} }] },
          { kind: "text", deltas: ["The answer ", "is 4"] },
        ]).factory
      ).stream([{ role: "user", content: "q" }], [aTool.tool], "sk-ant", "claude-sonnet-4-5")
    );

    // Identical output shapes for equivalent inputs: same chunks, same final string.
    expect(openaiChunks).toEqual(anthropicChunks);
    expect(openaiChunks).toEqual(["The answer ", "is 4"]);
    expect(openaiChunks.join("")).toBe(anthropicChunks.join(""));
  });
});
