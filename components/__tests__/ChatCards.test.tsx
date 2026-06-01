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
import type { ToolDefinition } from "@/lib/chat-adapter";
import type { CheckoutSession, Order } from "@/lib/api";

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

const SESSION: CheckoutSession = {
  id: "cs_abc",
  product_id: 7,
  product_name: "Aeron Chair",
  quantity: 2,
  unit_price: 1200,
  total_amount: 2400,
  currency: "USD",
  status: "created",
  created_at: "2026-06-01T10:00:00.000Z",
};

const ORDER: Order = {
  id: 555,
  checkout_session_id: "cs_abc",
  product_id: 7,
  product_name: "Aeron Chair",
  quantity: 2,
  total_amount: 2400,
  currency: "USD",
  payment_status: "paid",
  order_status: "confirmed",
  created_at: "2026-06-01T10:05:00.000Z",
};

/** Seed a conversation whose only message is a create_checkout_session tool result. */
function seedWithCheckout(): { store: ConversationStore; id: string } {
  const store = new ConversationStore();
  const conv = store.createConversation();
  store.appendMessage(conv.id, {
    role: "user",
    content: "buy 2 chairs",
    timestamp: 1000,
  });
  store.appendMessage(conv.id, {
    role: "tool",
    content: JSON.stringify(SESSION),
    timestamp: 2000,
  });
  return { store, id: conv.id };
}

function payTool(execute: ToolDefinition["execute"]): ToolDefinition[] {
  return [
    {
      name: "process_payment",
      description: "test",
      parameters: { type: "object", properties: {} },
      execute,
    },
  ];
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChatPanel commerce cards", () => {
  let h: TestHarness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => {
    h.cleanup();
  });

  // AC dc37c3390a9e — after create_checkout_session, render a structured checkout card
  it("renders a checkout card for a create_checkout_session tool result", async () => {
    const { store, id } = seedWithCheckout();
    await h.render(<ChatPanel store={store} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );

    const card = h.container.querySelector("[data-testid='checkout-card']");
    expect(card).not.toBeNull();
    // It is NOT rendered as a plain text bubble.
    const bubbleContents = Array.from(
      h.container.querySelectorAll("[data-testid='chat-message'] .chat-message-content")
    ).map((el) => el.textContent);
    expect(bubbleContents.some((t) => t?.includes("cs_abc"))).toBe(false);
  });

  // AC 8a8220842b47 — card shows product name, quantity, unit price, total, currency
  it("shows product name, quantity, unit price, total and currency on the checkout card", async () => {
    const { store, id } = seedWithCheckout();
    await h.render(<ChatPanel store={store} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );

    const card = h.container.querySelector<HTMLElement>(
      "[data-testid='checkout-card']"
    )!;
    expect(card.textContent).toContain("Aeron Chair");
    expect(
      card.querySelector("[data-testid='checkout-quantity']")!.textContent
    ).toContain("2");
    expect(
      card.querySelector("[data-testid='checkout-unit-price']")!.textContent
    ).toContain("1,200");
    expect(
      card.querySelector("[data-testid='checkout-total']")!.textContent
    ).toContain("2,400");
    expect(
      card.querySelector("[data-testid='checkout-currency']")!.textContent
    ).toContain("USD");
  });

  // AC ec7ea376bc9a — Confirm Purchase button triggers the payment tool call
  it("invokes process_payment with the session id when Confirm Purchase is clicked", async () => {
    const { store, id } = seedWithCheckout();
    const execute = jest.fn(async () => JSON.stringify(ORDER));
    await h.render(<ChatPanel store={store} tools={payTool(execute)} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );

    await click(
      h.container.querySelector<HTMLElement>(
        "[data-testid='confirm-purchase-button']"
      )!
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ session_id: "cs_abc" });
  });

  // AC b28e7942617c — on success, render an order confirmation card with order id + timestamp
  it("renders an order confirmation card with id and timestamp after a successful payment", async () => {
    const { store, id } = seedWithCheckout();
    const execute = jest.fn(async () => JSON.stringify(ORDER));
    await h.render(<ChatPanel store={store} tools={payTool(execute)} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );
    await click(
      h.container.querySelector<HTMLElement>(
        "[data-testid='confirm-purchase-button']"
      )!
    );

    const orderCard = h.container.querySelector<HTMLElement>(
      "[data-testid='order-card']"
    );
    expect(orderCard).not.toBeNull();
    expect(
      orderCard!.querySelector("[data-testid='order-id']")!.textContent
    ).toContain("555");
    const ts = orderCard!.querySelector("[data-testid='order-timestamp']")!
      .textContent;
    expect(ts && ts.trim().length).toBeGreaterThan(0);
  });

  // AC fc2e1f65c371 — on failure (out of stock), render an error card with the reason
  it("renders an error card with the failure reason when payment fails", async () => {
    const { store, id } = seedWithCheckout();
    const execute = jest.fn(async () => "Error: 409 Out of stock");
    await h.render(<ChatPanel store={store} tools={payTool(execute)} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );
    await click(
      h.container.querySelector<HTMLElement>(
        "[data-testid='confirm-purchase-button']"
      )!
    );

    const errorCard = h.container.querySelector<HTMLElement>(
      "[data-testid='payment-error-card']"
    );
    expect(errorCard).not.toBeNull();
    expect(
      errorCard!.querySelector("[data-testid='payment-error-reason']")!.textContent
    ).toContain("Out of stock");
  });

  // AC 81879c90a674 — cards are visually distinct from regular text messages
  it("renders cards with a dedicated chat-card class, not as chat-message text bubbles", async () => {
    const { store, id } = seedWithCheckout();
    await h.render(<ChatPanel store={store} />);
    await click(
      h.container.querySelector<HTMLElement>(`[data-conversation-id='${id}']`)!
    );

    const card = h.container.querySelector<HTMLElement>(
      "[data-testid='checkout-card']"
    )!;
    expect(card.classList.contains("chat-card")).toBe(true);
    expect(card.classList.contains("chat-message")).toBe(false);
    expect(card.getAttribute("data-testid")).not.toBe("chat-message");
    // Only the user message remains a plain text bubble; the tool result is a card.
    expect(
      h.container.querySelectorAll("[data-testid='chat-message']")
    ).toHaveLength(1);
  });
});
