import { parseToolResultCard } from "@/lib/chat-cards";
import type { CheckoutSession, Order } from "@/lib/api";

const session: CheckoutSession = {
  id: "cs_123",
  product_id: 7,
  product_name: "Aeron Chair",
  quantity: 2,
  unit_price: 1200,
  total_amount: 2400,
  currency: "USD",
  status: "created",
  created_at: "2026-06-01T10:00:00.000Z",
};

const order: Order = {
  id: 555,
  checkout_session_id: "cs_123",
  product_id: 7,
  product_name: "Aeron Chair",
  quantity: 2,
  total_amount: 2400,
  currency: "USD",
  payment_status: "paid",
  order_status: "confirmed",
  created_at: "2026-06-01T10:05:00.000Z",
};

describe("parseToolResultCard", () => {
  it("classifies a checkout session JSON as a checkout card", () => {
    const card = parseToolResultCard(JSON.stringify(session));
    expect(card).toEqual({ kind: "checkout", session });
  });

  it("classifies an order JSON as an order card", () => {
    const card = parseToolResultCard(JSON.stringify(order));
    expect(card).toEqual({ kind: "order", order });
  });

  it("classifies an 'Error:' string as an error card and extracts the reason", () => {
    const card = parseToolResultCard("Error: 409 Out of stock");
    expect(card).toEqual({ kind: "error", reason: "409 Out of stock" });
  });

  it("returns null for unrecognized JSON (e.g. a product list)", () => {
    expect(parseToolResultCard(JSON.stringify([{ id: 1 }]))).toBeNull();
    expect(parseToolResultCard("just some assistant text")).toBeNull();
    expect(parseToolResultCard("")).toBeNull();
  });
});
