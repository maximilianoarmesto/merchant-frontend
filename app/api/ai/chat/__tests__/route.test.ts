/**
 * Unit tests for app/api/ai/chat/route.ts
 *
 * Strategy
 * --------
 * - lib/ai-config is mocked so no file-system I/O occurs.
 * - global.fetch is replaced by jest-fetch-mock (configured in jest.config.ts
 *   setupFiles), intercepting both catalog API calls and OpenAI API calls.
 * - The handler is imported directly and called with a synthetic Request so we
 *   exercise the handler logic in isolation.
 *
 * Environment note
 * ----------------
 * jsdom does not implement the static `Response.json()` helper; the same
 * polyfill used in other route tests is applied here.
 *
 * Coverage
 * --------
 * 1.  Missing/invalid OpenAI config → 400 { error: "no_config", message }
 * 2.  Body validation (missing message, wrong type, empty string, bad history)
 * 3.  Successful reply — happy path
 * 4.  Conversation history is forwarded to OpenAI
 * 5.  Catalog data fetched for list_products intent
 * 6.  Catalog data fetched for search_products intent
 * 7.  Single-product fetch for product_detail intent
 * 8.  Checkout deep-link returned for checkout_initiate intent
 * 9.  Checkout explanation for checkout_explain intent (no catalog call)
 * 10. OpenAI auth error → 401
 * 11. OpenAI rate-limit error → 429
 * 12. OpenAI generic API error → proxied status
 * 13. OpenAI network error → 502
 * 14. Catalog service unavailable — continues without grounding
 * 15. System prompt contains injected catalog data
 * 16. API key is never reflected in any response body
 */

// ---------------------------------------------------------------------------
// Polyfill Response.json for jsdom (matches pattern used in other route tests)
// ---------------------------------------------------------------------------
if (typeof Response !== "undefined" && typeof Response.json !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Response as any).json = function (data: unknown, init?: ResponseInit): Response {
    const body = JSON.stringify(data);
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return new Response(body, { ...init, headers });
  };
}

import fetchMock from "jest-fetch-mock";
import { POST } from "../route";
import * as aiConfig from "@/lib/ai-config";

// ---------------------------------------------------------------------------
// Mock lib/ai-config
// ---------------------------------------------------------------------------
jest.mock("@/lib/ai-config", () => ({
  readAIConfig: jest.fn(),
  readConfig: jest.fn(),
  writeConfig: jest.fn(),
}));

const mockReadAIConfig = aiConfig.readAIConfig as jest.MockedFunction<
  typeof aiConfig.readAIConfig
>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_CONFIG = { apiKey: "sk-test-key", model: "gpt-4o" };

const PRODUCT_1 = {
  id: 1,
  name: "Wireless Headphones",
  description: "Great sound quality",
  price: 49.99,
  currency: "USD",
  stock: 10,
  category: "Electronics",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const PRODUCT_2 = {
  id: 2,
  name: "Mechanical Keyboard",
  description: "Clicky and fast",
  price: 129.0,
  currency: "USD",
  stock: 5,
  category: "Peripherals",
  is_active: true,
  created_at: "2024-01-02T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
};

const OPENAI_SUCCESS_RESPONSE = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Here are your products." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic POST Request with a JSON body. */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a synthetic POST Request with a malformed body. */
function makeMalformedRequest(): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json{{",
  });
}

/** Parse the JSON body from a Response. */
async function parseBody(response: Response): Promise<unknown> {
  return response.json();
}

/**
 * Program fetchMock with a URL-dispatching handler that serves:
 *   GET  /products          → productList
 *   GET  /products/:id      → singleProduct (or 404 if null)
 *   POST https://api.openai.com/v1/chat/completions → openAiResponse
 *
 * Any other URL is rejected so unintended calls fail loudly.
 */
