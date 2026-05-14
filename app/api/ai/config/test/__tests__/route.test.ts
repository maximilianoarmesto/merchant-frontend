/**
 * Unit tests for app/api/ai/config/test/route.ts
 *
 * Strategy
 * --------
 * The `openai` npm package is mocked entirely via `jest.mock('openai')`.
 * This lets us simulate every SDK error class (AuthenticationError,
 * RateLimitError, APIConnectionError, APIConnectionTimeoutError) without
 * making real network calls, and without relying on jest-fetch-mock to
 * recreate the SDK's internal HTTP-to-error mapping.
 *
 * lib/ai-config is mocked so no file-system I/O occurs.
 *
 * The handler is imported directly and called with a synthetic Request so we
 * exercise the handler logic in isolation.
 *
 * Coverage
 * --------
 * 1.  No key available             → HTTP 400, { valid: false }
 * 2.  Valid key                    → HTTP 200, { valid: true }
 * 3.  OpenAI 401                   → HTTP 401, { valid: false, error: "Invalid API key" }
 * 4.  OpenAI 429 / quota           → HTTP 429, { valid: false, error: "Rate limit or quota exceeded" }
 * 5.  Network failure (throw)      → HTTP 502, { valid: false, error: "Could not reach OpenAI" }
 * 6.  SDK timeout                  → HTTP 502, { valid: false, error: "Could not reach OpenAI" }
 * 7.  API key never in any response body
 * 8.  Body key / stored key precedence
 * 9.  Whitespace trimming on body key
 * 10. Malformed / non-object body  → falls back to stored key
 *
 * Environment note
 * ----------------
 * jsdom does not implement the static `Response.json()` helper; the same
 * polyfill used in the other route tests is applied here.
 *
 * jest.mock() hoisting note
 * -------------------------
 * babel-jest hoists `jest.mock()` calls to the top of the compiled file,
 * before any variable declarations.  Variables referenced inside the factory
 * must therefore be prefixed with `mock` (case-insensitive) so that
 * babel-plugin-jest allows the forward reference.  We use `mockModelsListImpl`
 * as the shared state variable for this reason.
 */

// ---------------------------------------------------------------------------
// Polyfill Response.json for jsdom
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

// ---------------------------------------------------------------------------
// Shared per-test state for the openai mock.
//
// The variable name starts with "mock" so that babel-plugin-jest permits the
// forward reference inside the jest.mock() factory (which is hoisted ahead of
// all variable declarations by babel-jest).
// ---------------------------------------------------------------------------

/** Per-test implementation for `client.models.list()`. */
let mockModelsListImpl: () => Promise<unknown> = () =>
  Promise.resolve({ object: "list", data: [] });

// ---------------------------------------------------------------------------
// Mock the openai package.
//
// jest.mock() is hoisted to the very top of the compiled output so the
// factory runs before any module under test is evaluated.
// ---------------------------------------------------------------------------
jest.mock("openai", () => {
  // -----------------------------------------------------------------------
  // Recreate the SDK error hierarchy.
  //
  // The real SDK has:
  //   APIError ← AuthenticationError / RateLimitError
  //   APIError ← APIConnectionError ← APIConnectionTimeoutError
  //
  // We extend real Error so that `instanceof` checks in the route work
  // correctly even across the mock boundary.
  // -----------------------------------------------------------------------
  class APIError extends Error {
    status: number | undefined;
    error: unknown;
    constructor(message: string, status?: number, errorBody?: unknown) {
      super(message);
      this.name = "APIError";
      this.status = status;
      this.error = errorBody ?? null;
    }
  }

  class AuthenticationError extends APIError {
    constructor(message: string, errorBody?: unknown) {
      super(message, 401, errorBody);
      this.name = "AuthenticationError";
    }
  }

  class RateLimitError extends APIError {
    constructor(message: string, errorBody?: unknown) {
      super(message, 429, errorBody);
      this.name = "RateLimitError";
    }
  }

  class APIConnectionError extends APIError {
    constructor(message: string) {
      super(message, undefined, null);
      this.name = "APIConnectionError";
    }
  }

  class APIConnectionTimeoutError extends APIConnectionError {
    constructor(message = "Request timed out.") {
      super(message);
      this.name = "APIConnectionTimeoutError";
    }
  }

  // The default export is the OpenAI constructor.  `mockModelsListImpl` is
  // allowed here because babel-plugin-jest permits `mock`-prefixed variables.
  const OpenAIMock = jest.fn().mockImplementation(() => ({
    models: {
      list: jest.fn(() => mockModelsListImpl()),
    },
  }));

  return {
    __esModule: true,
    default: OpenAIMock,
    APIError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIConnectionTimeoutError,
  };
});

