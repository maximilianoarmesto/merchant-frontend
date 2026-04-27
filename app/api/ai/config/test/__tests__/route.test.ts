/**
 * Unit tests for app/api/ai/config/test/route.ts
 *
 * Strategy
 * --------
 * lib/ai-config is mocked so no file-system I/O occurs.
 * global.fetch is replaced by jest-fetch-mock (configured in jest.config.ts
 * setupFiles) so we control all outbound OpenAI network calls.
 *
 * The handler is imported directly and called with a synthetic Request so we
 * exercise the handler logic in isolation.
 *
 * Environment note
 * ----------------
 * jsdom does not implement the static `Response.json()` helper; the same
 * polyfill used in the config route tests is applied here.
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

import fetchMock from "jest-fetch-mock";
import { POST } from "../route";
import * as aiConfig from "@/lib/ai-config";

// ---------------------------------------------------------------------------
// Mock lib/ai-config
// ---------------------------------------------------------------------------
jest.mock("@/lib/ai-config", () => ({
  readConfig: jest.fn(),
  writeConfig: jest.fn(),
}));

const mockReadConfig = aiConfig.readConfig as jest.MockedFunction<typeof aiConfig.readConfig>;

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

/** Parse the JSON from a Response. */
async function parseBody(response: Response): Promise<unknown> {
  return response.json();
}

/**
 * Return the `Authorization` header value sent to OpenAI in the most recent
 * fetch call, regardless of whether the headers were passed as a plain object
 * or as a `Headers` instance (the OpenAI SDK v6 always uses `Headers`).
 *
 * HTTP header names are case-insensitive; we check both "authorization" and
 * "Authorization" so the helper works with both SDK versions.
 */
function getAuthHeaderFromLastFetchCall(): string | null | undefined {
  const calls = (fetchMock as unknown as jest.Mock).mock.calls;
  if (calls.length === 0) return undefined;
  // fetchMock records calls as [input, init?]
  const [, init] = calls[calls.length - 1] as [unknown, RequestInit?];
  if (!init?.headers) return undefined;

  if (init.headers instanceof Headers) {
    return init.headers.get("authorization") ?? init.headers.get("Authorization");
  }
  // Plain object (e.g. from an older route implementation using raw fetch).
  const h = init.headers as Record<string, string>;
  return h["authorization"] ?? h["Authorization"];
}

/** Program fetchMock to return a successful OpenAI models response. */
function mockOpenAiSuccess(): void {
  fetchMock.mockResponseOnce(
    JSON.stringify({ object: "list", data: [] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Program fetchMock to return an OpenAI 401 Unauthorized response. */
function mockOpenAiUnauthorized(message = "Incorrect API key provided."): void {
  fetchMock.mockResponseOnce(
    JSON.stringify({ error: { message, type: "invalid_request_error" } }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

/** Program fetchMock to simulate a network failure. */
function mockOpenAiNetworkError(): void {
  fetchMock.mockRejectOnce(new Error("Failed to connect"));
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
// No key available
// ===========================================================================

describe("no API key available", () => {
  it("returns HTTP 400 when no key in body and no stored key", async () => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
    const req = makeEmptyRequest();
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns an error message when no key is available", async () => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  it("does NOT call fetch when no key is available", async () => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
    const req = makeEmptyRequest();
    await POST(req);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 when body is empty object and no stored key", async () => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Successful probe — key supplied in body
// ===========================================================================

describe("successful probe using body apiKey", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: null, model: null });
  });

  it("returns HTTP 200 when OpenAI accepts the key from the body", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "sk-body-key", model: "gpt-4o" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns { ok: true } when OpenAI accepts the key", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "sk-body-key", model: "gpt-4o" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it("returns the model from the body in the response", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "sk-body-key", model: "gpt-4-turbo" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4-turbo");
  });

  it("calls the OpenAI models endpoint with the body key", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "sk-body-key", model: "gpt-4o" });
    await POST(req);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.anything(),
    );
    // The OpenAI SDK v6 uses a `Headers` instance (case-insensitive); use the
    // helper to normalise the lookup across both plain-object and Headers forms.
    expect(getAuthHeaderFromLastFetchCall()).toBe("Bearer sk-body-key");
  });

  it("trims whitespace from the apiKey before sending it to OpenAI", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "  sk-padded  ", model: "gpt-4o" });
    await POST(req);
    expect(getAuthHeaderFromLastFetchCall()).toBe("Bearer sk-padded");
  });
});

