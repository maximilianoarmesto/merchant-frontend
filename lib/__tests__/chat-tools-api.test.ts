/**
 * Unit tests for the 5 commerce AI tool implementations, exercising the *real*
 * `lib/api.ts` HTTP code path by mocking `fetch` (the actual network call).
 *
 * Unlike `chat-tools.test.ts` (which injects fake deps), these tests run the
 * default `commerceTools` through `catalogApi`/`checkoutApi` → `request()` →
 * `fetch`, so they cover the integration between the tools and the HTTP layer:
 * status handling, error-body parsing, and JSON decoding.
 *
 * Covers AC1–AC8:
 *  - happy path + error path for each of the 5 tools
 *  - 404 product-not-found, 409 stock conflict, network timeout, malformed JSON
 *  - every tool returns a *string* error (never throws) when the backend fails
 *  - JSON Schema parameter definitions validated against sample inputs with ajv
 */
import Ajv from "ajv";
import { commerceTools } from "../chat-tools";
import type { ToolDefinition } from "../chat-adapter";
import type { CheckoutSession, Order, Product } from "../api";

const CATALOG = "http://localhost:8001";
const CHECKOUT = "http://localhost:8002";

// --- fixtures -------------------------------------------------------------

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Widget",
    description: "A widget",
    price: 9.99,
    currency: "USD",
    stock: 10,
    category: "things",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    id: "sess_abc",
    product_id: 1,
    product_name: "Widget",
    quantity: 1,
    unit_price: 9.99,
    total_amount: 9.99,
    currency: "USD",
    status: "created",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    checkout_session_id: "sess_abc",
    product_id: 1,
    product_name: "Widget",
    quantity: 1,
    total_amount: 9.99,
    currency: "USD",
    payment_status: "paid",
    order_status: "completed",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- fetch mocking helpers ------------------------------------------------

type ResponseInitLite = {
  status?: number;
  statusText?: string;
};

/** Build a minimal `Response`-like object that satisfies `lib/api.ts`. */
function jsonResponse(body: unknown, init: ResponseInitLite = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "OK",
    json: async () => body,
  } as unknown as Response;
}

/** A 2xx response whose body is *not* valid JSON (malformed payload). */
function malformedJsonResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  } as unknown as Response;
}

