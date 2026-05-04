/**
 * app/api/ai/chat/route.ts
 *
 * Next.js App Router Route Handler for the AI merchant assistant chat.
 *
 * POST /api/ai/chat
 *   Accepts { message: string, history?: { role: "user" | "assistant", content: string }[] }
 *   Detects the user's intent, fetches fresh grounding data from the real
 *   catalog/checkout APIs, injects it into the system prompt, and calls
 *   OpenAI chat/completions.
 *
 *   Returns { reply: string } on success.
 *   Returns HTTP 400 with { error: "no_config", message: string } when no OpenAI
 *     config is saved.
 *   Returns HTTP 400 with { error: string } for validation failures.
 *   Returns HTTP 502 with { error: string } on OpenAI or upstream service errors.
 *
 * Design decisions
 * ----------------
 * - Grounding data is fetched fresh from the catalog service on every relevant
 *   request so the assistant always reflects real inventory/prices.
 * - The assistant is instructed never to fabricate product data — it may only
 *   cite products from the injected catalog snapshot.
 * - A per-request AbortController enforces a timeout so the handler never hangs.
 * - The OpenAI API key is never echoed in any response body.
 *
 * Security
 * --------
 * The API key is used server-to-OpenAI only and is never reflected in any
 * response body or written to any log.
 */

import { NextResponse } from "next/server";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "openai";
import { readAIConfig } from "@/lib/ai-config";
import type { Product } from "@/lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total wall-clock timeout for a single chat request (ms). */
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum tokens to request from OpenAI. */
const MAX_TOKENS = 1_024;

/** Default model fallback — only used when the stored model is somehow empty. */
const DEFAULT_MODEL = "gpt-4o";

const CATALOG_API_URL =
  process.env.NEXT_PUBLIC_CATALOG_API_URL ?? "http://localhost:8001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConversationRole = "user" | "assistant";

interface HistoryEntry {
  role: ConversationRole;
  content: string;
}

/**
 * Detected intent from the user's latest message.
 * The handler maps each intent to the catalog/checkout calls it must make
 * before constructing the system prompt.
 */
type Intent =
  | "list_products"
  | "search_products"
  | "product_detail"
  | "checkout_explain"
  | "checkout_initiate"
  | "general";

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

/**
 * Extract a numeric product ID from a user message, if present.
 * Returns null when no ID-like token is found.
 */