// ---------------------------------------------------------------------------
// Import the module under test and its dependencies.
// These must appear AFTER jest.mock() declarations.
// ---------------------------------------------------------------------------
import { POST } from "../route";
import * as aiConfig from "@/lib/ai-config";

// Pull the mocked error classes so tests can construct and throw them.
import {
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";

// ---------------------------------------------------------------------------
// Mock lib/ai-config — prevents real file-system reads
// ---------------------------------------------------------------------------
jest.mock("@/lib/ai-config", () => ({
  readConfig: jest.fn(),
  writeConfig: jest.fn(),
}));

const mockReadConfig = aiConfig.readConfig as jest.MockedFunction<
  typeof aiConfig.readConfig
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic POST Request with a JSON body. */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/config/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a POST Request with an empty body. */
function makeEmptyRequest(): Request {
  return new Request("http://localhost/api/ai/config/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "",
  });
}

/** Parse the JSON payload from a Response. */
async function parseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

/** Make models.list() resolve successfully (valid key). */
function givenValidKey(): void {
  mockModelsListImpl = () => Promise.resolve({ object: "list", data: [] });
}

/** Make models.list() throw an AuthenticationError (HTTP 401). */
function givenInvalidKey(): void {
  mockModelsListImpl = () =>
    Promise.reject(
      new AuthenticationError("401 Incorrect API key provided.", {
        message: "Incorrect API key provided.",
        type: "invalid_request_error",
      }),
    );
}

/** Make models.list() throw a RateLimitError (HTTP 429). */
function givenRateLimited(): void {
  mockModelsListImpl = () =>
    Promise.reject(
      new RateLimitError("429 You exceeded your current quota.", {
        message: "You exceeded your current quota.",
        type: "insufficient_quota",
      }),
    );
}

/** Make models.list() throw an APIConnectionError (network failure). */
function givenNetworkFailure(): void {
  mockModelsListImpl = () =>
    Promise.reject(new APIConnectionError("Failed to connect to OpenAI."));
}

/** Make models.list() throw an APIConnectionTimeoutError (probe timeout). */
function givenTimeout(): void {
  mockModelsListImpl = () =>
    Promise.reject(new APIConnectionTimeoutError("Request timed out."));
}

/** Make models.list() throw a generic APIError with a given HTTP status. */
function givenApiError(status: number, message: string): void {
  mockModelsListImpl = () =>
    Promise.reject(new APIError(`${status} ${message}`, status, { message }));
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  // Default: no stored config.
  mockReadConfig.mockReturnValue({ apiKey: null, model: null });
  // Default: models.list() succeeds.
  givenValidKey();
});

// ===========================================================================
// 1. No API key available
// ===========================================================================

