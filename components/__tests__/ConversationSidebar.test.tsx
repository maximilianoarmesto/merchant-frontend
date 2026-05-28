/**
 * @jest-environment jsdom
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
// React 18.3 exports `act` at runtime; @types/react 18.3.3 hasn't picked it up yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { act } = require("react") as { act: any };

import ConversationSidebar from "@/components/ConversationSidebar";
import type { Conversation } from "@/lib/conversation-store";

// Tell React this is an act() test environment to silence the warning.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-05-27T12:00:00.000Z").getTime();
const MIN = 60 * 1000;
const HR = 60 * MIN;
const DAY = 24 * HR;

function makeConv(
  id: string,
  title: string,
  updatedAt: number,
  messages: Conversation["messages"] = []
): Conversation {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    messages,
  };
}

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

describe("ConversationSidebar", () => {
  let h: TestHarness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => {
    h.cleanup();
  });

  // AC-1 — Sidebar lists all stored conversations sorted by most recent first
  describe("AC-1 sorted-by-recent list", () => {
    it("renders the conversations in the order they are supplied (already-sorted by store)", async () => {
      // Pre-sorted by updatedAt desc (matches ConversationStore.listConversations contract)
      const convs = [
        makeConv("c-new", "Newest", NOW - 5 * MIN),
        makeConv("c-mid", "Middle", NOW - 2 * HR),
        makeConv("c-old", "Oldest", NOW - 3 * DAY),
      ];
      await h.render(
        <ConversationSidebar
          conversations={convs}
          activeId={null}
          onSelect={() => {}}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );

      const items = h.container.querySelectorAll<HTMLElement>(
        "[data-testid='chat-conversation-item']"
      );
      expect(items).toHaveLength(3);
      expect(items[0].dataset.conversationId).toBe("c-new");
      expect(items[1].dataset.conversationId).toBe("c-mid");
      expect(items[2].dataset.conversationId).toBe("c-old");
    });

    it("renders an empty-state hint when there are no conversations", async () => {
      await h.render(
        <ConversationSidebar
          conversations={[]}
          activeId={null}
          onSelect={() => {}}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );
      expect(
        h.container.querySelectorAll("[data-testid='chat-conversation-item']")
      ).toHaveLength(0);
      expect(h.container.textContent).toContain("No conversations yet.");
    });
  });

  // AC-2 — Each conversation shows its title and relative timestamp
  describe("AC-2 title + relative timestamp", () => {
    it("renders the title and a relative timestamp for each conversation", async () => {
      const convs = [
        makeConv("c-now", "Latest question about shipping", NOW - 30 * 1000),
        makeConv("c-min", "Asked about returns", NOW - 5 * MIN),
        makeConv("c-hour", "Pricing question", NOW - 3 * HR),
        makeConv("c-day", "Yesterday's chat", NOW - 2 * DAY),
      ];
      await h.render(
        <ConversationSidebar
          conversations={convs}
          activeId={null}
          onSelect={() => {}}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );

      const items = Array.from(
        h.container.querySelectorAll<HTMLElement>(
          "[data-testid='chat-conversation-item']"
        )
      );
      expect(items.map((el) => el.textContent)).toEqual([
        expect.stringContaining("Latest question about shipping"),
        expect.stringContaining("Asked about returns"),
        expect.stringContaining("Pricing question"),
        expect.stringContaining("Yesterday's chat"),
      ]);
      expect(items[0].textContent).toContain("just now");
      expect(items[1].textContent).toContain("5m ago");
      expect(items[2].textContent).toContain("3h ago");
      expect(items[3].textContent).toContain("2d ago");
    });
  });

  // AC-5 — Active conversation is visually highlighted
  describe("AC-5 active highlight", () => {
    it("adds an active class and aria-current to the selected conversation", async () => {
      const convs = [
        makeConv("a", "A", NOW - 1 * MIN),
        makeConv("b", "B", NOW - 2 * MIN),
        makeConv("c", "C", NOW - 3 * MIN),
      ];
      await h.render(
        <ConversationSidebar
          conversations={convs}
          activeId="b"
          onSelect={() => {}}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );
      const items = Array.from(
        h.container.querySelectorAll<HTMLElement>(
          "[data-testid='chat-conversation-item']"
        )
      );
      const active = items.find((el) => el.dataset.conversationId === "b");
      const inactive = items.filter(
        (el) => el.dataset.conversationId !== "b"
      );
      expect(active!.classList.contains("active")).toBe(true);
      expect(active!.getAttribute("aria-current")).toBe("true");
      for (const el of inactive) {
        expect(el.classList.contains("active")).toBe(false);
        expect(el.getAttribute("aria-current")).toBeNull();
      }
    });

    it("highlights nothing when activeId is null", async () => {
      const convs = [makeConv("a", "A", NOW - 1 * MIN)];
      await h.render(
        <ConversationSidebar
          conversations={convs}
          activeId={null}
          onSelect={() => {}}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );
      const item = h.container.querySelector<HTMLElement>(
        "[data-testid='chat-conversation-item']"
      )!;
      expect(item.classList.contains("active")).toBe(false);
      expect(item.getAttribute("aria-current")).toBeNull();
    });
  });

  // AC-6 close button wires through onClose
  describe("AC-6 close handler wiring", () => {
    it("fires onClose when the close button is clicked", async () => {
      const onClose = jest.fn();
      await h.render(
        <ConversationSidebar
          conversations={[]}
          activeId={null}
          onSelect={() => {}}
          onNew={() => {}}
          onClose={onClose}
          now={NOW}
        />
      );
      const btn = h.container.querySelector<HTMLButtonElement>(
        "[data-testid='chat-sidebar-close']"
      )!;
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // AC-4 "New Chat" button wiring
  describe("AC-4 New Chat button wiring", () => {
    it("fires onNew when the New Chat button is clicked", async () => {
      const onNew = jest.fn();
      await h.render(
        <ConversationSidebar
          conversations={[]}
          activeId={null}
          onSelect={() => {}}
          onNew={onNew}
          onClose={() => {}}
          now={NOW}
        />
      );
      const btn = h.container.querySelector<HTMLButtonElement>(
        "[data-testid='chat-new-button']"
      )!;
      expect(btn.textContent).toContain("New Chat");
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onNew).toHaveBeenCalledTimes(1);
    });
  });

  // AC-3 — Click wiring (component-level)
  describe("AC-3 conversation click fires onSelect with id", () => {
    it("calls onSelect with the clicked conversation's id", async () => {
      const onSelect = jest.fn();
      const convs = [
        makeConv("c-1", "First", NOW - 1 * MIN),
        makeConv("c-2", "Second", NOW - 2 * MIN),
      ];
      await h.render(
        <ConversationSidebar
          conversations={convs}
          activeId={null}
          onSelect={onSelect}
          onNew={() => {}}
          onClose={() => {}}
          now={NOW}
        />
      );
      const target = h.container.querySelector<HTMLElement>(
        "[data-conversation-id='c-2']"
      )!;
      await act(async () => {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith("c-2");
    });
  });
});