function setupFetchMocks({
  productList = [PRODUCT_1, PRODUCT_2],
  singleProduct = PRODUCT_1 as typeof PRODUCT_1 | null,
  openAiResponse = OPENAI_SUCCESS_RESPONSE,
  catalogStatus = 200,
  openAiStatus = 200,
}: {
  productList?: object[];
  singleProduct?: typeof PRODUCT_1 | null;
  openAiResponse?: object;
  catalogStatus?: number;
  openAiStatus?: number;
} = {}) {
  fetchMock.mockResponse((req) => {
    const url = new URL(req.url);

    // OpenAI chat completions endpoint
    if (req.url.includes("api.openai.com")) {
      return Promise.resolve({
        body: JSON.stringify(openAiResponse),
        status: openAiStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Single product detail
    if (url.pathname.match(/^\/products\/\d+$/)) {
      if (singleProduct === null) {
        return Promise.resolve({
          body: JSON.stringify({ detail: "Not found" }),
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify(singleProduct),
        status: catalogStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Product list
    if (url.pathname === "/products") {
      return Promise.resolve({
        body: JSON.stringify(productList),
        status: catalogStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    return Promise.reject(
      new Error(`Unexpected fetch: ${req.method} ${req.url}`),
    );
  });
}

/** Return the body parsed from the most recent OpenAI chat completion call. */
function getLastOpenAiRequestBody(): Record<string, unknown> | null {
  const calls = (fetchMock as unknown as jest.Mock).mock.calls as Array<
    [string | Request, RequestInit?]
  >;
  const openAiCall = [...calls]
    .reverse()
    .find(([input]) => {
      const url =
        typeof input === "string" ? input : (input as Request).url ?? "";
      return url.includes("api.openai.com");
    });
  if (!openAiCall) return null;
  const [, init] = openAiCall;
  if (!init?.body) return null;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

/** Return all fetch calls to a URL matching the predicate. */
function getFetchCalls(predicate: (url: string) => boolean) {
  return (fetchMock as unknown as jest.Mock).mock.calls.filter(([input]) => {
    const url =
      typeof input === "string" ? input : (input as Request).url ?? "";
    return predicate(url);
  });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.resetMocks();
  fetchMock.enableMocks();
});

// ===========================================================================
// 1. Missing / invalid OpenAI config
// ===========================================================================

describe("missing or invalid OpenAI config", () => {
  it("returns HTTP 400 when readAIConfig returns null", async () => {
    mockReadAIConfig.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns { error: "no_config" } when config is missing', async () => {
    mockReadAIConfig.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.error).toBe("no_config");
  });

  it("returns a human-readable message when config is missing", async () => {
    mockReadAIConfig.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.message).toBe("string");
    expect((body.message as string).length).toBeGreaterThan(0);
    expect(body.message).toMatch(/configure|settings|openai/i);
  });

  it("does NOT call fetch when config is missing", async () => {
    mockReadAIConfig.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    await POST(req);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Body validation
// ===========================================================================

describe("request body validation", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns HTTP 400 when body is malformed JSON", async () => {
    const req = makeMalformedRequest();
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns an error property when body is malformed JSON", async () => {
    const req = makeMalformedRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
  });

  it("returns HTTP 400 when body is a JSON array", async () => {
    const req = makeRequest([{ message: "Hi" }]);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when message is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when message is not a string", async () => {
    const req = makeRequest({ message: 42 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when message is an empty string", async () => {
    const req = makeRequest({ message: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when message is a whitespace-only string", async () => {
    const req = makeRequest({ message: "   " });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when history is not an array", async () => {
    const req = makeRequest({ message: "Hello", history: "bad" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when a history entry is missing role", async () => {
    const req = makeRequest({
      message: "Hello",
      history: [{ content: "Hi" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns HTTP 400 when a history entry has an invalid role", async () => {
    const req = makeRequest({
      message: "Hello",
      history: [{ role: "system", content: "Hi" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts a null history field (treated as empty)", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List products", history: null });
    const res = await POST(req);
    // Should proceed to call OpenAI, not return a 400
    expect(res.status).not.toBe(400);
  });
});

// ===========================================================================
// 3. Successful reply — happy path
// ===========================================================================

describe("successful reply", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns HTTP 200 on a successful chat completion", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List all products" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns { reply: string } on success", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List all products" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.reply).toBe("string");
  });

  it("returns the assistant reply text from OpenAI", async () => {
    setupFetchMocks({
      openAiResponse: {
        ...OPENAI_SUCCESS_RESPONSE,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Here are your products." },
            finish_reason: "stop",
          },
        ],
      },
    });
    const req = makeRequest({ message: "List all products" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.reply).toBe("Here are your products.");
  });

  it("trims whitespace from the assistant reply", async () => {
    setupFetchMocks({
      openAiResponse: {
        ...OPENAI_SUCCESS_RESPONSE,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "  Trimmed reply.  " },
            finish_reason: "stop",
          },
        ],
      },
    });
    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.reply).toBe("Trimmed reply.");
  });

  it("uses the configured model from the stored config", async () => {
    mockReadAIConfig.mockResolvedValue({ apiKey: "sk-key", model: "gpt-4-turbo" });
    setupFetchMocks();
    const req = makeRequest({ message: "List products" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    expect(openAiBody?.model).toBe("gpt-4-turbo");
  });

  it("sends the user message in the messages array", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "What products do you have?" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const userMessage = messages?.find((m) => m.role === "user");
    expect(userMessage?.content).toBe("What products do you have?");
  });

  it("includes a system message as the first element in the messages array", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "Hello" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string }>;
    expect(messages?.[0]?.role).toBe("system");
  });
});

// ===========================================================================
// 4. Conversation history forwarded to OpenAI
// ===========================================================================

describe("conversation history", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("includes prior history entries in the messages sent to OpenAI", async () => {
    setupFetchMocks();
    const history = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const req = makeRequest({ message: "What products do you carry?", history });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{
      role: string;
      content: string;
    }>;

    // History entries should appear between the system prompt and the current user message
    const userHistory = messages?.filter(
      (m) => m.role === "user" && m.content === "Hello",
    );
    const assistantHistory = messages?.filter(
      (m) => m.role === "assistant" && m.content === "Hi there!",
    );
    expect(userHistory).toHaveLength(1);
    expect(assistantHistory).toHaveLength(1);
  });

  it("places history entries after the system prompt and before the current message", async () => {
    setupFetchMocks();
    const history = [
      { role: "user", content: "First message" },
      { role: "assistant", content: "First reply" },
    ];
    const req = makeRequest({ message: "Second message", history });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{
      role: string;
      content: string;
    }>;

    // Verify order: system → history[0] → history[1] → current user
    expect(messages?.[0]?.role).toBe("system");
    expect(messages?.[1]?.content).toBe("First message");
    expect(messages?.[2]?.content).toBe("First reply");
    expect(messages?.[messages.length - 1]?.content).toBe("Second message");
  });

  it("works correctly when history is an empty array", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List products", history: [] });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string }>;
    // system + user only
    expect(messages?.filter((m) => m.role === "system")).toHaveLength(1);
    expect(messages?.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("works correctly when history is omitted", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List products" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string }>;
    expect(messages).toHaveLength(2); // system + user
  });
});

// ===========================================================================
// 5. Catalog data fetched for list_products intent
// ===========================================================================

describe("list_products intent", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("calls GET /products when user asks to list products", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "List all products" });
    await POST(req);

    const catalogCalls = getFetchCalls((url) => url.includes("/products") && !url.includes("openai"));
    expect(catalogCalls.length).toBeGreaterThan(0);
  });

  it("injects catalog data into the system prompt", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "Show me all products" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("Wireless Headphones");
  });

  it("includes product price in the system prompt", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "What products are available?" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("49.99");
  });

  it("includes stock information in the system prompt", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "What do you have in stock?" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toMatch(/10.*in stock|in stock.*10/);
  });

  it("handles an empty catalog gracefully", async () => {
    setupFetchMocks({ productList: [] });
    const req = makeRequest({ message: "List all products" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toMatch(/empty|no product/i);
  });

  it("fetches catalog fresh on each request (no caching)", async () => {
    setupFetchMocks();
    const req1 = makeRequest({ message: "List products" });
    const req2 = makeRequest({ message: "Show all products" });
    await POST(req1);
    await POST(req2);

    const catalogCalls = getFetchCalls(
      (url) => url.includes("/products") && !url.includes("openai"),
    );
    // Two separate requests → two separate catalog fetches
    expect(catalogCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// 6. search_products intent
// ===========================================================================

describe("search_products intent", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("calls GET /products when user searches for products by category", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "Find Electronics products" });
    await POST(req);

    const catalogCalls = getFetchCalls(
      (url) => url.includes("/products") && !url.includes("openai"),
    );
    expect(catalogCalls.length).toBeGreaterThan(0);
  });

  it("calls GET /products when user searches by name", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "Search for headphones" });
    await POST(req);

    const catalogCalls = getFetchCalls(
      (url) => url.includes("/products") && !url.includes("openai"),
    );
    expect(catalogCalls.length).toBeGreaterThan(0);
  });

  it("injects the full catalog into the system prompt for search intents", async () => {
    setupFetchMocks({ productList: [PRODUCT_1, PRODUCT_2] });
    const req = makeRequest({ message: "Find me a keyboard" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    // Both products should be available for the model to filter
    expect(systemContent).toContain("Wireless Headphones");
    expect(systemContent).toContain("Mechanical Keyboard");
  });
});

// ===========================================================================
// 7. product_detail intent — single product fetch
// ===========================================================================

describe("product_detail intent", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("calls GET /products/:id when user asks for product details by ID", async () => {
    setupFetchMocks({ singleProduct: PRODUCT_1 });
    const req = makeRequest({ message: "Show me details for product 1" });
    await POST(req);

    const singleCalls = getFetchCalls(
      (url) =>
        url.includes("/products/") &&
        !url.includes("openai") &&
        /\/products\/\d+/.test(url),
    );
    expect(singleCalls.length).toBeGreaterThan(0);
  });

  it("does NOT call GET /products (list) for a product_detail intent", async () => {
    setupFetchMocks({ singleProduct: PRODUCT_1 });
    const req = makeRequest({ message: "Tell me about product 1" });
    await POST(req);

    const listCalls = getFetchCalls(
      (url) =>
        !url.includes("openai") &&
        new URL(url).pathname === "/products",
    );
    expect(listCalls).toHaveLength(0);
  });

  it("injects single product details into the system prompt", async () => {
    setupFetchMocks({ singleProduct: PRODUCT_1 });
    const req = makeRequest({ message: "What is product 1?" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("Wireless Headphones");
    expect(systemContent).toContain("49.99");
  });

  it("notes in the prompt when a product ID is not found", async () => {
    setupFetchMocks({ singleProduct: null });
    const req = makeRequest({ message: "Show details for product 999" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toMatch(/999.*not found|not found.*999/i);
  });
});

// ===========================================================================
// 8. checkout_initiate intent
// ===========================================================================

describe("checkout_initiate intent", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("fetches catalog data when user wants to buy a product", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "I want to buy product 1" });
    await POST(req);

    const catalogCalls = getFetchCalls(
      (url) => url.includes("/products") && !url.includes("openai"),
    );
    expect(catalogCalls.length).toBeGreaterThan(0);
  });

  it("injects a /checkout deep link into the system prompt", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "I want to buy product 1" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("/checkout?productId=1&quantity=1");
  });

  it("deep link contains the correct product ID", async () => {
    setupFetchMocks({ productList: [PRODUCT_2] });
    const req = makeRequest({ message: "I want to purchase product 2" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("/checkout?productId=2&quantity=1");
  });

  it("includes quantity=1 in the checkout deep link", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "Buy product 1" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("quantity=1");
  });

  it("still returns HTTP 200 even when no product match is found in catalog", async () => {
    setupFetchMocks({ productList: [] });
    const req = makeRequest({ message: "Buy product 99" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 9. checkout_explain intent
// ===========================================================================

describe("checkout_explain intent", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("does NOT call the catalog API when explaining the checkout process", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify(OPENAI_SUCCESS_RESPONSE),
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.reject(
        new Error(`Unexpected catalog call: ${req.method} ${req.url}`),
      );
    });

    const req = makeRequest({ message: "How does checkout work?" });
    const res = await POST(req);
    // No catalog call should be made → no rejection, still 200
    expect(res.status).toBe(200);
  });

  it("injects checkout process steps into the system prompt", async () => {
    setupFetchMocks();
    const req = makeRequest({ message: "Explain how to checkout" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toMatch(/checkout|pay|purchase/i);
    expect(systemContent).toContain("/checkout");
  });
});

// ===========================================================================
// 10. OpenAI authentication error → 401
// ===========================================================================

describe("OpenAI authentication error", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns HTTP 401 when OpenAI responds with 401", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({
            error: { message: "Incorrect API key provided.", type: "invalid_request_error" },
          }),
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "List products" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns the OpenAI error message in the response body on 401", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({
            error: { message: "Incorrect API key provided.", type: "invalid_request_error" },
          }),
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "List products" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 11. OpenAI rate-limit error → 429
// ===========================================================================

describe("OpenAI rate-limit error", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns HTTP 429 when OpenAI responds with 429", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({
            error: { message: "You exceeded your current quota.", type: "insufficient_quota" },
          }),
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns a structured error body on rate-limit error", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({
            error: { message: "You exceeded your current quota.", type: "insufficient_quota" },
          }),
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 12. OpenAI generic API error
// ===========================================================================

describe("OpenAI generic API error", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns a non-200 status when OpenAI returns a 500", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({ error: { message: "Internal server error" } }),
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    expect(res.status).not.toBe(200);
  });

  it("returns a structured error body for a generic OpenAI error", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({ error: { message: "Internal server error" } }),
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 13. OpenAI network error → 502
// ===========================================================================

describe("OpenAI network error", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("returns HTTP 502 when fetch to OpenAI throws a network error", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.reject(new Error("Connection refused"));
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns a structured error body on network failure", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.reject(new Error("Connection refused"));
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = makeRequest({ message: "Hello" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 14. Catalog service unavailable — continues without grounding
// ===========================================================================

describe("catalog service unavailable", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("still returns HTTP 200 when the catalog service is down", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify(OPENAI_SUCCESS_RESPONSE),
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Catalog service is down
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const req = makeRequest({ message: "List all products" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("still returns { reply } when catalog is unavailable", async () => {
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify(OPENAI_SUCCESS_RESPONSE),
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.reject(new Error("ECONNREFUSED"));
    });

    const req = makeRequest({ message: "List all products" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.reply).toBe("string");
  });
});

// ===========================================================================
// 15. System prompt content
// ===========================================================================

describe("system prompt content", () => {
  beforeEach(() => {
    mockReadAIConfig.mockResolvedValue(VALID_CONFIG);
  });

  it("includes an instruction not to fabricate product data", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "Show all products" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    // The prompt must instruct the model to use only provided data
    expect(systemContent).toMatch(/only|never|real data|fabricat/i);
  });

  it("includes product IDs so the model can reference them", async () => {
    setupFetchMocks({ productList: [PRODUCT_1, PRODUCT_2] });
    const req = makeRequest({ message: "List products" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("ID 1");
    expect(systemContent).toContain("ID 2");
  });

  it("includes the checkout deep-link format description", async () => {
    setupFetchMocks({ productList: [PRODUCT_1] });
    const req = makeRequest({ message: "I want to buy product 1" });
    await POST(req);

    const openAiBody = getLastOpenAiRequestBody();
    const messages = openAiBody?.messages as Array<{ role: string; content: string }>;
    const systemContent = messages?.find((m) => m.role === "system")?.content ?? "";
    expect(systemContent).toContain("/checkout?productId=");
  });
});

// ===========================================================================
// 16. Security — API key never reflected in response
// ===========================================================================

describe("API key security", () => {
  it("does not include the API key in any response body on success", async () => {
    mockReadAIConfig.mockResolvedValue({
      apiKey: "sk-super-secret-key",
      model: "gpt-4o",
    });
    setupFetchMocks();
    const req = makeRequest({ message: "List products" });
    const res = await POST(req);
    const text = await res.clone().text();
    expect(text).not.toContain("sk-super-secret-key");
  });

  it("does not include the API key in any response body on error", async () => {
    mockReadAIConfig.mockResolvedValue({
      apiKey: "sk-super-secret-key",
      model: "gpt-4o",
    });
    fetchMock.mockResponse((req) => {
      if (req.url.includes("api.openai.com")) {
        return Promise.resolve({
          body: JSON.stringify({
            error: { message: "Error occurred", type: "server_error" },
          }),
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.resolve({
        body: JSON.stringify([PRODUCT_1]),
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    const text = await res.clone().text();
    expect(text).not.toContain("sk-super-secret-key");
  });

  it("does not include the API key in the no_config response", async () => {
    mockReadAIConfig.mockResolvedValue(null);
    const req = makeRequest({ message: "Hello" });
    const res = await POST(req);
    const text = await res.clone().text();
    expect(text).not.toContain("sk-");
  });
});