describe("no API key available", () => {
  it("returns HTTP 400 when no key in body and no stored key", async () => {
    const res = await POST(makeEmptyRequest());
    expect(res.status).toBe(400);
  });

  it("returns { valid: false } when no key is available", async () => {
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).toBe(false);
  });

  it("returns a non-empty error string when no key is available", async () => {
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  it("returns HTTP 400 when body is an empty object and no stored key", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("does not attempt to reach OpenAI when no key is available", async () => {
    // Replace the impl with a spy that throws if called — handler must
    // short-circuit before instantiating the OpenAI client.
    const shouldNotBeCalled = jest.fn(() => {
      throw new Error("models.list() must not be called when no key is available");
    });
    mockModelsListImpl = shouldNotBeCalled;
    await POST(makeEmptyRequest());
    expect(shouldNotBeCalled).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 2. Valid key → { valid: true }
// ===========================================================================

describe("valid API key → { valid: true }", () => {
  it("returns HTTP 200 when OpenAI accepts the key from the body", async () => {
    givenValidKey();
    const res = await POST(makeRequest({ apiKey: "sk-valid-body-key" }));
    expect(res.status).toBe(200);
  });

  it("returns { valid: true } when OpenAI accepts the body key", async () => {
    givenValidKey();
    const body = await parseBody(
      await POST(makeRequest({ apiKey: "sk-valid-key" })),
    );
    expect(body.valid).toBe(true);
  });

  it("returns HTTP 200 when the stored key is used as a fallback", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    const res = await POST(makeEmptyRequest());
    expect(res.status).toBe(200);
  });

  it("returns { valid: true } when using the stored key", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).toBe(true);
  });

  it("does not include { valid: false } in a success response", async () => {
    givenValidKey();
    const body = await parseBody(
      await POST(makeRequest({ apiKey: "sk-valid-key" })),
    );
    expect(body.valid).not.toBe(false);
  });

  it("does not include an error field in a success response", async () => {
    givenValidKey();
    const body = await parseBody(
      await POST(makeRequest({ apiKey: "sk-valid-key" })),
    );
    expect(body.error).toBeUndefined();
  });

  it("trims whitespace from the body apiKey before using it", async () => {
    givenValidKey();
    // Trimming is verified by checking the OpenAI constructor received the
    // trimmed value.
    await POST(makeRequest({ apiKey: "  sk-padded  " }));
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-padded");
  });

  it("body key takes priority over the stored key", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    await POST(makeRequest({ apiKey: "sk-body-priority" }));
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-body-priority");
  });

  it("uses the stored key when no key appears in the body", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    await POST(makeEmptyRequest());
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-stored");
  });
});

// ===========================================================================
// 3. OpenAI 401 → { valid: false, error: "Invalid API key" }
// ===========================================================================

describe('OpenAI 401 — invalid key → { valid: false, error: "Invalid API key" }', () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-bad", model: "gpt-4o" });
  });

  it("returns HTTP 401 when OpenAI responds with 401", async () => {
    givenInvalidKey();
    const res = await POST(makeEmptyRequest());
    expect(res.status).toBe(401);
  });

  it('returns { valid: false } on a 401', async () => {
    givenInvalidKey();
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).toBe(false);
  });

  it('returns error: "Invalid API key" on a 401', async () => {
    givenInvalidKey();
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.error).toBe("Invalid API key");
  });

  it('error is exactly "Invalid API key" — not the raw SDK message', async () => {
    givenInvalidKey();
    const body = await parseBody(await POST(makeEmptyRequest()));
    // The raw SDK AuthenticationError message would be
    // "401 Incorrect API key provided." — the handler normalises this.
    expect(body.error).not.toContain("Incorrect API key provided");
    expect(body.error).not.toContain("401");
  });

  it("does not include { valid: true } on a 401", async () => {
    givenInvalidKey();
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).not.toBe(true);
  });

  it("also returns 401 when the invalid key comes from the request body", async () => {
    givenInvalidKey();
    const res = await POST(makeRequest({ apiKey: "sk-invalid-body" }));
    expect(res.status).toBe(401);
    const body = await parseBody(res.clone());
    expect(body.error).toBe("Invalid API key");
  });
});

// ===========================================================================
// 4. OpenAI 429 / quota → { valid: false, error: "Rate limit or quota exceeded" }
// ===========================================================================

describe(
  'OpenAI 429 — rate limit / quota → { valid: false, error: "Rate limit or quota exceeded" }',
  () => {
    beforeEach(() => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-quota", model: "gpt-4o" });
    });

    it("returns HTTP 429 when OpenAI responds with 429", async () => {
      givenRateLimited();
      const res = await POST(makeEmptyRequest());
      expect(res.status).toBe(429);
    });

    it("returns { valid: false } on a 429", async () => {
      givenRateLimited();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).toBe(false);
    });

    it('returns error: "Rate limit or quota exceeded" on a 429', async () => {
      givenRateLimited();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.error).toBe("Rate limit or quota exceeded");
    });

    it('error is exactly "Rate limit or quota exceeded" — not the raw SDK message', async () => {
      givenRateLimited();
      const body = await parseBody(await POST(makeEmptyRequest()));
      // Raw SDK message would be "429 You exceeded your current quota."
      expect(body.error).not.toContain("exceeded your current quota");
      expect(body.error).not.toContain("429");
    });

    it("does not include { valid: true } on a 429", async () => {
      givenRateLimited();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).not.toBe(true);
    });

    it("also returns 429 when the rate-limited key comes from the request body", async () => {
      givenRateLimited();
      const res = await POST(makeRequest({ apiKey: "sk-quota-body" }));
      expect(res.status).toBe(429);
      const body = await parseBody(res.clone());
      expect(body.error).toBe("Rate limit or quota exceeded");
    });
  },
);

