/**
 * Unit tests for catalogApi.createProduct in lib/api.ts.
 *
 * Strategy
 * --------
 * jest-fetch-mock replaces global.fetch before any module is loaded
 * (configured in jest.config.ts `setupFiles`).  Every test programs
 * `fetchMock` directly and inspects the arguments that were passed to the
 * mocked fetch to verify method, URL, headers, and request body.
 *
 * CATALOG_API_URL defaults to "http://localhost:8001" when the env var is
 * absent, so the expected POST target is:
 *   http://localhost:8001/products
 *
 * Error-handling contract (from the `request` helper):
 *   - Non-ok HTTP response  → throws Error("<status> <detail>")
 *   - Network failure       → the underlying fetch rejection propagates
 */

import fetchMock from "jest-fetch-mock";
import { catalogApi, type Product, type ProductCreatePayload } from "../api";

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