function mockFetch(): jest.Mock {
  const fn = jest.fn();
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function byName(name: string): ToolDefinition {
  const t = commerceTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- happy paths (AC1, AC2, AC4, AC6) -------------------------------------

describe("commerce tools — happy paths (real api.ts via mocked fetch)", () => {
  it("list_products returns a structured product list and hits GET /products (AC2)", async () => {
    const fetchMock = mockFetch();
    const products = [makeProduct(), makeProduct({ id: 2, name: "Gadget" })];
    fetchMock.mockResolvedValue(jsonResponse(products));

    const out = await byName("list_products").execute({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${CATALOG}/products`);
    expect(typeof out).toBe("string");
    const parsed = JSON.parse(out as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(products);
  });

  it("get_product returns the structured product for a known id", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse(makeProduct({ id: 42 })));

    const out = await byName("get_product").execute({ id: 42 });

    expect(fetchMock.mock.calls[0][0]).toBe(`${CATALOG}/products/42`);
    expect(JSON.parse(out as string).id).toBe(42);
  });

  it("create_checkout_session returns a structured session and POSTs the body (AC4)", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(makeSession({ product_id: 7, quantity: 3, total_amount: 29.97 }))
    );

    const out = await byName("create_checkout_session").execute({
      product_id: 7,
      quantity: 3,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${CHECKOUT}/checkout/session`);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ product_id: 7, quantity: 3 });

    const parsed = JSON.parse(out as string);
    expect(parsed.id).toBe("sess_abc");
    expect(parsed.status).toBe("created");
    expect(parsed.total_amount).toBe(29.97);
  });

  it("process_payment returns an order confirmation and POSTs to .../pay (AC6)", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(makeOrder({ checkout_session_id: "sess_xyz" }))
    );

    const out = await byName("process_payment").execute({ session_id: "sess_xyz" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${CHECKOUT}/checkout/session/sess_xyz/pay`
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    const parsed = JSON.parse(out as string);
    expect(parsed.payment_status).toBe("paid");
    expect(parsed.order_status).toBe("completed");
    expect(parsed.checkout_session_id).toBe("sess_xyz");
  });

  it("list_orders returns a structured order list and hits GET /orders", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse([makeOrder()]));

    const out = await byName("list_orders").execute({});

    expect(fetchMock.mock.calls[0][0]).toBe(`${CHECKOUT}/orders`);
    expect(JSON.parse(out as string)).toEqual([makeOrder()]);
  });
});

// --- error paths (AC3, AC5, AC7) ------------------------------------------

describe("commerce tools — error paths return structured strings, never throw", () => {
  it("get_product returns a 404 not-found message when the product is missing (AC3)", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Product not found" }, { status: 404, statusText: "Not Found" })
    );

    const out = await byName("get_product").execute({ id: 999 });

    expect(typeof out).toBe("string");
    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toContain("404");
    expect(out as string).toMatch(/not found/i);
  });

  it("create_checkout_session returns a stock error message on 409 conflict (AC5)", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { detail: "Insufficient stock: only 2 left" },
        { status: 409, statusText: "Conflict" }
      )
    );

    const out = await byName("create_checkout_session").execute({
      product_id: 1,
      quantity: 9999,
    });

    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toContain("409");
    expect(out as string).toMatch(/stock/i);
  });

  it("create_checkout_session falls back to statusText when the error body has no detail", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse({}, { status: 409, statusText: "Conflict" })
    );

    const out = await byName("create_checkout_session").execute({
      product_id: 1,
      quantity: 9999,
    });

    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toContain("409");
    expect(out as string).toContain("Conflict");
  });

  it("process_payment surfaces a 404 for an unknown session", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Session not found" }, { status: 404, statusText: "Not Found" })
    );

    const out = await byName("process_payment").execute({ session_id: "nope" });

    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toContain("404");
  });

  describe("network timeout — fetch rejects (AC7)", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["list_products", {}],
      ["get_product", { id: 1 }],
      ["create_checkout_session", { product_id: 1, quantity: 1 }],
      ["process_payment", { session_id: "sess_abc" }],
      ["list_orders", {}],
    ];

    it.each(cases)(
      "%s returns a structured error string when the backend is unreachable",
      async (toolName, args) => {
        const fetchMock = mockFetch();
        fetchMock.mockRejectedValue(new Error("network timeout: connect ETIMEDOUT"));

        const out = await byName(toolName).execute(args);

        expect(typeof out).toBe("string");
        expect(out as string).toMatch(/^Error:/);
        expect(out as string).toMatch(/timeout/i);
      }
    );
  });

  describe("malformed API response — body is not valid JSON", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["list_products", {}],
      ["get_product", { id: 1 }],
      ["create_checkout_session", { product_id: 1, quantity: 1 }],
      ["process_payment", { session_id: "sess_abc" }],
      ["list_orders", {}],
    ];

    it.each(cases)(
      "%s returns a structured error string instead of throwing",
      async (toolName, args) => {
        const fetchMock = mockFetch();
        fetchMock.mockResolvedValue(malformedJsonResponse());

        const out = await byName(toolName).execute(args);

        expect(typeof out).toBe("string");
        expect(out as string).toMatch(/^Error:/);
      }
    );
  });

  it("get_product returns a structured error for a missing required arg (no fetch call)", async () => {
    const fetchMock = mockFetch();
    const out = await byName("get_product").execute({});
    expect(out as string).toMatch(/^Error:.*id/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- JSON Schema validation with ajv (AC8) --------------------------------

describe("tool JSON Schema definitions validate sample inputs (ajv) — AC8", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });

  function validatorFor(name: string) {
    return ajv.compile(byName(name).parameters as object);
  }

  it("every tool's parameters object is a valid, compilable JSON Schema", () => {
    for (const tool of commerceTools) {
      expect(() => ajv.compile(tool.parameters as object)).not.toThrow();
    }
  });

  it("list_products / list_orders accept an empty object and reject extra props", () => {
    for (const name of ["list_products", "list_orders"]) {
      const validate = validatorFor(name);
      expect(validate({})).toBe(true);
      expect(validate({ unexpected: 1 })).toBe(false);
    }
  });

  it("get_product accepts a numeric id and rejects missing / wrong-typed id", () => {
    const validate = validatorFor("get_product");
    expect(validate({ id: 42 })).toBe(true);
    expect(validate({})).toBe(false); // id is required
    expect(validate({ id: "42" })).toBe(false); // wrong type
    expect(validate({ id: 42, extra: true })).toBe(false); // additionalProperties: false
  });

  it("create_checkout_session requires numeric product_id and quantity", () => {
    const validate = validatorFor("create_checkout_session");
    expect(validate({ product_id: 7, quantity: 3 })).toBe(true);
    expect(validate({ product_id: 7 })).toBe(false); // quantity missing
    expect(validate({ quantity: 3 })).toBe(false); // product_id missing
    expect(validate({ product_id: "7", quantity: 3 })).toBe(false); // wrong type
  });

  it("process_payment requires a string session_id", () => {
    const validate = validatorFor("process_payment");
    expect(validate({ session_id: "sess_abc" })).toBe(true);
    expect(validate({})).toBe(false); // required
    expect(validate({ session_id: 123 })).toBe(false); // wrong type
  });
});