// ===========================================================================
// 5. Network failure (fetch / SDK throws) →
//    { valid: false, error: "Could not reach OpenAI" }
// ===========================================================================

describe(
  'network failure → { valid: false, error: "Could not reach OpenAI" }',
  () => {
    beforeEach(() => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    });

    it("returns HTTP 502 when the SDK throws an APIConnectionError", async () => {
      givenNetworkFailure();
      const res = await POST(makeEmptyRequest());
      expect(res.status).toBe(502);
    });

    it("returns { valid: false } on a connection error", async () => {
      givenNetworkFailure();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).toBe(false);
    });

    it('returns error: "Could not reach OpenAI" on a connection error', async () => {
      givenNetworkFailure();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.error).toBe("Could not reach OpenAI");
    });

    it('error is exactly "Could not reach OpenAI" — not the raw SDK message', async () => {
      givenNetworkFailure();
      const body = await parseBody(await POST(makeEmptyRequest()));
      // Raw APIConnectionError message is "Failed to connect to OpenAI."
      expect(body.error).not.toContain("Failed to connect");
    });

    it("does not include { valid: true } on a connection error", async () => {
      givenNetworkFailure();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).not.toBe(true);
    });

    it("also returns 502 when the network failure is triggered by a body key", async () => {
      givenNetworkFailure();
      const res = await POST(makeRequest({ apiKey: "sk-net-body" }));
      expect(res.status).toBe(502);
    });

    it('returns { valid: false, error: "Could not reach OpenAI" } for non-SDK thrown errors', async () => {
      // A plain Error (not an SDK class) should map to the same canonical message.
      mockModelsListImpl = () =>
        Promise.reject(new Error("Some entirely unexpected error"));
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).toBe(false);
      expect(body.error).toBe("Could not reach OpenAI");
    });
  },
);

// ===========================================================================
// 6. Handler timeout → { valid: false, error: "Could not reach OpenAI" }
// ===========================================================================

describe(
  'handler timeout — APIConnectionTimeoutError → { valid: false, error: "Could not reach OpenAI" }',
  () => {
    beforeEach(() => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    });

    it("returns HTTP 502 when the SDK probe times out", async () => {
      givenTimeout();
      const res = await POST(makeEmptyRequest());
      expect(res.status).toBe(502);
    });

    it("returns { valid: false } on timeout", async () => {
      givenTimeout();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).toBe(false);
    });

    it('returns error: "Could not reach OpenAI" on timeout', async () => {
      givenTimeout();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.error).toBe("Could not reach OpenAI");
    });

    it("resolves promptly — does not hang — when the SDK throws a timeout error", async () => {
      givenTimeout();
      // The handler must settle within Jest's default timeout (5 s).
      // If it hangs the test will fail with a timeout error.
      await expect(POST(makeEmptyRequest())).resolves.toBeDefined();
    });

    it("does not include { valid: true } on timeout", async () => {
      givenTimeout();
      const body = await parseBody(await POST(makeEmptyRequest()));
      expect(body.valid).not.toBe(true);
    });

    it("does not include an error field that leaks internal timeout details", async () => {
      givenTimeout();
      const body = await parseBody(await POST(makeEmptyRequest()));
      // The response must not expose internal SDK timeout messages.
      expect(body.error).not.toContain("timed out");
      expect(body.error).not.toContain("Request timed out");
    });
  },
);

// ===========================================================================
// 7. API key never reflected in any response body
// ===========================================================================

