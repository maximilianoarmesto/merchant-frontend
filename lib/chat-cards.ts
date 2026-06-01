import type { CheckoutSession, Order } from "./api";

/**
 * Classification of a `role: 'tool'` chat message's content into a renderable
 * card. Tool results are persisted by commerceTools as either a JSON string
 * (a CheckoutSession from create_checkout_session, an Order from
 * process_payment) or an `Error: <reason>` string on failure. This parser is
 * the single source of truth for turning that raw content into a structured
 * card descriptor for ChatPanel.
 */
export type ToolResultCard =
  | { kind: "checkout"; session: CheckoutSession }
  | { kind: "order"; order: Order }
  | { kind: "error"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse a tool-result string into a card descriptor, or null when the content
 * is not a recognized checkout/order/error payload (e.g. a list_products array,
 * a plain product, or arbitrary text) — in which case the caller should fall
 * back to rendering a normal text bubble.
 */
export function parseToolResultCard(content: string): ToolResultCard | null {
  const trimmed = (content ?? "").trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("Error:")) {
    const reason = trimmed.slice("Error:".length).trim();
    return { kind: "error", reason: reason || "Unknown error" };
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  // Order (from process_payment) — distinguished by its payment/order status
  // fields and the back-reference to the checkout session it settled.
  if (
    "payment_status" in data &&
    "order_status" in data &&
    "checkout_session_id" in data
  ) {
    return { kind: "order", order: data as unknown as Order };
  }

  // CheckoutSession (from create_checkout_session) — has the per-unit price and
  // a created/paid/cancelled status.
  if (
    "unit_price" in data &&
    "total_amount" in data &&
    "product_name" in data &&
    "status" in data
  ) {
    return { kind: "checkout", session: data as unknown as CheckoutSession };
  }

  return null;
}
