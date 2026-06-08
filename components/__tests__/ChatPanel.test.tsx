/**
 * @jest-environment jsdom
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
// React 18.3 exports `act` at runtime; @types/react 18.3.3 hasn't picked it up yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { act } = require("react") as { act: any };

import ChatPanel from "@/components/ChatPanel";
import { ConversationStore } from "@/lib/conversation-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface TestHarness {
  container: HTMLDivElement;
  root: Root;
  render: (ui: React.ReactElement) => Promise<void>;
  cleanup: () => void;
}

function setup(): TestHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    root,
    async render(ui) {
      await act(async () => {
        root.render(ui);
      });
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

// A manually-driven async stream so tests can step the assistant reply
// token by token and observe intermediate renders.
interface Channel<T> {
  iterable: AsyncIterable<T>;
  push: (ev: T) => void;
  close: () => void;
}
function makeChannel<T>(): Channel<T> {
  const queue: T[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;
  const wake = () => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };
  return {
    iterable: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (queue.length) {
            yield queue.shift() as T;
            continue;
          }
          if (closed) return;
          await new Promise<void>((r) => {
            resolveNext = r;
          });
        }
      },
    },
    push(ev) {
      queue.push(ev);
      wake();
    },
    close() {
      closed = true;
      wake();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChatPanel", () => {
  let h: TestHarness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => {
    h.cleanup();
  });

  function seedStore(): {
    store: ConversationStore;
    olderId: string;
    midId: string;
    newerId: string;
  } {
    // Pass explicit message timestamps so each conversation's updatedAt
    // is distinct (Date.now() ties when create+append run in the same tick).
    const t0 = new Date("2026-05-26T00:00:00.000Z").getTime();
    const store = new ConversationStore();
    const older = store.createConversation();
    store.appendMessage(older.id, {
      role: "user",
      content: "older question",
      timestamp: t0,
    });
    store.appendMessage(older.id, {
      role: "assistant",
      content: "older answer",
      timestamp: t0 + 1000,
    });

    const mid = store.createConversation();
    store.appendMessage(mid.id, {
      role: "user",
      content: "mid question",
      timestamp: t0 + 60_000,
    });

    const newer = store.createConversation();
    store.appendMessage(newer.id, {
      role: "user",
      content: "newest question",
      timestamp: t0 + 120_000,
    });
    store.appendMessage(newer.id, {
      role: "assistant",
      content: "newest answer",
      timestamp: t0 + 121_000,
    });
    return { store, olderId: older.id, midId: mid.id, newerId: newer.id };
  }

  // AC-1 — Sidebar lists all stored conversations sorted by most recent first
  describe("AC-1 lists conversations from ConversationStore, newest first", () => {
    it("populates the sidebar in updatedAt-desc order", async () => {
      const { store, olderId, midId, newerId } = seedStore();
      await h.render(<ChatPanel store={store} />);
      const items = h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-conversation-item']"
      );
      expect(items).toHaveLength(3);
      const ids = Array.from(items).map((el) => el.dataset.conversationId);
      expect(ids).toEqual([newerId, midId, olderId]);
    });
  });

  // AC-3 — Clicking a conversation loads its full message history into the chat area
  describe("AC-3 clicking a conversation loads its messages", () => {
    it("renders every message of the selected conversation in the chat area", async () => {
      const { store, olderId } = seedStore();
      await h.render(<ChatPanel store={store} />);
      // Default: nothing selected
      expect(
        h.container.querySelectorAll("[data-testid='chat-message']")
      ).toHaveLength(0);

      const olderItem = h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${olderId}']`
      )!;
      await click(olderItem);

      const messages = h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-message']"
      );
      expect(messages).toHaveLength(2);
      expect(messages[0].dataset.role).toBe("user");
      expect(messages[0].textContent).toContain("older question");
      expect(messages[1].dataset.role).toBe("assistant");
      expect(messages[1].textContent).toContain("older answer");
    });

    it("switches the message list when a different conversation is clicked", async () => {
      const { store, olderId, newerId } = seedStore();
      await h.render(<ChatPanel store={store} />);

      await click(
        h.container.querySelector<HTMLElement>(
          `[data-conversation-id='${olderId}']`
        )!
      );
      expect(
        h.container.querySelectorAll("[data-testid='chat-message']")
      ).toHaveLength(2);

      await click(
        h.container.querySelector<HTMLElement>(
          `[data-conversation-id='${newerId}']`
        )!
      );
      const messages = h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-message']"
      );
      expect(messages).toHaveLength(2);
      expect(messages[0].textContent).toContain("newest question");
      expect(messages[1].textContent).toContain("newest answer");
    });
  });

  // AC-4 — "New Chat" button creates a new conversation and clears the message area
  describe("AC-4 New Chat creates and clears", () => {
    it("creates a new conversation in the store and clears the chat area", async () => {
      const { store, olderId } = seedStore();
      await h.render(<ChatPanel store={store} />);

      // Load an existing conversation first so the chat area is non-empty
      await click(
        h.container.querySelector<HTMLElement>(
          `[data-conversation-id='${olderId}']`
        )!
      );
      expect(
        h.container.querySelectorAll("[data-testid='chat-message']").length
      ).toBeGreaterThan(0);

      const beforeIds = store.listConversations().map((c) => c.id);
      const newBtn = h.container.querySelector<HTMLButtonElement>(
        "[data-testid='chat-new-button']"
      )!;
      await click(newBtn);

      // Store gained one conversation
      const afterIds = store.listConversations().map((c) => c.id);
      expect(afterIds.length).toBe(beforeIds.length + 1);
      const newId = afterIds.find((id) => !beforeIds.includes(id))!;
      expect(newId).toBeTruthy();

      // Sidebar now shows the new conversation at the top
      const items = h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-conversation-item']"
      );
      expect(items[0].dataset.conversationId).toBe(newId);

      // The new conversation is active
      expect(
        h.container.querySelector(
          `[data-conversation-id='${newId}'].active`
        )
      ).not.toBeNull();

      // Message area is cleared (the new conversation has no messages)
      expect(
        h.container.querySelectorAll("[data-testid='chat-message']")
      ).toHaveLength(0);
    });
  });

  // AC-5 — Active conversation is visually highlighted
  describe("AC-5 active conversation highlight", () => {
    it("marks the clicked conversation as active and clears prior highlight", async () => {
      const { store, olderId, midId } = seedStore();
      await h.render(<ChatPanel store={store} />);

      await click(
        h.container.querySelector<HTMLElement>(
          `[data-conversation-id='${olderId}']`
        )!
      );
      const olderEl = h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${olderId}']`
      )!;
      expect(olderEl.classList.contains("active")).toBe(true);
      expect(olderEl.getAttribute("aria-current")).toBe("true");

      await click(
        h.container.querySelector<HTMLElement>(
          `[data-conversation-id='${midId}']`
        )!
      );
      const olderAfter = h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${olderId}']`
      )!;
      const midAfter = h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${midId}']`
      )!;
      expect(midAfter.classList.contains("active")).toBe(true);
      expect(olderAfter.classList.contains("active")).toBe(false);
    });
  });

  // AC-6 — Sidebar can be toggled open/closed within the chat panel
  describe("AC-6 sidebar can be toggled open/closed", () => {
    it("hides the sidebar when the close button is clicked, and shows it again when the open button is clicked", async () => {
      const { store } = seedStore();
      await h.render(<ChatPanel store={store} />);

      // Open by default
      let panel = h.container.querySelector<HTMLElement>(
        "[data-testid='chat-panel']"
      )!;
      expect(panel.dataset.sidebarOpen).toBe("true");
      expect(
        h.container.querySelector("[data-testid='chat-sidebar']")
      ).not.toBeNull();
      expect(
        h.container.querySelector("[data-testid='chat-sidebar-open']")
      ).toBeNull();

      // Close
      await click(
        h.container.querySelector<HTMLElement>(
          "[data-testid='chat-sidebar-close']"
        )!
      );
      panel = h.container.querySelector<HTMLElement>(
        "[data-testid='chat-panel']"
      )!;
      expect(panel.dataset.sidebarOpen).toBe("false");
      expect(panel.classList.contains("sidebar-closed")).toBe(true);
      expect(
        h.container.querySelector("[data-testid='chat-sidebar']")
      ).toBeNull();
      expect(
        h.container.querySelectorAll("[data-testid='chat-conversation-item']")
      ).toHaveLength(0);
      // Re-open button is visible inside the panel's main area
      const openBtn = h.container.querySelector<HTMLElement>(
        "[data-testid='chat-sidebar-open']"
      );
      expect(openBtn).not.toBeNull();

      // Open
      await click(openBtn!);
      panel = h.container.querySelector<HTMLElement>(
        "[data-testid='chat-panel']"
      )!;
      expect(panel.dataset.sidebarOpen).toBe("true");
      expect(panel.classList.contains("sidebar-open")).toBe(true);
      expect(
        h.container.querySelector("[data-testid='chat-sidebar']")
      ).not.toBeNull();
    });
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Streamer = (messages: any) => AsyncIterable<any>;

describe("ChatPanel — message area & streaming renderer", () => {
  let h: TestHarness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => {
    h.cleanup();
  });

  function getInput(): HTMLInputElement {
    return h.container.querySelector<HTMLInputElement>(
      "[data-testid='chat-input']"
    )!;
  }
  function getComposer(): HTMLFormElement {
    return h.container.querySelector<HTMLFormElement>(
      "[data-testid='chat-composer']"
    )!;
  }
  function userMessages(): HTMLElement[] {
    return Array.from(
      h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-message'][data-role='user']"
      )
    );
  }

  // AC: User messages render immediately on send (optimistic)
  it("renders the user message immediately on send, before the reply arrives", async () => {
    const store = new ConversationStore();
    // A streamer that never yields/closes — the reply stays pending.
    const pending = makeChannel<unknown>();
    const streamer: Streamer = () => pending.iterable as AsyncIterable<unknown>;

    await h.render(<ChatPanel store={store} streamer={streamer as never} />);
    await typeInto(getInput(), "do you sell shoes?");
    await submit(getComposer());

    const msgs = userMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].textContent).toContain("do you sell shoes?");
    // Persisted to the store synchronously (optimistic).
    const conv = store.listConversations()[0];
    expect(conv.messages.some((m) => m.content === "do you sell shoes?")).toBe(
      true
    );
    pending.close();
  });

  // AC: Assistant message streams in progressively as tokens arrive
  it("grows the assistant bubble as text deltas arrive and persists it on completion", async () => {
    const store = new ConversationStore();
    const ch = makeChannel<{ type: string; delta?: string }>();
    const streamer: Streamer = () => ch.iterable as AsyncIterable<unknown>;

    await h.render(<ChatPanel store={store} streamer={streamer as never} />);
    await typeInto(getInput(), "hi");
    await submit(getComposer());

    const live = () =>
      h.container.querySelector<HTMLElement>("[data-streaming='true']");

    await act(async () => {
      ch.push({ type: "text", delta: "Hel" });
    });
    expect(live()!.textContent).toContain("Hel");

    await act(async () => {
      ch.push({ type: "text", delta: "lo!" });
    });
    expect(live()!.textContent).toContain("Hello!");

    await act(async () => {
      ch.close();
    });

    // Live bubble gone; assistant message persisted.
    expect(live()).toBeNull();
    const assistant = h.container.querySelector<HTMLElement>(
      "[data-testid='chat-message'][data-role='assistant']"
    );
    expect(assistant!.textContent).toContain("Hello!");
    const conv = store.listConversations()[0];
    expect(
      conv.messages.some(
        (m) => m.role === "assistant" && m.content === "Hello!"
      )
    ).toBe(true);
  });

  // AC: Tool calls show a labelled loading indicator during execution
  it("shows a labelled tool indicator while a tool runs and hides it on tool_end", async () => {
    const store = new ConversationStore();
    const ch = makeChannel<{ type: string; tool?: string }>();
    const streamer: Streamer = () => ch.iterable as AsyncIterable<unknown>;

    await h.render(<ChatPanel store={store} streamer={streamer as never} />);
    await typeInto(getInput(), "show me products");
    await submit(getComposer());

    expect(
      h.container.querySelector("[data-testid='chat-tool-indicator']")
    ).toBeNull();

    await act(async () => {
      ch.push({ type: "tool", tool: "list_products" });
    });
    const indicator = h.container.querySelector<HTMLElement>(
      "[data-testid='chat-tool-indicator']"
    );
    expect(indicator).not.toBeNull();
    expect(indicator!.dataset.tool).toBe("list_products");
    expect(indicator!.textContent).toContain("🔍 Browsing catalog…");

    await act(async () => {
      ch.push({ type: "tool_end", tool: "list_products" });
    });
    expect(
      h.container.querySelector("[data-testid='chat-tool-indicator']")
    ).toBeNull();

    ch.close();
  });

  // AC: Messages auto-scroll to bottom on new content
  it("scrolls the message list to the bottom when new content arrives", async () => {
    const store = new ConversationStore();
    const ch = makeChannel<{ type: string; delta?: string }>();
    const streamer: Streamer = () => ch.iterable as AsyncIterable<unknown>;

    await h.render(<ChatPanel store={store} streamer={streamer as never} />);
    const list = h.container.querySelector<HTMLElement>(
      "[data-testid='chat-messages']"
    )!;
    // jsdom has no layout; simulate an overflowing scroll container.
    Object.defineProperty(list, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    });

    await typeInto(getInput(), "hi");
    await submit(getComposer());
    await act(async () => {
      ch.push({ type: "text", delta: "a long streamed reply" });
    });

    expect(list.scrollTop).toBe(1000);
    ch.close();
  });

  // AC: Markdown in assistant messages is rendered (bold, lists, code blocks)
  it("renders markdown (bold, lists, code) in persisted assistant messages", async () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, {
      role: "user",
      content: "explain",
      timestamp: 1,
    });
    store.appendMessage(conv.id, {
      role: "assistant",
      content: "**bold** text\n- one\n- two\n\n```\ncode();\n```",
      timestamp: 2,
    });

    await h.render(<ChatPanel store={store} streamer={(() => makeChannel().iterable) as never} />);
    await click(
      h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${conv.id}']`
      )!
    );

    const assistant = h.container.querySelector<HTMLElement>(
      "[data-testid='chat-message'][data-role='assistant'] .markdown"
    )!;
    expect(assistant.querySelector("strong")!.textContent).toBe("bold");
    expect(assistant.querySelectorAll("ul li")).toHaveLength(2);
    expect(assistant.querySelector("pre code")!.textContent).toContain(
      "code();"
    );
  });

  // AC: Timestamps shown on hover per message
  it("renders a per-message timestamp element with the message time", async () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const ts = new Date("2026-06-08T12:00:00.000Z").getTime();
    store.appendMessage(conv.id, {
      role: "user",
      content: "hello",
      timestamp: ts,
    });

    await h.render(<ChatPanel store={store} streamer={(() => makeChannel().iterable) as never} />);
    await click(
      h.container.querySelector<HTMLElement>(
        `[data-conversation-id='${conv.id}']`
      )!
    );

    const bubble = h.container.querySelector<HTMLElement>(
      "[data-testid='chat-message'][data-role='user']"
    )!;
    const time = bubble.querySelector<HTMLTimeElement>(
      "[data-testid='chat-message-time']"
    )!;
    expect(time).not.toBeNull();
    expect(time.getAttribute("datetime")).toBe(new Date(ts).toISOString());
    // The timestamp is also exposed as the bubble's native hover tooltip.
    expect(bubble.getAttribute("title")).toBe(new Date(ts).toLocaleString());
  });
});