describe("security — submitted apiKey never appears in any response body", () => {
  const SENSITIVE_KEY = "sk-super-secret-key-never-expose";

  it("does not include the submitted apiKey in a success response body", async () => {
    givenValidKey();
    const res = await POST(makeRequest({ apiKey: SENSITIVE_KEY }));
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the submitted apiKey in a 401 error response body", async () => {
    givenInvalidKey();
    const res = await POST(makeRequest({ apiKey: SENSITIVE_KEY }));
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the submitted apiKey in a 429 error response body", async () => {
    givenRateLimited();
    const res = await POST(makeRequest({ apiKey: SENSITIVE_KEY }));
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the submitted apiKey in a 502 network-failure response body", async () => {
    givenNetworkFailure();
    const res = await POST(makeRequest({ apiKey: SENSITIVE_KEY }));
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the submitted apiKey in a timeout response body", async () => {
    givenTimeout();
    const res = await POST(makeRequest({ apiKey: SENSITIVE_KEY }));
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the stored apiKey in a success response body", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: SENSITIVE_KEY, model: "gpt-4o" });
    const res = await POST(makeEmptyRequest());
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the stored apiKey in a 401 error response body", async () => {
    givenInvalidKey();
    mockReadConfig.mockReturnValue({ apiKey: SENSITIVE_KEY, model: "gpt-4o" });
    const res = await POST(makeEmptyRequest());
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });

  it("does not include the stored apiKey in a 429 error response body", async () => {
    givenRateLimited();
    mockReadConfig.mockReturnValue({ apiKey: SENSITIVE_KEY, model: "gpt-4o" });
    const res = await POST(makeEmptyRequest());
    const text = await res.clone().text();
    expect(text).not.toContain(SENSITIVE_KEY);
  });
});

// ===========================================================================
// 8. Key / model precedence and stored config fallbacks
// ===========================================================================

describe("key precedence and stored config fallback", () => {
  it("uses the body key when both body and stored key exist", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    await POST(makeRequest({ apiKey: "sk-body" }));
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-body");
  });

  it("uses the stored key when no body key is provided", async () => {
    givenValidKey();
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
    await POST(makeEmptyRequest());
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-stored");
  });

  it("trims the body key before passing it to the OpenAI constructor", async () => {
    givenValidKey();
    await POST(makeRequest({ apiKey: "  sk-padded  " }));
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-padded");
  });
});

// ===========================================================================
// 9. Malformed / non-object request body — falls back to stored key
// ===========================================================================

describe("malformed or non-object body", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
  });

  it("falls back to the stored key when the body is not valid JSON", async () => {
    givenValidKey();
    const req = new Request("http://localhost/api/ai/config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{",
    });
    const res = await POST(req);
    // Should succeed using the stored key rather than returning 400.
    expect(res.status).toBe(200);
    const body = await parseBody(res.clone());
    expect(body.valid).toBe(true);
  });

  it("falls back to the stored key when the body is a JSON array", async () => {
    givenValidKey();
    const res = await POST(makeRequest([{ apiKey: "sk-arr" }]));
    expect(res.status).toBe(200);
    const body = await parseBody(res.clone());
    expect(body.valid).toBe(true);
    // Verify it used the stored key, not the one embedded in the array.
    const OpenAIMock = (await import("openai")).default as jest.Mock;
    const lastCallArgs = OpenAIMock.mock.calls[OpenAIMock.mock.calls.length - 1];
    expect(lastCallArgs[0].apiKey).toBe("sk-stored");
  });

  it("returns HTTP 400 when body is a JSON array and no stored key is available", async () => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
    const res = await POST(makeRequest([{ apiKey: "sk-arr" }]));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 10. Generic OpenAI API errors (status codes other than 401 / 429)
// ===========================================================================

describe("other OpenAI API errors", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
  });

  it("returns a non-200 status for an OpenAI 500 error", async () => {
    givenApiError(500, "Internal server error");
    const res = await POST(makeEmptyRequest());
    expect(res.status).not.toBe(200);
  });

  it("returns { valid: false } for an OpenAI 500 error", async () => {
    givenApiError(500, "Internal server error");
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).toBe(false);
  });

  it("returns a non-empty error string for an OpenAI 500 error", async () => {
    givenApiError(500, "Internal server error");
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  it("proxies the OpenAI HTTP status code for a 403 error", async () => {
    givenApiError(403, "Forbidden");
    const res = await POST(makeEmptyRequest());
    expect(res.status).toBe(403);
  });

  it("returns { valid: false } for a 403 error", async () => {
    givenApiError(403, "Forbidden");
    const body = await parseBody(await POST(makeEmptyRequest()));
    expect(body.valid).toBe(false);
  });
});
