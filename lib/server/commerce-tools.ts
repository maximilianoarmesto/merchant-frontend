import "server-only";

import { z } from "zod";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";

import type { Order, Product } from "@/lib/models/commerce";
import {
  CommerceApiError,
  CommerceResponseError,
} from "@/lib/server/commerce-client";
import {
  commerceRepository,
  type CommerceAuthContext,
} from "@/lib/server/commerce-repository";

/**
 * The read-only commerce tools the AI assistant may call.
 *
 * This module is the entire tool surface: `TOOL_DEFINITIONS` is a closed map,
 * every handler delegates to one of the four functions in
 * `lib/server/commerce-repository.ts`, and that repository is itself read-only
 * by construction (`getJson` hardcodes `method: "GET"` — see
 * `lib/server/commerce-client.ts`).
 *
 * Three things keep it that way:
 *
 * 1. **No generic escape hatch.** There is no "call this URL" or "run this
 *    query" tool; a model can only reach the four named reads below.
 * 2. **Dispatch is by exact name.** `executeCommerceTool` looks the name up in
 *    the map and reports an error for anything else, so a hallucinated
 *    `create_order` never resolves to a handler.
 * 3. **The names are asserted at module load** (see `assertReadOnly` at the
 *    bottom): adding a tool whose name is not a `list_*` / `get_*` read fails
 *    fast rather than quietly widening what the model can do.
 */

/** Caps on how much the model can pull into the conversation at once. */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional()
  .describe(`Maximum rows to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`);

const offsetSchema = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe("Rows to skip, for paging through a longer list.");

const listProductsArgsSchema = z.object({
  category: z.string().optional().describe("Restrict to one catalog category."),
  isActive: z
    .boolean()
    .optional()
    .describe("Restrict to active (true) or inactive (false) products."),
  limit: limitSchema,
  offset: offsetSchema,
});

const getProductArgsSchema = z.object({
  productId: z
    .union([z.number().int(), z.string().min(1)])
    .describe("Id of the product to fetch, as shown in the catalog."),
});

const listOrdersArgsSchema = z.object({
  status: z
    .string()
    .optional()
    .describe('Restrict to one order status, e.g. "paid" or "pending".'),
  limit: limitSchema,
  offset: offsetSchema,
});

const getOrderArgsSchema = z.object({
  orderId: z
    .union([z.number().int(), z.string().min(1)])
    .describe("Id of the order to fetch."),
});

/** Identity and scope for the reads one tool call performs. */
export interface CommerceToolContext {
  /** Defaults to the inbound request's session; pass one outside a request. */
  auth?: CommerceAuthContext;
  signal?: AbortSignal;
}

interface CommerceToolDefinition<S extends z.ZodType = z.ZodType> {
  description: string;
  args: S;
  run(args: z.output<S>, context: CommerceToolContext): Promise<unknown>;
}

/** Identity, but it ties each handler's `args` to that tool's own schema. */
function defineTool<S extends z.ZodType>(
  definition: CommerceToolDefinition<S>,
): CommerceToolDefinition<S> {
  return definition;
}

/** The complete tool catalog. Every entry reads; none of them writes. */
const TOOL_DEFINITIONS = {
  list_products: defineTool({
    description:
      "List the merchant's catalog products, read live from the catalog " +
      "service. Use this to answer questions about what is for sale, stock " +
      "levels, prices and categories.",
    args: listProductsArgsSchema,
    async run(args, context) {
      const products = await commerceRepository.listProducts({
        ...context,
        category: args.category,
        isActive: args.isActive,
        limit: args.limit ?? DEFAULT_LIMIT,
        offset: args.offset,
      });
      return { count: products.length, products: products.map(summarizeProduct) };
    },
  }),
  get_product: defineTool({
    description:
      "Fetch one product by id, including description and stock. Returns " +
      "found: false when the merchant has no product with that id.",
    args: getProductArgsSchema,
    async run(args, context) {
      const product = await commerceRepository.getProduct(args.productId, context);
      return product
        ? { found: true, product: summarizeProduct(product) }
        : { found: false, productId: args.productId };
    },
  }),
  list_orders: defineTool({
    description:
      "List the merchant's orders from the checkout service. Use this for " +
      "questions about sales, revenue, order volume or payment status.",
    args: listOrdersArgsSchema,
    async run(args, context) {
      const orders = await commerceRepository.listOrders({
        ...context,
        status: args.status,
        limit: args.limit ?? DEFAULT_LIMIT,
        offset: args.offset,
      });
      return { count: orders.length, orders: orders.map(summarizeOrder) };
    },
  }),
  get_order: defineTool({
    description:
      "Fetch one order by id. Returns found: false when the merchant has no " +
      "order with that id.",
    args: getOrderArgsSchema,
    async run(args, context) {
      const order = await commerceRepository.getOrder(args.orderId, context);
      return order
        ? { found: true, order: summarizeOrder(order) }
        : { found: false, orderId: args.orderId };
    },
  }),
} as const;

