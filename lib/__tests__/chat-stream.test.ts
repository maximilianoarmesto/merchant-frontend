/**
 * @jest-environment node
 */
import {
  toolLabel,
  storedToChatMessages,
  createApiChatStreamer,
  type ChatStreamEvent,
} from "@/lib/chat-stream";
import type { StoredMessage } from "@/lib/conversation-store";

describe("toolLabel", () => {
  it("maps known commerce tools to friendly labels", () => {
    expect(toolLabel("list_products")).toBe("🔍 Browsing catalog…");
    expect(toolLabel("create_checkout_session")).toBe(
      "🛒 Creating checkout session…"
    );
    expect(toolLabel("process_payment")).toBe("💳 Processing payment…");
  });

  it("falls back to a generic label for unknown tools", () => {
    expect(toolLabel("mystery_tool")).toBe("⚙️ Running mystery_tool…");
  });
});

describe("storedToChatMessages", () => {
  it("drops timestamps and folds the tool role into assistant", () => {
    const stored: StoredMessage[] = [
      { role: "user", content: "hi", timestamp: 1 },
      { role: "assistant", content: "hello", timestamp: 2 },
      { role: "tool", content: "tool output", timestamp: 3 },
    ];
    expect(storedToChatMessages(stored)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "assistant", content: "tool output" },
    ]);
  });
});

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
}

async function collect(
  iterable: AsyncIterable<ChatStreamEvent>
): Promise<ChatStreamEvent[]> {
  const out: ChatStreamEvent[] = [];
  for await (const ev of iterable) out.push(ev);
  return out;
}

describe("createApiChatStreamer", () => {
  it("parses SSE delta frames into text events until [DONE]", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"delta":"Hel"}\n\n',
        'data: {"delta":"lo"}\n\n',
        "data: [DONE]\n\n",
      ]),
    })) as unknown as typeof fetch;

    const streamer = createApiChatStreamer({
      provider: "openai",
      apiKey: "k",
      model: "gpt",
      fetchImpl,
    });
    const events = await collect(streamer([]));
    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
    ]);
  });

  it("surfaces a non-ok response as an error event", async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 401,
      body: null,
      json: async () => ({ error: "invalid key" }),
    })) as unknown as typeof fetch;

    const streamer = createApiChatStreamer({
      provider: "openai",
      apiKey: "bad",
      model: "gpt",
      fetchImpl,
    });
    const events = await collect(streamer([]));
    expect(events).toEqual([{ type: "error", message: "invalid key" }]);
  });
});