// ===========================================================================
// Successful probe — stored key used as fallback
// ===========================================================================

describe("successful probe using stored key as fallback", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
  });

  it("returns HTTP 200 when OpenAI accepts the stored key", async () => {
    mockOpenAiSuccess();
    const req = makeEmptyRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("uses the stored key when no key is in the body", async () => {
    mockOpenAiSuccess();
    const req = makeEmptyRequest();
    await POST(req);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.anything(),
    );
    expect(getAuthHeaderFromLastFetchCall()).toBe("Bearer sk-stored");
  });

  it("body key takes priority over stored key", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ apiKey: "sk-new", model: "gpt-4o" });
    await POST(req);
    expect(getAuthHeaderFromLastFetchCall()).toBe("Bearer sk-new");
  });

  it("uses stored model when no model is in the body", async () => {
    mockOpenAiSuccess();
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o");
  });

  it("uses body model when provided", async () => {
    mockOpenAiSuccess();
    const req = makeRequest({ model: "gpt-3.5-turbo" });
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.model).toBe("gpt-3.5-turbo");
  });
});

// ===========================================================================
// OpenAI rejects the key
// ===========================================================================

describe("OpenAI rejects the key", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-bad", model: "gpt-4o" });
  });

  it("returns HTTP 401 when OpenAI responds with 401", async () => {
    mockOpenAiUnauthorized();
    const req = makeEmptyRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns the OpenAI error message in the response body", async () => {
    mockOpenAiUnauthorized("Incorrect API key provided.");
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.error).toBe("Incorrect API key provided.");
  });

  it("does not return { ok: true } on failure", async () => {
    mockOpenAiUnauthorized();
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.ok).toBeUndefined();
  });

  it("returns a generic error message when OpenAI body has no error.message", async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({}),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect(body.error as string).toMatch(/403/);
  });
});

// ===========================================================================
// Network failure
// ===========================================================================

describe("network failure reaching OpenAI", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
  });

  it("returns HTTP 502 when fetch throws a network error", async () => {
    mockOpenAiNetworkError();
    const req = makeEmptyRequest();
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns an error string in the body on network failure", async () => {
    mockOpenAiNetworkError();
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Malformed / non-object request body
// ===========================================================================

describe("malformed or non-object body", () => {
  beforeEach(() => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: "gpt-4o" });
  });

  it("falls back to the stored key when the body is not valid JSON", async () => {
    mockOpenAiSuccess();
    const req = new Request("http://localhost/api/ai/config/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{{",
    });
    const res = await POST(req);
    // Should still probe using the stored key — no 400 from body parsing
    expect(res.status).toBe(200);
  });

  it("falls back to the stored key when the body is a JSON array", async () => {
    mockOpenAiSuccess();
    const req = makeRequest([{ apiKey: "sk-arr" }]);
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Array body is ignored — uses stored key.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.anything(),
    );
    expect(getAuthHeaderFromLastFetchCall()).toBe("Bearer sk-stored");
  });
});

// ===========================================================================
// Default model fallback
// ===========================================================================

describe("default model fallback", () => {
  it('defaults the model to "gpt-4o" when neither body nor stored config has one', async () => {
    mockReadConfig.mockReturnValue({ apiKey: "sk-stored", model: null });
    mockOpenAiSuccess();
    const req = makeEmptyRequest();
    const body = (await parseBody(await POST(req))) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o");
  });
});