export type CommerceToolName = keyof typeof TOOL_DEFINITIONS;

export const COMMERCE_TOOL_NAMES = Object.keys(TOOL_DEFINITIONS) as CommerceToolName[];

export function isCommerceToolName(name: string): name is CommerceToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, name);
}

/**
 * Products and orders go to the model as-is apart from these projections,
 * which drop the audit timestamps the assistant never needs to reason about
 * and would otherwise pay for on every turn.
 */
function summarizeProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    stock: product.stock,
    category: product.category,
    isActive: product.isActive,
  };
}

function summarizeOrder(order: Order) {
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    quantity: order.quantity,
    totalAmount: order.totalAmount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
  };
}

/** zod → the JSON Schema OpenAI expects, minus the `$schema` key it ignores. */
function toParameterSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  return parameters;
}

/**
 * The tool list handed to `chat.completions.create`. Built from the same zod
 * schemas the handlers validate against, so the advertised contract and the
 * enforced one cannot drift apart.
 */
export const COMMERCE_TOOLS: ChatCompletionFunctionTool[] = COMMERCE_TOOL_NAMES.map(
  (name) => ({
    type: "function",
    function: {
      name,
      description: TOOL_DEFINITIONS[name].description,
      parameters: toParameterSchema(TOOL_DEFINITIONS[name].args),
    },
  }),
);

/** What one tool call produced, ready to be sent back to the model. */
export interface CommerceToolOutcome {
  ok: boolean;
  /** JSON-serializable payload; becomes the `tool` message content. */
  payload: unknown;
}

function failure(message: string): CommerceToolOutcome {
  // Handed back to the model rather than thrown: it can then tell the merchant
  // what went wrong, or retry with corrected arguments.
  return { ok: false, payload: { error: message } };
}

/**
 * Runs one model-requested tool call.
 *
 * Never throws: a bad name, unparseable arguments or an upstream failure all
 * come back as `{ ok: false }` with a message the model can relay, which keeps
 * one failed read from ending the whole conversation.
 */
export async function executeCommerceTool(
  name: string,
  rawArguments: string,
  context: CommerceToolContext = {},
): Promise<CommerceToolOutcome> {
  if (!isCommerceToolName(name)) {
    return failure(
      `Unknown tool "${name}". Available read-only tools: ${COMMERCE_TOOL_NAMES.join(", ")}. ` +
        "This assistant cannot create, update or delete commerce data.",
    );
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
  } catch {
    return failure(`Arguments for "${name}" were not valid JSON`);
  }

  const definition: CommerceToolDefinition = TOOL_DEFINITIONS[name];
  const args = definition.args.safeParse(parsedArguments);
  if (!args.success) {
    return failure(
      `Invalid arguments for "${name}": ${args.error.issues
        .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  try {
    return { ok: true, payload: await definition.run(args.data, context) };
  } catch (error) {
    return failure(describeCommerceError(name, error));
  }
}

/** Turns an upstream failure into something the model can say out loud. */
function describeCommerceError(name: CommerceToolName, error: unknown): string {
  if (error instanceof CommerceApiError) {
    if (error.isUnauthorized) {
      return `The ${error.service} service rejected this merchant's session, so ${name} could not be read`;
    }
    return `The ${error.service} service returned ${error.status} for ${name}`;
  }
  if (error instanceof CommerceResponseError) {
    return `The ${error.service} service returned an unexpected payload for ${name}`;
  }
  if (error instanceof Error) return `${name} failed: ${error.message}`;
  return `${name} failed for an unknown reason`;
}

/**
 * Load-time guard on the read-only contract. Tool names are the one part of
 * this module a future edit is likely to touch, so a name that is not a read
 * fails the import rather than reaching a model.
 */
const READ_ONLY_TOOL_NAME = /^(list|get)_[a-z0-9_]+$/;

for (const name of COMMERCE_TOOL_NAMES) {
  if (!READ_ONLY_TOOL_NAME.test(name)) {
    throw new Error(
      `Commerce tool "${name}" is not a read: only list_*/get_* tools may be exposed to the model`,
    );
  }
}

export const commerceTools = {
  definitions: COMMERCE_TOOLS,
  names: COMMERCE_TOOL_NAMES,
  execute: executeCommerceTool,
} as const;
