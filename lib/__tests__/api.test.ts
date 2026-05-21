/**
 * Unit tests for catalogApi.createProduct and catalogApi.listProducts in lib/api.ts.
 *
 * Strategy
 * --------
 * jest-fetch-mock replaces global.fetch before any module is loaded
 * (configured in jest.config.ts `setupFiles`).  Every test programs
 * `fetchMock` directly and inspects the arguments that were passed to the
 * mocked fetch to verify method, URL, headers, and request body.
 *
 * CATALOG_API_URL defaults to "http://localhost:8001" when the env var is
 * absent, so the expected targets are:
 *   GET  http://localhost:8001/products       → listProducts()
 *   POST http://localhost:8001/products       → createProduct()
 *
 * Error-handling contract (from the `request` helper):
 *   - Non-ok HTTP response  → throws Error("<status> <detail>")
 *   - Network failure       → the underlying fetch rejection propagates
 */

import fetchMock from "jest-fetch-mock";
import {
  catalogApi,
  type ListProductsParams,
  type Product,
  type ProductCreatePayload,
} from "../api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATALOG_BASE = "http://localhost:8001";
const PRODUCTS_URL = `${CATALOG_BASE}/products`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REQUIRED_PAYLOAD: ProductCreatePayload = {
  name: "Wireless Headphones",
  price: 49.99,
  stock: 10,
  category: "Electronics",
};

const FULL_PAYLOAD: ProductCreatePayload = {
  name: "Wireless Headphones",
  price: 49.99,
  stock: 10,
  category: "Electronics",
  description: "Great sound quality",
  image_url: "https://example.com/headphones.jpg",
  currency: "EUR",
};

const CREATED_PRODUCT: Product = {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a JSON fetch response with the given status. */
function jsonResponse(body: unknown, status = 201) {
  return {
    body: JSON.stringify(body),
    status,
    headers: { "Content-Type": "application/json" },
  };
}

/**
 * Extract the single fetch call recorded by fetchMock.
 * Asserts exactly one call was made so tests fail clearly if zero or many
 * calls occurred.
 */
function getSingleFetchCall(): [string, RequestInit] {
  expect(fetchMock.mock.calls).toHaveLength(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return [url, init ?? {}];
}

// ---------------------------------------------------------------------------
// Global mock hygiene
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.enableMocks();
});

// ===========================================================================
// 1. HTTP method
// ===========================================================================
describe("HTTP method", () => {
  it("sends a POST request", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [, init] = getSingleFetchCall();
    expect((init.method ?? "").toUpperCase()).toBe("POST");
  });
});

// ===========================================================================
// 2. URL
// ===========================================================================
describe("request URL", () => {
  it("posts to the catalog service /products endpoint", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [url] = getSingleFetchCall();
    expect(url).toBe(PRODUCTS_URL);
  });

  it("does not append extra path segments or query parameters", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/products");
    expect(parsed.search).toBe("");
  });
});

// ===========================================================================
// 3. Content-Type header
// ===========================================================================
describe("Content-Type header", () => {
  it("sets Content-Type: application/json", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [, init] = getSingleFetchCall();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("also sends the Accept: application/json header", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [, init] = getSingleFetchCall();
    const headers = init.headers as Record<string, string>;
    expect(headers["Accept"]).toBe("application/json");
  });
});

// ===========================================================================
// 4. Request body — required fields
// ===========================================================================
describe("request body — required fields", () => {
  it("serialises all required fields into the JSON body", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [, init] = getSingleFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      name: REQUIRED_PAYLOAD.name,
      price: REQUIRED_PAYLOAD.price,
      stock: REQUIRED_PAYLOAD.stock,
      category: REQUIRED_PAYLOAD.category,
    });
  });

  it("sends a valid JSON string as the body", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(REQUIRED_PAYLOAD);

    const [, init] = getSingleFetchCall();
    expect(() => JSON.parse(init.body as string)).not.toThrow();
  });
});