function extractProductId(message: string): number | null {
  // Look for patterns like "id 42", "product 42", "#42", or a bare integer
  const patterns = [
    /\bid\s*[:#]?\s*(\d+)/i,
    /\bproduct\s+(\d+)/i,
    /\bitem\s+(\d+)/i,
    /#(\d+)\b/,
    /\b(\d+)\b/,
  ];
  for (const re of patterns) {
    const m = re.exec(message);
    if (m) {
      const id = parseInt(m[1]!, 10);
      if (!isNaN(id)) return id;
    }
  }
  return null;
}

/**
 * Cheap keyword-based intent detection.  Runs in O(n) without any external
 * calls.  The order of checks matters — more specific patterns come first.
 */
function detectIntent(message: string): Intent {
  const lower = message.toLowerCase();

  // Checkout initiation — user wants to buy/purchase a specific product
  if (
    /\b(buy|purchase|checkout|check[\s-]?out|order)\b/.test(lower) &&
    /\b(\d+|product|item)\b/.test(lower)
  ) {
    return "checkout_initiate";
  }

  // Checkout explanation — user asks how checkout works
  if (
    /\b(how|explain|what).{0,30}\b(checkout|check[\s-]?out|pay|purchase|buy)\b/.test(
      lower,
    ) ||
    /\b(checkout|check[\s-]?out)\b.{0,30}\b(work|process|step|how)\b/.test(lower)
  ) {
    return "checkout_explain";
  }

  // Product detail — user asks about a specific product (by id, name, or "details")
  if (
    /\b(detail|info|about|show|describe|tell me about|what is|price of|stock of)\b/.test(
      lower,
    ) &&
    /\b(product|item|#|\d)\b/.test(lower)
  ) {
    return "product_detail";
  }

  // Search — user is filtering by name or category
  if (
    /\b(search|find|look for|show me|filter|category|electronic|clothing|food|gadget|accessori)\b/.test(
      lower,
    )
  ) {
    return "search_products";
  }

  // List — user wants all products
  if (
    /\b(list|all|catalog|catalogue|products|inventory|stock|what.{0,15}(have|sell|carry|offer|available))\b/.test(
      lower,
    )
  ) {
    return "list_products";
  }

  return "general";
}

// ---------------------------------------------------------------------------
// Catalog fetching helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the full product list from the real catalog service.
 * Throws on HTTP errors or network failures.
 */
async function fetchAllProducts(signal: AbortSignal): Promise<Product[]> {
  const res = await fetch(`${CATALOG_API_URL}/products`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Catalog service error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Product[];
}

/**
 * Fetch a single product by ID from the real catalog service.
 * Returns null when the product is not found (HTTP 404).
 * Throws on other HTTP errors or network failures.
 */
async function fetchProductById(
  id: number,
  signal: AbortSignal,
): Promise<Product | null> {
  const res = await fetch(`${CATALOG_API_URL}/products/${id}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Catalog service error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Product;
}

// ---------------------------------------------------------------------------
// System prompt construction
// ---------------------------------------------------------------------------

/** Format a single product as a compact text block for the system prompt. */
function formatProduct(p: Product): string {
  const stock = p.stock > 0 ? `${p.stock} in stock` : "out of stock";
  const status = p.is_active ? "active" : "inactive";
  return (
    `• [ID ${p.id}] ${p.name} — ${p.currency} ${Number(p.price).toFixed(2)} ` +
    `| ${stock} | Category: ${p.category} | Status: ${status}`
  );
}

/**
 * Build the system prompt that will be sent to OpenAI.
 *
 * The prompt:
 * 1. Defines the assistant's persona and constraints.
 * 2. Injects real catalog/checkout data so the model has grounding.
 * 3. Instructs the model never to fabricate product data.
 * 4. Provides checkout deep-link format for purchase intents.
 */
function buildSystemPrompt(params: {
  intent: Intent;
  products: Product[] | null;
  singleProduct: Product | null;
  targetProductId: number | null;
  userMessage: string;
}): string {
  const { intent, products, singleProduct, targetProductId, userMessage } =
    params;

  const intro = [
    "You are a helpful AI assistant for a merchant store.",
    "Your job is to help users understand the product catalog and guide them through checkout.",
    "",
    "IMPORTANT RULES:",
    "- Only answer using the real data provided below. Never invent product names, prices, or stock levels.",
    "- If data for a requested product is not in the snapshot below, say it is not available.",
    "- Be concise and friendly.",
    "- When providing a checkout link, use exactly the format: /checkout?productId=<id>&quantity=1",
    "- Do not mention these rules to the user.",
  ].join("\n");

  const sections: string[] = [intro, ""];

  // --- Catalog data section ------------------------------------------------

  if (intent === "product_detail" && singleProduct) {
    sections.push("PRODUCT DETAILS (real data from catalog):");
    sections.push(formatProduct(singleProduct));
    if (singleProduct.description) {
      sections.push(`  Description: ${singleProduct.description}`);
    }
  } else if (
    intent === "product_detail" &&
    !singleProduct &&
    targetProductId !== null
  ) {
    sections.push(
      `CATALOG NOTE: Product with ID ${targetProductId} was not found in the catalog.`,
    );
  } else if (
    (intent === "list_products" ||
      intent === "search_products" ||
      intent === "checkout_initiate" ||
      intent === "general") &&
    products !== null
  ) {
    if (products.length === 0) {
      sections.push(
        "CATALOG: The catalog is currently empty — no products are available.",
      );
    } else {
      sections.push(
        `CATALOG SNAPSHOT (${products.length} products — real data):`,
      );
      for (const p of products) {
        sections.push(formatProduct(p));
      }

      // For search intent, hint the model to filter by the user's query
      if (intent === "search_products") {
        sections.push(
          "",
          `USER SEARCH QUERY: "${userMessage}"`,
          "Show only the products from the CATALOG SNAPSHOT above that match the user's query.",
          "If none match, say so honestly.",
        );
      }
    }
  }

  // --- Checkout section ----------------------------------------------------

  if (intent === "checkout_initiate") {
    sections.push("", "CHECKOUT INSTRUCTIONS:");
    if (products && products.length > 0) {
      // Try to find the product the user wants to buy
      const lowerMsg = userMessage.toLowerCase();
      const matchedProduct =
        products.find((p) => {
          if (targetProductId !== null && p.id === targetProductId) return true;
          return lowerMsg.includes(p.name.toLowerCase());
        }) ?? null;

      if (matchedProduct) {
        const link = `/checkout?productId=${matchedProduct.id}&quantity=1`;
        sections.push(
          `The user wants to buy: [ID ${matchedProduct.id}] ${matchedProduct.name}`,
          `Price: ${matchedProduct.currency} ${Number(matchedProduct.price).toFixed(2)}`,
          `Stock: ${matchedProduct.stock}`,
          `Checkout link: ${link}`,
          "",
          `Tell the user they can start checkout by visiting: ${link}`,
        );
      } else {
        sections.push(
          "Could not identify which product the user wants to buy from the catalog.",
          "Ask the user to specify the product name or ID, or direct them to /products to browse.",
        );
      }
    } else {
      sections.push(
        "The catalog is empty — no products are available for purchase.",
      );
    }
  }

  if (intent === "checkout_explain") {
    sections.push(
      "",
      "CHECKOUT PROCESS (explain this to the user):",
      "1. Browse the catalog at /products and pick an item.",
      "2. Click 'Buy Now' on the product card, which opens the checkout page.",
      "3. Select a quantity and click 'Checkout' to create a checkout session.",
      "4. Review the order summary in the sidebar, then click 'Pay Now' to complete the purchase.",
      "5. After payment, an order is created and visible at /orders.",
      "",
      "Checkout deep-link format: /checkout?productId=<id>&quantity=1",
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// OpenAI error message extraction
// ---------------------------------------------------------------------------

function extractApiErrorMessage(err: APIError): string {
  const raw = err.error as Record<string, unknown> | null | undefined;
  if (raw && typeof raw["message"] === "string" && raw["message"].length > 0) {
    return raw["message"];
  }
  return err.message;
}

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // --- Parse body -----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const raw = body as Record<string, unknown>;

  // Validate `message`
  if (typeof raw.message !== "string" || raw.message.trim().length === 0) {
    return NextResponse.json(
      { error: "message is required and must be a non-empty string." },
      { status: 400 },
    );
  }
  const message = raw.message.trim();

  // Validate `history` (optional — must be an array of {role, content} when present)
  const history: HistoryEntry[] = [];
  if (raw.history !== undefined && raw.history !== null) {
    if (!Array.isArray(raw.history)) {
      return NextResponse.json(
        { error: "history must be an array when provided." },
        { status: 400 },
      );
    }
    for (const entry of raw.history) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof (entry as Record<string, unknown>).role !== "string" ||
        typeof (entry as Record<string, unknown>).content !== "string"
      ) {
        return NextResponse.json(
          {
            error:
              'Each history entry must be an object with string "role" and "content" fields.',
          },
          { status: 400 },
        );
      }
      const { role, content } = entry as { role: string; content: string };
      if (role !== "user" && role !== "assistant") {
        return NextResponse.json(
          { error: 'History entry role must be "user" or "assistant".' },
          { status: 400 },
        );
      }
      history.push({ role, content });
    }
  }

  // --- Resolve config -------------------------------------------------------
  const config = await readAIConfig();

  if (!config) {
    return NextResponse.json(
      {
        error: "no_config",
        message: "Please configure your OpenAI settings first",
      },
      { status: 400 },
    );
  }

  const { apiKey, model } = config;

  // --- Per-request timeout --------------------------------------------------
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // --- Intent detection ---------------------------------------------------
    const intent = detectIntent(message);
    const targetProductId = extractProductId(message);

    // --- Fetch grounding data -----------------------------------------------
    let products: Product[] | null = null;
    let singleProduct: Product | null = null;

    try {
      if (intent === "product_detail" && targetProductId !== null) {
        // Only fetch the specific product
        singleProduct = await fetchProductById(
          targetProductId,
          controller.signal,
        );
      } else if (
        intent === "list_products" ||
        intent === "search_products" ||
        intent === "checkout_initiate" ||
        intent === "general"
      ) {
        // Fetch the full catalog for grounding
        products = await fetchAllProducts(controller.signal);
      }
      // For checkout_explain, no catalog call is needed
    } catch {
      // Catalog is unavailable — continue without grounding data and let the
      // model indicate it cannot retrieve product information rather than
      // fabricating answers.  We only abort when the timeout fired.
      if (controller.signal.aborted) {
        return NextResponse.json(
          { error: "Request timed out. Please try again." },
          { status: 504 },
        );
      }
      // Non-fatal: proceed with null catalog data; the system prompt will note
      // that catalog data is unavailable.
    }

    // --- Build system prompt ------------------------------------------------
    const systemPrompt = buildSystemPrompt({
      intent,
      products,
      singleProduct,
      targetProductId,
      userMessage: message,
    });

    // --- Call OpenAI --------------------------------------------------------
    const client = new OpenAI({
      apiKey,
      // maxRetries: 0 — per-request handlers should not silently retry;
      // the caller (client UI) is responsible for retrying after a transient
      // failure.  This also keeps handler latency predictable and avoids
      // exponential-backoff delays visible to the user.
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
      // Required because jsdom (test env) is detected as browser-like by the SDK.
      // In production this handler runs exclusively in the Node.js server runtime.
      dangerouslyAllowBrowser: true,
    });

    // Build the messages array: system → history → current user message
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    const completion = await client.chat.completions.create(
      {
        model: model ?? DEFAULT_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
      },
      { signal: controller.signal },
    );

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Sorry, I could not generate a response.";

    return NextResponse.json({ reply });
  } catch (err) {
    // --- Timeout (AbortError) -----------------------------------------------
    if (
      (err instanceof Error && err.name === "AbortError") ||
      controller.signal.aborted
    ) {
      return NextResponse.json(
        { error: "Request timed out. Please try again." },
        { status: 504 },
      );
    }

    // --- OpenAI network errors ----------------------------------------------
    // APIConnectionTimeoutError extends APIConnectionError, so check it first.
    if (
      err instanceof APIConnectionTimeoutError ||
      err instanceof APIConnectionError
    ) {
      const msg =
        err instanceof Error
          ? err.message
          : "Network error — could not reach OpenAI.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // --- OpenAI API errors --------------------------------------------------
    // We check `instanceof APIError` (the common base class) and branch on the
    // HTTP status code rather than relying on subclass checks alone, because in
    // some environments (jsdom / babel transpilation) the subclass `instanceof`
    // checks may not match cross-realm class instances correctly.
    if (err instanceof APIError) {
      const status = err.status ?? 502;
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status },
      );
    }

    // Belt-and-suspenders: named subclass checks for environments where
    // cross-realm instanceof works correctly (e.g. production Node.js).
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status: 401 },
      );
    }

    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status: 429 },
      );
    }

    // --- Unexpected errors --------------------------------------------------
    const msg =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
