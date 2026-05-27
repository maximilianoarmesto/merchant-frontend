import { catalogApi, checkoutApi } from "./api";
import type { ToolDefinition } from "./chat-adapter";

export interface CommerceToolDeps {
  catalog: Pick<typeof catalogApi, "listProducts" | "getProduct">;
  checkout: Pick<typeof checkoutApi, "createSession" | "paySession" | "listOrders">;
}

const defaultDeps: CommerceToolDeps = {
  catalog: catalogApi,
  checkout: checkoutApi,
};

function toolError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err);
  return `Error: ${msg}`;
}

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

function requireNumber(args: Record<string, unknown>, key: string): number {
  const raw = args[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  throw new Error(`Missing or invalid '${key}' (expected number)`);
}

function requireString(args: Record<string, unknown>, key: string): string {
  const raw = args[key];
  if (typeof raw === "string" && raw.length > 0) return raw;
  throw new Error(`Missing or invalid '${key}' (expected non-empty string)`);
}

export function createCommerceTools(
  deps: CommerceToolDeps = defaultDeps
): ToolDefinition[] {
  return [
    {
      name: "list_products",
      description:
        "List every product currently available in the merchant's catalog, including price, currency, stock, category, and active status. Call this when the user asks what's for sale, asks to browse the store, or wants to compare options before picking one.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        try {
          const products = await deps.catalog.listProducts();
          return asJson(products);
        } catch (err) {
          return toolError(err);
        }
      },
    },
    {
      name: "get_product",
      description:
        "Fetch full details for a single product by its numeric id. Call this once you know which product the user is interested in and need the latest price, stock, or description before confirming a purchase.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "Numeric id of the product to fetch.",
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      execute: async (args) => {
        try {
          const id = requireNumber(args, "id");
          const product = await deps.catalog.getProduct(id);
          return asJson(product);
        } catch (err) {
          return toolError(err);
        }
      },
    },
    {
      name: "create_checkout_session",
      description:
        "Create a checkout session reserving the given quantity of a product. Returns the session id, total amount, and status. Call this once the user has chosen a product and confirmed the quantity, before collecting payment. The backend may reject the call with a stock error if quantity exceeds available stock.",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "number",
            description: "Numeric id of the product being purchased.",
          },
          quantity: {
            type: "number",
            description: "How many units to purchase (positive integer).",
          },
        },
        required: ["product_id", "quantity"],
        additionalProperties: false,
      },
      execute: async (args) => {
        try {
          const productId = requireNumber(args, "product_id");
          const quantity = requireNumber(args, "quantity");
          const session = await deps.checkout.createSession(productId, quantity);
          return asJson(session);
        } catch (err) {
          return toolError(err);
        }
      },
    },
    {
      name: "process_payment",
      description:
        "Process payment for an existing checkout session, converting it into a paid order. Returns the resulting order with payment_status and order_status. Call this after create_checkout_session succeeds and the user has explicitly confirmed they want to pay.",
      parameters: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description:
              "The checkout session id returned by create_checkout_session.",
          },
        },
        required: ["session_id"],
        additionalProperties: false,
      },
      execute: async (args) => {
        try {
          const sessionId = requireString(args, "session_id");
          const order = await deps.checkout.paySession(sessionId);
          return asJson(order);
        } catch (err) {
          return toolError(err);
        }
      },
    },
    {
      name: "list_orders",
      description:
        "List every order that has already been paid. Call this when the user asks about their past purchases, order history, or to look up the status of a previous order.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        try {
          const orders = await deps.checkout.listOrders();
          return asJson(orders);
        } catch (err) {
          return toolError(err);
        }
      },
    },
  ];
}

export const commerceTools: ToolDefinition[] = createCommerceTools();