// ===========================================================================
// 5. Request body — optional fields
// ===========================================================================
describe("request body — optional fields", () => {
  it("includes description when provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct({ ...REQUIRED_PAYLOAD, description: "Great sound quality" });

    const [, init] = getSingleFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.description).toBe("Great sound quality");
  });

  it("includes image_url when provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct({
      ...REQUIRED_PAYLOAD,
      image_url: "https://example.com/headphones.jpg",
    });

    const [, init] = getSingleFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.image_url).toBe("https://example.com/headphones.jpg");
  });

  it("includes currency when provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct({ ...REQUIRED_PAYLOAD, currency: "EUR" });

    const [, init] = getSingleFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body.currency).toBe("EUR");
  });

  it("serialises the full payload (all optional fields) correctly", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    await catalogApi.createProduct(FULL_PAYLOAD);

    const [, init] = getSingleFetchCall();
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      name: FULL_PAYLOAD.name,
      price: FULL_PAYLOAD.price,
      stock: FULL_PAYLOAD.stock,
      category: FULL_PAYLOAD.category,
      description: FULL_PAYLOAD.description,
      image_url: FULL_PAYLOAD.image_url,
      currency: FULL_PAYLOAD.currency,
    });
  });
});

// ===========================================================================
// 6. Successful responses — resolves with parsed product
// ===========================================================================
describe("successful response", () => {
  it("resolves with the parsed product object on HTTP 201", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    const result = await catalogApi.createProduct(REQUIRED_PAYLOAD);

    expect(result).toEqual(CREATED_PRODUCT);
  });

  it("resolves with the parsed product object on HTTP 200", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 200 });

    const result = await catalogApi.createProduct(REQUIRED_PAYLOAD);

    expect(result).toEqual(CREATED_PRODUCT);
  });

  it("returns a plain object with the expected Product shape", async () => {
    fetchMock.mockResponseOnce(JSON.stringify(CREATED_PRODUCT), { status: 201 });

    const result = await catalogApi.createProduct(REQUIRED_PAYLOAD);

    expect(result).toHaveProperty("id", CREATED_PRODUCT.id);
    expect(result).toHaveProperty("name", CREATED_PRODUCT.name);
    expect(result).toHaveProperty("price", CREATED_PRODUCT.price);
    expect(result).toHaveProperty("currency", CREATED_PRODUCT.currency);
    expect(result).toHaveProperty("stock", CREATED_PRODUCT.stock);
    expect(result).toHaveProperty("category", CREATED_PRODUCT.category);
    expect(result).toHaveProperty("is_active", CREATED_PRODUCT.is_active);
    expect(result).toHaveProperty("created_at", CREATED_PRODUCT.created_at);
    expect(result).toHaveProperty("updated_at", CREATED_PRODUCT.updated_at);
  });
});

// ===========================================================================
// 7. HTTP 400 — invalid payload
// ===========================================================================
describe("HTTP 400 error (invalid payload)", () => {
  it("throws on a 400 response", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Name is required" }),
      { status: 400 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow();
  });

  it("includes the status code in the thrown error message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Name is required" }),
      { status: 400 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow("400");
  });

  it("includes the API error detail in the thrown error message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Name is required" }),
      { status: 400 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow(
      "Name is required",
    );
  });

  it("does not resolve when the server returns 400", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Validation failed" }),
      { status: 400 },
    );

    const result = catalogApi.createProduct(REQUIRED_PAYLOAD);

    await expect(result).rejects.toBeDefined();
  });
});

// ===========================================================================
// 8. HTTP 500 — server error
// ===========================================================================
describe("HTTP 500 error (server error)", () => {
  it("throws on a 500 response", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Internal Server Error" }),
      { status: 500 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow();
  });

  it("includes the status code in the thrown error message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Internal Server Error" }),
      { status: 500 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow("500");
  });

  it("includes the API error detail in the thrown error message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Internal Server Error" }),
      { status: 500 },
    );

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow(
      "Internal Server Error",
    );
  });

  it("falls back to statusText when the 500 body has no detail field", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({}),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );

    // The error must still be thrown (statusText may be empty in jsdom, so
    // we only assert the promise rejects rather than inspect the message text)
    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow();
  });

  it("does not resolve when the server returns 500", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Something went wrong" }),
      { status: 500 },
    );

    const result = catalogApi.createProduct(REQUIRED_PAYLOAD);

    await expect(result).rejects.toBeDefined();
  });
});

