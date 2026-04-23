/**
 * Unit tests for app/api/ai/config/route.ts
 *
 * Strategy
 * --------
 * lib/ai-config is mocked entirely so that no file-system I/O occurs.
 * NextResponse is available via the next/server package which babel-jest
 * transpiles through next/babel.
 *
 * Each handler (GET, POST) is imported directly and called with a synthetic
 * Request object so we exercise the handler logic in isolation.
 *
 * Environment note
 * ----------------
 * jsdom does not implement the static `Response.json()` helper (standardised
 * in the Fetch living spec, available in Node 18+ and modern browsers).
 * NextResponse.json() delegates to it, so we polyfill it here before any
 * module under test is evaluated.  The polyfill mirrors the spec: it
 * JSON-serialises the body and sets Content-Type: application/json.
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

import { NextResponse } from "next/server";
import { GET, POST } from "../route";
import * as aiConfig from "@/lib/ai-config";

// ---------------------------------------------------------------------------
// Mock lib/ai-config
// ---------------------------------------------------------------------------
jest.mock("@/lib/ai-config", () => ({
  readConfig: jest.fn(),
  writeConfig: jest.fn(),
}));

const mockReadConfig = aiConfig.readConfig as jest.MockedFunction<typeof aiConfig.readConfig>;
const mockWriteConfig = aiConfig.writeConfig as jest.MockedFunction<typeof aiConfig.writeConfig>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a synthetic POST Request with a JSON body. */
function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a synthetic POST Request with a non-JSON (malformed) body. */
function makeMalformedRequest(): Request {
  return new Request("http://localhost/api/ai/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-valid-json{{",
  });
}

/** Parse the JSON from a NextResponse. */
async function parseBody(response: NextResponse): Promise<unknown> {
  return response.json();
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// GET /api/ai/config
// ===========================================================================

describe("GET /api/ai/config", () => {
  // -------------------------------------------------------------------------
  // Status code
  // -------------------------------------------------------------------------
  describe("response status", () => {
    it("returns HTTP 200 when the config exists", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-test", model: "gpt-4o" });
      const response = await GET();
      expect(response.status).toBe(200);
    });

    it("returns HTTP 200 when no config has been saved yet", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: null });
      const response = await GET();
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // hasApiKey field
  // -------------------------------------------------------------------------
  describe("hasApiKey field", () => {
    it("returns hasApiKey: true when an API key is stored", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-test", model: "gpt-4o" });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).hasApiKey).toBe(true);
    });

    it("returns hasApiKey: false when no API key is stored", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: null });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).hasApiKey).toBe(false);
    });

    it("returns hasApiKey: false when only the model is stored", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: "gpt-4o" });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).hasApiKey).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // model field
  // -------------------------------------------------------------------------
  describe("model field", () => {
    it("returns the stored model name when set", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-test", model: "gpt-4o" });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).model).toBe("gpt-4o");
    });

    it("returns model: null when no model is stored", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: null });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).model).toBeNull();
    });

    it("returns the model even when the apiKey is null", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: "gpt-3.5-turbo" });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>).model).toBe("gpt-3.5-turbo");
    });
  });

  // -------------------------------------------------------------------------
  // Raw API key is never exposed
  // -------------------------------------------------------------------------
  describe("API key security", () => {
    it("does not include the raw apiKey in the response body", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-super-secret", model: "gpt-4o" });
      const body = await parseBody(await GET());
      expect((body as Record<string, unknown>)).not.toHaveProperty("apiKey");
    });

    it("does not expose the API key value anywhere in the response", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-super-secret", model: "gpt-4o" });
      const response = await GET();
      const text = await response.clone().text();
      expect(text).not.toContain("sk-super-secret");
    });

    it("response body contains exactly the expected keys (model and hasApiKey)", async () => {
      mockReadConfig.mockReturnValue({ apiKey: "sk-test", model: "gpt-4o" });
      const body = await parseBody(await GET());
      expect(Object.keys(body as object).sort()).toEqual(["hasApiKey", "model"].sort());
    });
  });

  // -------------------------------------------------------------------------
  // readConfig is called
  // -------------------------------------------------------------------------
  describe("readConfig integration", () => {
    it("calls readConfig exactly once per request", async () => {
      mockReadConfig.mockReturnValue({ apiKey: null, model: null });
      await GET();
      expect(mockReadConfig).toHaveBeenCalledTimes(1);
    });
  });
});

// ===========================================================================
// POST /api/ai/config
// ===========================================================================

