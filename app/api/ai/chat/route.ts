import { NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

const CATALOG_API_URL =
  process.env.NEXT_PUBLIC_CATALOG_API_URL || "http://localhost:8001";
const CHECKOUT_API_URL =
  process.env.NEXT_PUBLIC_CHECKOUT_API_URL || "http://localhost:8002";

type IncomingMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatBody = {
  message?: unknown;
  history?: unknown;
  apiKey?: unknown;
  model?: unknown;
};

const SYSTEM_PROMPT = `You are a helpful Merchant commerce assistant for an online store.
You help the merchant and their customers explore the product catalog and review orders.
Use the search_products tool to find products (optionally filtering by name, price range, or category).
Use the list_orders tool to look up placed orders.
Only rely on data returned by the tools — never invent products, prices, or orders.
Answer concisely and format prices with their currency.`;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the product catalog. All parameters are optional; omit them to list every product.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Filter by product name (case-insensitive substring match).",
          },
          min_price: {
            type: "number",
            description: "Only include products priced at or above this amount.",
          },
          max_price: {
            type: "number",
            description: "Only include products priced at or below this amount.",
          },
          category: {
            type: "string",
            description: "Filter by product category.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_orders",
      description: "List all placed orders in the store.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

type SearchProductsArgs = {
  name?: string;
  min_price?: number;
  max_price?: number;
  category?: string;
};

async function searchProducts(args: SearchProductsArgs): Promise<unknown> {
  const params = new URLSearchParams();
  if (typeof args.name === "string" && args.name.length > 0) {
    params.set("name", args.name);
  }
  if (typeof args.min_price === "number") {
    params.set("min_price", String(args.min_price));
  }
  if (typeof args.max_price === "number") {
    params.set("max_price", String(args.max_price));
  }
  if (typeof args.category === "string" && args.category.length > 0) {
    params.set("category", args.category);
  }

  const query = params.toString();
  const url = `${CATALOG_API_URL}/products${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Catalog service responded with ${res.status}`);
  }
  const products = (await res.json()) as Array<Record<string, unknown>>;

  // The catalog may not honour every filter, so apply them defensively here too.
  return products.filter((product) => {
    const name = String(product.name ?? "").toLowerCase();
    const price = Number(product.price);
    const category = String(product.category ?? "");
    if (args.name && !name.includes(args.name.toLowerCase())) return false;
    if (typeof args.min_price === "number" && price < args.min_price) return false;
    if (typeof args.max_price === "number" && price > args.max_price) return false;
    if (args.category && category.toLowerCase() !== args.category.toLowerCase()) {
      return false;
    }
    return true;
  });
}

async function listOrders(): Promise<unknown> {
  const res = await fetch(`${CHECKOUT_API_URL}/orders`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Checkout service responded with ${res.status}`);
  }
  return (await res.json()) as unknown;
}

async function executeTool(name: string, rawArgs: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case "search_products":
      return searchProducts(args as SearchProductsArgs);
    case "list_orders":
      return listOrders();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { message, history, apiKey, model } = body;

  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return NextResponse.json({ error: "No API key configured" }, { status: 400 });
  }
  if (typeof message !== "string" || message.length === 0) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  const modelName = typeof model === "string" && model.length > 0 ? model : "gpt-4o-mini";

  const priorMessages: ChatCompletionMessageParam[] = Array.isArray(history)
    ? (history as IncomingMessage[])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant" || m.role === "system") &&
            typeof m.content === "string",
        )
        .map((m) => ({ role: m.role, content: m.content }))
    : [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...priorMessages,
    { role: "user", content: message },
  ];

  const openai = new OpenAI({ apiKey });

  try {
    // Agentic loop: keep letting the model call tools until it produces a final answer.
    const MAX_TURNS = 5;
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages,
        tools,
      });

      const choice = completion.choices[0];
      const responseMessage = choice.message;
      const toolCalls = responseMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return NextResponse.json({ reply: responseMessage.content ?? "" });
      }

      // Record the assistant's tool-call request, then append each tool result.
      messages.push(responseMessage);

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
        let result: unknown;
        try {
          result = await executeTool(
            toolCall.function.name,
            toolCall.function.arguments,
          );
        } catch (error) {
          result = {
            error: error instanceof Error ? error.message : "Tool execution failed",
          };
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json(
      { error: "The assistant did not produce a final answer." },
      { status: 502 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `AI request failed: ${detail}` },
      { status: 502 },
    );
  }
}