// ===========================================================================
// 9. Network failure — fetch itself throws
// ===========================================================================
describe("network failure", () => {
  it("rejects when fetch throws (network error)", async () => {
    fetchMock.mockRejectOnce(new Error("Network request failed"));

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow(
      "Network request failed",
    );
  });

  it("propagates the original network error", async () => {
    const networkError = new TypeError("Failed to fetch");
    fetchMock.mockRejectOnce(networkError);

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("rejects with an Error instance on network failure", async () => {
    fetchMock.mockRejectOnce(new Error("Connection refused"));

    await expect(catalogApi.createProduct(REQUIRED_PAYLOAD)).rejects.toBeInstanceOf(
      Error,
    );
  });

  it("does not swallow network errors", async () => {
    fetchMock.mockRejectOnce(new Error("DNS lookup failed"));

    // Confirm the promise rejects rather than resolves to undefined / null
    let resolved = false;
    await catalogApi.createProduct(REQUIRED_PAYLOAD).then(
      () => { resolved = true; },
      () => { /* expected rejection */ },
    );
    expect(resolved).toBe(false);
  });
});

// ===========================================================================
// catalogApi.listProducts — price filter query parameters
// ===========================================================================

// ---------------------------------------------------------------------------
// Fixtures for listProducts tests
// ---------------------------------------------------------------------------

const PRODUCT_CHEAP: Product = {
  id: 10,
  name: "Budget Widget",
  description: "Affordable",
  price: 5.0,
  currency: "USD",
  stock: 100,
  category: "Widgets",
  is_active: true,
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

const PRODUCT_MID: Product = {
  id: 11,
  name: "Standard Widget",
  description: "Mid-range",
  price: 30.0,
  currency: "USD",
  stock: 50,
  category: "Widgets",
  is_active: true,
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

const PRODUCT_EXPENSIVE: Product = {
  id: 12,
  name: "Premium Widget",
  description: "Top tier",
  price: 100.0,
  currency: "USD",
  stock: 10,
  category: "Widgets",
  is_active: true,
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
};

// ===========================================================================
// 10. listProducts — no params (no regression)
// ===========================================================================
describe("listProducts — no params", () => {
  it("calls GET /products without a query string when no params are given", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify([PRODUCT_CHEAP, PRODUCT_MID, PRODUCT_EXPENSIVE]),
      { status: 200 },
    );

    await catalogApi.listProducts();

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/products");
    expect(parsed.search).toBe("");
  });

  it("calls GET /products without a query string when an empty params object is given", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify([PRODUCT_CHEAP, PRODUCT_MID, PRODUCT_EXPENSIVE]),
      { status: 200 },
    );

    await catalogApi.listProducts({});

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.search).toBe("");
  });

  it("resolves with the full product list when no params are given", async () => {
    const allProducts = [PRODUCT_CHEAP, PRODUCT_MID, PRODUCT_EXPENSIVE];
    fetchMock.mockResponseOnce(JSON.stringify(allProducts), { status: 200 });

    const result = await catalogApi.listProducts();

    expect(result).toEqual(allProducts);
  });

  it("resolves with an empty array when the server returns an empty list", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]), { status: 200 });

    const result = await catalogApi.listProducts();

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// 11. listProducts — min_price only
// ===========================================================================
describe("listProducts — min_price only", () => {
  it("appends min_price as a query parameter", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify([PRODUCT_MID, PRODUCT_EXPENSIVE]),
      { status: 200 },
    );

    await catalogApi.listProducts({ min_price: 10 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("min_price")).toBe("10");
  });

  it("does not append max_price when only min_price is provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ min_price: 10 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.has("max_price")).toBe(false);
  });

  it("resolves with the filtered product list for min_price", async () => {
    const filtered = [PRODUCT_MID, PRODUCT_EXPENSIVE];
    fetchMock.mockResponseOnce(JSON.stringify(filtered), { status: 200 });

    const result = await catalogApi.listProducts({ min_price: 10 });

    expect(result).toEqual(filtered);
  });

  it("resolves with an empty array when no products satisfy min_price", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]), { status: 200 });

    const result = await catalogApi.listProducts({ min_price: 9999 });

    expect(result).toEqual([]);
  });

  it("encodes a decimal min_price correctly", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ min_price: 10.5 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("min_price")).toBe("10.5");
  });

  it("accepts min_price of 0", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify([PRODUCT_CHEAP, PRODUCT_MID, PRODUCT_EXPENSIVE]),
      { status: 200 },
    );

    await catalogApi.listProducts({ min_price: 0 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("min_price")).toBe("0");
  });
});