describe("POST /api/ai/config", () => {
  // -------------------------------------------------------------------------
  // Successful persistence
  // -------------------------------------------------------------------------
  describe("successful request", () => {
    beforeEach(() => {
      mockWriteConfig.mockImplementation(() => undefined);
    });

    it("returns HTTP 200 on success", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(200);
    });

    it("returns { success: true } on success", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      const body = await parseBody(await POST(req));
      expect(body).toEqual({ success: true });
    });

    it("calls writeConfig with the provided apiKey and model", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      await POST(req);
      expect(mockWriteConfig).toHaveBeenCalledWith({ apiKey: "sk-new", model: "gpt-4o" });
    });

    it("calls writeConfig exactly once", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      await POST(req);
      expect(mockWriteConfig).toHaveBeenCalledTimes(1);
    });

    it("trims leading/trailing whitespace from apiKey before persisting", async () => {
      const req = makePostRequest({ apiKey: "  sk-padded  ", model: "gpt-4o" });
      await POST(req);
      expect(mockWriteConfig).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-padded" }),
      );
    });

    it("trims leading/trailing whitespace from model before persisting", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "  gpt-4o  " });
      await POST(req);
      expect(mockWriteConfig).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gpt-4o" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Validation — missing apiKey
  // -------------------------------------------------------------------------
  describe("validation: missing or empty apiKey", () => {
    it("returns HTTP 400 when apiKey is absent", async () => {
      const req = makePostRequest({ model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns an error message when apiKey is absent", async () => {
      const req = makePostRequest({ model: "gpt-4o" });
      const body = (await parseBody(await POST(req))) as Record<string, unknown>;
      expect(typeof body.error).toBe("string");
      expect((body.error as string).length).toBeGreaterThan(0);
    });

    it("returns HTTP 400 when apiKey is an empty string", async () => {
      const req = makePostRequest({ apiKey: "", model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns HTTP 400 when apiKey is a whitespace-only string", async () => {
      const req = makePostRequest({ apiKey: "   ", model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns HTTP 400 when apiKey is not a string", async () => {
      const req = makePostRequest({ apiKey: 42, model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("does NOT call writeConfig when apiKey is missing", async () => {
      const req = makePostRequest({ model: "gpt-4o" });
      await POST(req);
      expect(mockWriteConfig).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation — missing model
  // -------------------------------------------------------------------------
  describe("validation: missing or empty model", () => {
    it("returns HTTP 400 when model is absent", async () => {
      const req = makePostRequest({ apiKey: "sk-new" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns an error message when model is absent", async () => {
      const req = makePostRequest({ apiKey: "sk-new" });
      const body = (await parseBody(await POST(req))) as Record<string, unknown>;
      expect(typeof body.error).toBe("string");
      expect((body.error as string).length).toBeGreaterThan(0);
    });

    it("returns HTTP 400 when model is an empty string", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "" });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns HTTP 400 when model is a whitespace-only string", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: "   " });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns HTTP 400 when model is not a string", async () => {
      const req = makePostRequest({ apiKey: "sk-new", model: true });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("does NOT call writeConfig when model is missing", async () => {
      const req = makePostRequest({ apiKey: "sk-new" });
      await POST(req);
      expect(mockWriteConfig).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation — both fields missing
  // -------------------------------------------------------------------------
  describe("validation: both fields missing", () => {
    it("returns HTTP 400 when the body is an empty object", async () => {
      const req = makePostRequest({});
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("does NOT call writeConfig when both fields are missing", async () => {
      const req = makePostRequest({});
      await POST(req);
      expect(mockWriteConfig).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation — malformed JSON body
  // -------------------------------------------------------------------------
  describe("validation: malformed request body", () => {
    it("returns HTTP 400 when the body is not valid JSON", async () => {
      const req = makeMalformedRequest();
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns an error property when the body is not valid JSON", async () => {
      const req = makeMalformedRequest();
      const body = (await parseBody(await POST(req))) as Record<string, unknown>;
      expect(typeof body.error).toBe("string");
    });

    it("does NOT call writeConfig when the body is not valid JSON", async () => {
      const req = makeMalformedRequest();
      await POST(req);
      expect(mockWriteConfig).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Validation — non-object body
  // -------------------------------------------------------------------------
  describe("validation: non-object body", () => {
    it("returns HTTP 400 when the body is a JSON array", async () => {
      const req = makePostRequest([{ apiKey: "sk-new", model: "gpt-4o" }]);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns HTTP 400 when the body is a JSON string", async () => {
      const req = new Request("http://localhost/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("just a string"),
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // writeConfig throws (e.g. disk permission error)
  // -------------------------------------------------------------------------
  describe("when writeConfig throws", () => {
    it("returns HTTP 500", async () => {
      mockWriteConfig.mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied");
      });
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      const response = await POST(req);
      expect(response.status).toBe(500);
    });

    it("returns an error message in the response body", async () => {
      mockWriteConfig.mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied");
      });
      const req = makePostRequest({ apiKey: "sk-new", model: "gpt-4o" });
      const body = (await parseBody(await POST(req))) as Record<string, unknown>;
      expect(typeof body.error).toBe("string");
      expect(body.error).toMatch(/EACCES/i);
    });
  });
});
