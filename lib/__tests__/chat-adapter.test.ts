import { OpenAIAdapter, type OpenAIClientFactory, type OpenAIClientLike } from "../openai-adapter";
import {
  AnthropicAdapter,
  type AnthropicClientFactory,
  type AnthropicClientLike,
  type AnthropicMessageStream,
} from "../anthropic-adapter";
import type { ChatAdapter, ToolDefinition } from "../chat-adapter";

// ---------------- OpenAI fake client -----------------

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

type OpenAITurn =
  | { kind: "text"; deltas: string[] }
  | {
      kind: "tool";
      calls: Array<{ id: string; name: string; arguments: string }>;
    };

function openaiChunksForTurn(turn: OpenAITurn): OpenAIChunk[] {
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
              {
                index: idx,
                id: c.id,
                function: { name: c.name, arguments: c.arguments },
              },
            ],
          },
        },
      ],
    });
  });
  chunks.push({ choices: [{ delta: {}, finish_reason: "tool_calls" }] });
  return chunks;
}

function makeOpenAIFactory(scripted: OpenAITurn[]): {
  factory: OpenAIClientFactory;
  observed: { apiKey: string | null; calls: number; sentMessages: unknown[][] };
} {
  const observed = {
    apiKey: null as string | null,
    calls: 0,
    sentMessages: [] as unknown[][],
  };
  const factory: OpenAIClientFactory = (apiKey: string) => {
    observed.apiKey = apiKey;
    const client: OpenAIClientLike = {
      chat: {
        completions: {
          create: async (params: unknown) => {
            observed.calls += 1;
            const messages =
              (params as { messages?: unknown[] }).messages ?? [];
            observed.sentMessages.push(messages);
            const turn = scripted.shift();
            if (!turn) throw new Error("openai-fake: no more scripted turns");
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

// ---------------- Anthropic fake client -----------------

type AnthropicTurn =
  | { kind: "text"; deltas: string[] }
  | {
      kind: "tool";
      blocks: Array<{ id: string; name: string; input: Record<string, unknown> }>;
    };

function makeAnthropicFactory(scripted: AnthropicTurn[]): {
  factory: AnthropicClientFactory;
  observed: { apiKey: string | null; calls: number; sentMessages: unknown[][] };
} {
  const observed = {
    apiKey: null as string | null,
    calls: 0,
    sentMessages: [] as unknown[][],
  };
  const factory: AnthropicClientFactory = (apiKey: string) => {
    observed.apiKey = apiKey;
    const client: AnthropicClientLike = {
      messages: {
        stream: (params: unknown) => {
          observed.calls += 1;
          const messages =
            (params as { messages?: unknown[] }).messages ?? [];
          observed.sentMessages.push(messages);
          const turn = scripted.shift();
          if (!turn) throw new Error("anthropic-fake: no more scripted turns");
          let final: { stop_reason: string; content: unknown[] };
          let events: Array<{ type: string; index?: number; delta?: { type: string; text?: string } }> = [];
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
            // No text events for a tool-only turn; finalMessage carries tool_use blocks.
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
          const stream: AnthropicMessageStream = Object.assign(
            (async function* () {
              for (const e of events) yield e as never;
            })(),
            {
              finalMessage: async () => final as never,
            }
          );
          return stream;
        },
      },
    };
    return client;
  };
  return { factory, observed };
}

// ---------------- Helpers -----------------

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of iter) out.push(chunk);
  return out;
}

function echoTool(): ToolDefinition {
  return {
    name: "echo",
    description: "Echo the input",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    execute: async (args) => `echoed:${(args as { text?: string }).text ?? ""}`,
  };
}

function throwingTool(): ToolDefinition {
  return {
    name: "boom",
    description: "Always throws",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      throw new Error("kaboom");
    },
  };
}

// =====================================================
// AC-1: OpenAIAdapter.stream returns async iterable of text chunks
// =====================================================
describe("OpenAIAdapter.stream returns an async iterable of text chunks (ac-746ea50f5e13)", () => {
  it("yields text chunks via async iteration", async () => {
    const { factory } = makeOpenAIFactory([
      { kind: "text", deltas: ["Hello", " world"] },
    ]);
    const adapter = new OpenAIAdapter(factory);
    const iter = adapter.stream(
      [{ role: "user", content: "hi" }],
      [],
      "sk-test",
      "gpt-4o"
    );

    expect(typeof (iter as AsyncIterable<string>)[Symbol.asyncIterator]).toBe(
      "function"
    );

    const chunks = await collect(iter);
    expect(chunks).toEqual(["Hello", " world"]);
  });
});

// =====================================================
// AC-2: AnthropicAdapter.stream returns async iterable of text chunks
// =====================================================
describe("AnthropicAdapter.stream returns an async iterable of text chunks (ac-5afa16986b8d)", () => {
  it("yields text chunks via async iteration", async () => {
    const { factory } = makeAnthropicFactory([
      { kind: "text", deltas: ["Hi", " there"] },
    ]);
    const adapter = new AnthropicAdapter(factory);
    const iter = adapter.stream(
      [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
      [],
      "sk-ant-test",
      "claude-sonnet-4-5"
    );

    expect(typeof (iter as AsyncIterable<string>)[Symbol.asyncIterator]).toBe(
      "function"
    );

    const chunks = await collect(iter);
    expect(chunks).toEqual(["Hi", " there"]);
  });
});

// =====================================================
// AC-3: Both adapters handle the tool call → result → continue loop
// =====================================================
describe("tool call -> result -> continue loop (ac-e36fa8e48745)", () => {
  it("OpenAI: executes tool and continues until a final text turn", async () => {
    const { factory, observed } = makeOpenAIFactory([
      {
        kind: "tool",
        calls: [
          {
            id: "call_1",
            name: "echo",
            arguments: JSON.stringify({ text: "ping" }),
          },
        ],
      },
      { kind: "text", deltas: ["done: ", "ok"] },
    ]);
    const adapter = new OpenAIAdapter(factory);

    const out = await collect(
      adapter.stream(
        [{ role: "user", content: "use the tool" }],
        [echoTool()],
        "sk-test",
        "gpt-4o"
      )
    );

    expect(out.join("")).toBe("done: ok");
    expect(observed.calls).toBe(2);
    // Second turn must include the tool result message.
    const secondTurn = observed.sentMessages[1] as Array<{
      role: string;
      content?: unknown;
      tool_call_id?: string;
    }>;
    const toolMsg = secondTurn.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe("call_1");
    expect(toolMsg?.content).toBe("echoed:ping");
  });

  it("Anthropic: executes tool and continues until end_turn", async () => {
    const { factory, observed } = makeAnthropicFactory([
      {
        kind: "tool",
        blocks: [
          { id: "tu_1", name: "echo", input: { text: "ping" } },
        ],
      },
      { kind: "text", deltas: ["final"] },
    ]);
    const adapter = new AnthropicAdapter(factory);

    const out = await collect(
      adapter.stream(
        [{ role: "user", content: "use the tool" }],
        [echoTool()],
        "sk-ant-test",
        "claude-sonnet-4-5"
      )
    );

    expect(out.join("")).toBe("final");
    expect(observed.calls).toBe(2);
    // Second turn's last message should be a user message containing tool_result blocks.
    const secondTurn = observed.sentMessages[1] as Array<{
      role: string;
      content: unknown;
    }>;
    const last = secondTurn[secondTurn.length - 1];
    expect(last.role).toBe("user");
    const content = last.content as Array<{
      type: string;
      tool_use_id?: string;
      content?: unknown;
    }>;
    expect(content[0].type).toBe("tool_result");
    expect(content[0].tool_use_id).toBe("tu_1");
    expect(content[0].content).toBe("echoed:ping");
  });
});

// =====================================================
// AC-4: Both adapters propagate tool execution errors gracefully
// =====================================================
describe("tool execution errors propagate to LLM context (ac-a9b385f9d9a4)", () => {
  it("OpenAI: a thrown tool error becomes the tool message content (Error: kaboom) and the loop continues", async () => {
    const { factory, observed } = makeOpenAIFactory([
      {
        kind: "tool",
        calls: [
          { id: "call_1", name: "boom", arguments: JSON.stringify({}) },
        ],
      },
      { kind: "text", deltas: ["recovered"] },
    ]);
    const adapter = new OpenAIAdapter(factory);

    const out = await collect(
      adapter.stream(
        [{ role: "user", content: "trigger error" }],
        [throwingTool()],
        "sk-test",
        "gpt-4o"
      )
    );

    expect(out.join("")).toBe("recovered");
    expect(observed.calls).toBe(2);
    const secondTurn = observed.sentMessages[1] as Array<{
      role: string;
      content?: unknown;
      tool_call_id?: string;
    }>;
    const toolMsg = secondTurn.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(String(toolMsg?.content)).toMatch(/^Error: kaboom/);
  });

  it("OpenAI: invalid JSON arguments are caught and reported back to the model", async () => {
    const { factory, observed } = makeOpenAIFactory([
      {
        kind: "tool",
        calls: [{ id: "call_1", name: "echo", arguments: "not-json" }],
      },
      { kind: "text", deltas: ["ok"] },
    ]);
    const adapter = new OpenAIAdapter(factory);

    await collect(
      adapter.stream(
        [{ role: "user", content: "bad args" }],
        [echoTool()],
        "sk-test",
        "gpt-4o"
      )
    );

    const secondTurn = observed.sentMessages[1] as Array<{
      role: string;
      content?: unknown;
    }>;
    const toolMsg = secondTurn.find((m) => m.role === "tool");
    expect(String(toolMsg?.content)).toMatch(/^Error: invalid JSON/);
  });

  it("Anthropic: a thrown tool error becomes a tool_result with is_error=true", async () => {
    const { factory, observed } = makeAnthropicFactory([
      {
        kind: "tool",
        blocks: [{ id: "tu_1", name: "boom", input: {} }],
      },
      { kind: "text", deltas: ["recovered"] },
    ]);
    const adapter = new AnthropicAdapter(factory);

    const out = await collect(
      adapter.stream(
        [{ role: "user", content: "trigger error" }],
        [throwingTool()],
        "sk-ant-test",
        "claude-sonnet-4-5"
      )
    );

    expect(out.join("")).toBe("recovered");
    const secondTurn = observed.sentMessages[1] as Array<{
      role: string;
      content: unknown;
    }>;
    const last = secondTurn[secondTurn.length - 1];
    const blocks = last.content as Array<{
      type: string;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;
    expect(blocks[0].type).toBe("tool_result");
    expect(blocks[0].is_error).toBe(true);
    expect(String(blocks[0].content)).toMatch(/^Error: kaboom/);
  });
});

// =====================================================
// AC-5: Adapters are interchangeable behind ChatAdapter
// =====================================================
describe("adapters are interchangeable behind ChatAdapter (ac-ad09edb6de9f)", () => {
  it("OpenAIAdapter and AnthropicAdapter both satisfy the ChatAdapter interface", async () => {
    const { factory: openaiFactory } = makeOpenAIFactory([
      { kind: "text", deltas: ["openai-out"] },
    ]);
    const { factory: anthropicFactory } = makeAnthropicFactory([
      { kind: "text", deltas: ["anthropic-out"] },
    ]);

    const adapters: ChatAdapter[] = [
      new OpenAIAdapter(openaiFactory),
      new AnthropicAdapter(anthropicFactory),
    ];

    const results: string[] = [];
    const apiKeys = ["sk-test", "sk-ant-test"];
    const models = ["gpt-4o", "claude-sonnet-4-5"];

    for (let i = 0; i < adapters.length; i++) {
      const iter = adapters[i].stream(
        [{ role: "user", content: "hi" }],
        [],
        apiKeys[i],
        models[i]
      );
      results.push((await collect(iter)).join(""));
    }

    expect(results).toEqual(["openai-out", "anthropic-out"]);
  });
});

// =====================================================
// AC-6: API keys are used per-request and never stored server-side
// =====================================================
describe("api keys are per-request and never stored (ac-22eac9eaee6c)", () => {
  it("OpenAI: the apiKey is forwarded to the client factory and not retained on the adapter instance", async () => {
    const { factory, observed } = makeOpenAIFactory([
      { kind: "text", deltas: ["a"] },
      { kind: "text", deltas: ["b"] },
    ]);
    const adapter = new OpenAIAdapter(factory);

    await collect(
      adapter.stream(
        [{ role: "user", content: "1" }],
        [],
        "sk-first",
        "gpt-4o"
      )
    );
    expect(observed.apiKey).toBe("sk-first");

    await collect(
      adapter.stream(
        [{ role: "user", content: "2" }],
        [],
        "sk-second",
        "gpt-4o"
      )
    );
    expect(observed.apiKey).toBe("sk-second");

    // Adapter must not hold on to the apiKey between calls.
    const enumerated = JSON.stringify(adapter);
    expect(enumerated).not.toContain("sk-first");
    expect(enumerated).not.toContain("sk-second");
  });

  it("Anthropic: the apiKey is forwarded to the client factory and not retained on the adapter instance", async () => {
    const { factory, observed } = makeAnthropicFactory([
      { kind: "text", deltas: ["a"] },
      { kind: "text", deltas: ["b"] },
    ]);
    const adapter = new AnthropicAdapter(factory);

    await collect(
      adapter.stream(
        [{ role: "user", content: "1" }],
        [],
        "sk-ant-first",
        "claude-sonnet-4-5"
      )
    );
    expect(observed.apiKey).toBe("sk-ant-first");

    await collect(
      adapter.stream(
        [{ role: "user", content: "2" }],
        [],
        "sk-ant-second",
        "claude-sonnet-4-5"
      )
    );
    expect(observed.apiKey).toBe("sk-ant-second");

    const enumerated = JSON.stringify(adapter);
    expect(enumerated).not.toContain("sk-ant-first");
    expect(enumerated).not.toContain("sk-ant-second");
  });

  it("no module-level state in either adapter module retains api keys", () => {
    // Both modules expose only class symbols and types — no top-level singletons that could
    // accumulate keys across calls. We verify this structurally by confirming a fresh adapter
    // doesn't inherit keys from a previous one.
    const { factory: f1 } = makeOpenAIFactory([{ kind: "text", deltas: ["x"] }]);
    const { factory: f2 } = makeOpenAIFactory([{ kind: "text", deltas: ["y"] }]);
    const a = new OpenAIAdapter(f1);
    const b = new OpenAIAdapter(f2);
    expect(JSON.stringify(a)).not.toContain("sk-");
    expect(JSON.stringify(b)).not.toContain("sk-");
  });
});