// ===========================================================================
// 12. listProducts — max_price only
// ===========================================================================
describe("listProducts — max_price only", () => {
  it("appends max_price as a query parameter", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify([PRODUCT_CHEAP, PRODUCT_MID]),
      { status: 200 },
    );

    await catalogApi.listProducts({ max_price: 50 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("max_price")).toBe("50");
  });

  it("does not append min_price when only max_price is provided", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_CHEAP]), { status: 200 });

    await catalogApi.listProducts({ max_price: 50 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.has("min_price")).toBe(false);
  });

  it("resolves with the filtered product list for max_price", async () => {
    const filtered = [PRODUCT_CHEAP, PRODUCT_MID];
    fetchMock.mockResponseOnce(JSON.stringify(filtered), { status: 200 });

    const result = await catalogApi.listProducts({ max_price: 50 });

    expect(result).toEqual(filtered);
  });

  it("resolves with an empty array when no products satisfy max_price", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]), { status: 200 });

    const result = await catalogApi.listProducts({ max_price: 0.01 });

    expect(result).toEqual([]);
  });

  it("encodes a decimal max_price correctly", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_CHEAP]), { status: 200 });

    await catalogApi.listProducts({ max_price: 49.99 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("max_price")).toBe("49.99");
  });
});

// ===========================================================================
// 13. listProducts — min_price and max_price together (price range)
// ===========================================================================
describe("listProducts — min_price and max_price together", () => {
  it("appends both min_price and max_price as query parameters", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ min_price: 10, max_price: 50 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("min_price")).toBe("10");
    expect(parsed.searchParams.get("max_price")).toBe("50");
  });

  it("resolves with only products within the price range", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    const result = await catalogApi.listProducts({ min_price: 10, max_price: 50 });

    expect(result).toEqual([PRODUCT_MID]);
  });

  it("resolves with an empty array when no products fall within the range", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]), { status: 200 });

    const result = await catalogApi.listProducts({ min_price: 200, max_price: 300 });

    expect(result).toEqual([]);
  });

  it("accepts equal min_price and max_price (exact match)", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ min_price: 30, max_price: 30 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("min_price")).toBe("30");
    expect(parsed.searchParams.get("max_price")).toBe("30");
  });
});

// ===========================================================================
// 14. listProducts — name + min_price + max_price combined
// ===========================================================================
describe("listProducts — name combined with price params", () => {
  it("appends name, min_price, and max_price together", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ name: "shoe", min_price: 10, max_price: 50 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("name")).toBe("shoe");
    expect(parsed.searchParams.get("min_price")).toBe("10");
    expect(parsed.searchParams.get("max_price")).toBe("50");
  });

  it("appends name and min_price (without max_price)", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_MID]), { status: 200 });

    await catalogApi.listProducts({ name: "widget", min_price: 20 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("name")).toBe("widget");
    expect(parsed.searchParams.get("min_price")).toBe("20");
    expect(parsed.searchParams.has("max_price")).toBe(false);
  });

  it("appends name and max_price (without min_price)", async () => {
    fetchMock.mockResponseOnce(JSON.stringify([PRODUCT_CHEAP]), { status: 200 });

    await catalogApi.listProducts({ name: "widget", max_price: 15 });

    const [url] = getSingleFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("name")).toBe("widget");
    expect(parsed.searchParams.get("max_price")).toBe("15");
    expect(parsed.searchParams.has("min_price")).toBe(false);
  });

  it("resolves with the filtered list when all three params are combined", async () => {
    const filtered = [PRODUCT_MID];
    fetchMock.mockResponseOnce(JSON.stringify(filtered), { status: 200 });

    const result = await catalogApi.listProducts({
      name: "shoe",
      min_price: 10,
      max_price: 50,
    });

    expect(result).toEqual(filtered);
  });
});

// ===========================================================================
// 15. listProducts — invalid price params return 422-style error (no fetch)
// ===========================================================================
describe("listProducts — invalid price params (HTTP 422)", () => {
  it("throws without making a fetch call when min_price is negative", async () => {
    await expect(
      catalogApi.listProducts({ min_price: -1 }),
    ).rejects.toThrow();

    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("includes '422' in the error message for negative min_price", async () => {
    await expect(
      catalogApi.listProducts({ min_price: -1 }),
    ).rejects.toThrow("422");
  });

  it("includes a descriptive message for negative min_price", async () => {
    await expect(
      catalogApi.listProducts({ min_price: -1 }),
    ).rejects.toThrow(/min_price/i);
  });

  it("throws without making a fetch call when max_price is negative", async () => {
    await expect(
      catalogApi.listProducts({ max_price: -0.01 }),
    ).rejects.toThrow();

    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("includes '422' in the error message for negative max_price", async () => {
    await expect(
      catalogApi.listProducts({ max_price: -5 }),
    ).rejects.toThrow("422");
  });

  it("includes a descriptive message for negative max_price", async () => {
    await expect(
      catalogApi.listProducts({ max_price: -5 }),
    ).rejects.toThrow(/max_price/i);
  });

  it("throws when min_price is NaN", async () => {
    await expect(
      catalogApi.listProducts({ min_price: NaN }),
    ).rejects.toThrow("422");
  });

  it("throws when max_price is NaN", async () => {
    await expect(
      catalogApi.listProducts({ max_price: NaN }),
    ).rejects.toThrow("422");
  });

  it("throws when min_price is Infinity", async () => {
    await expect(
      catalogApi.listProducts({ min_price: Infinity }),
    ).rejects.toThrow("422");
  });

  it("throws when min_price is greater than max_price", async () => {
    await expect(
      catalogApi.listProducts({ min_price: 100, max_price: 50 }),
    ).rejects.toThrow("422");
  });

  it("includes a descriptive message when min_price > max_price", async () => {
    await expect(
      catalogApi.listProducts({ min_price: 100, max_price: 50 }),
    ).rejects.toThrow(/min_price.*max_price|max_price.*min_price/i);
  });

  it("does not make a fetch call when min_price > max_price", async () => {
    await expect(
      catalogApi.listProducts({ min_price: 100, max_price: 50 }),
    ).rejects.toThrow();

    expect(fetchMock.mock.calls).toHaveLength(0);
  });
});

// ===========================================================================
// 16. listProducts — HTTP and network error propagation
// ===========================================================================
describe("listProducts — HTTP error propagation", () => {
  it("throws on a 500 response from GET /products", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Internal Server Error" }),
      { status: 500 },
    );

    await expect(catalogApi.listProducts()).rejects.toThrow("500");
  });

  it("includes the API error detail in the thrown error message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ detail: "Database unavailable" }),
      { status: 503 },
    );

    await expect(catalogApi.listProducts()).rejects.toThrow("Database unavailable");
  });

  it("propagates network failures", async () => {
    fetchMock.mockRejectOnce(new Error("Network request failed"));

    await expect(catalogApi.listProducts({ min_price: 10 })).rejects.toThrow(
      "Network request failed",
    );
  });
});
