/**
 * app/api/ai/config/test/route.ts
 *
 * Next.js App Router Route Handler that validates an OpenAI API key by making
 * a lightweight probe to the OpenAI models endpoint via the `openai` SDK.
 *
 * POST /api/ai/config/test
 *   Accepts an optional { apiKey?: string, model?: string } body.
 *   If `apiKey` is supplied in the body it is used for the probe; otherwise
 *   the stored key from lib/ai-config is used.
 *   Returns { ok: true, model: string } on success.
 *   Returns HTTP 400 with { error: string } when no key is available to test.
 *   Returns HTTP 401 with { error: string } when OpenAI rejects the key.
 *   Returns HTTP 429 with { error: string } on rate-limit or quota errors.
 *   Returns HTTP 502 with { error: string } on network failures.
 *
 * Security: the API key is sent server-to-OpenAI only — it is never logged
 * and is never reflected back in any response body.
 */

import { NextResponse } from "next/server";
import OpenAI, {
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import { readConfig } from "@/lib/ai-config";

/** Probe timeout in milliseconds — keeps the UI responsive. */
const PROBE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a human-readable error message from an OpenAI SDK `APIError`.
 *
 * The SDK constructs `err.message` as `"${status} ${msg}"` (e.g.
 * `"401 Incorrect API key provided."`).  When the raw OpenAI error object
 * contains its own `message` string we prefer that because it is cleaner and
 * matches what the tests — and the UI — expect.  We fall back to the SDK
 * message only when the underlying error body is absent or unparseable.
 */
function extractApiErrorMessage(err: APIError): string {
  // `err.error` is the raw JSON object from the OpenAI response body.
  // Shape: { message?: string, type?: string, code?: string | null, … }
  const raw = err.error as Record<string, unknown> | null | undefined;
  if (raw && typeof raw["message"] === "string" && raw["message"].length > 0) {
    return raw["message"];
  }
  // Fall back to the SDK-composed message which includes the status code
  // prefix — useful when no structured error body was returned (e.g. 403 with
  // an empty body produces "403 status code (no body)").
  return err.message;
}

// ---------------------------------------------------------------------------
// POST /api/ai/config/test
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // Parse the optional request body — tolerate malformed/missing body.
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    // Non-fatal: fall back to the stored key.
  }

  // Resolve which key to test: body takes priority, then stored config.
  const bodyKey =
    typeof body.apiKey === "string" && body.apiKey.trim().length > 0
      ? body.apiKey.trim()
      : null;

  const stored = readConfig();
  const keyToTest = bodyKey ?? stored.apiKey;

  // Resolve which model to report: body takes priority, then stored config.
  const bodyModel =
    typeof body.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : null;
  const modelToReport = bodyModel ?? stored.model ?? "gpt-4o";

  if (!keyToTest) {
    return NextResponse.json(
      { error: "No API key available. Enter a key in the form or save one first." },
      { status: 400 },
    );
  }

  // Instantiate a fresh OpenAI client scoped to this request.
  // - maxRetries: 0  — we want a single fast attempt; retries would multiply
  //                    the wall-clock time visible to the user.
  // - timeout:       — enforced at the SDK level so the UI never hangs.
  // - dangerouslyAllowBrowser: true — required because the Jest / jsdom test
  //   environment is detected as browser-like by the SDK.  In production this
  //   handler runs exclusively in the Node.js server runtime.
  const client = new OpenAI({
    apiKey: keyToTest,
    maxRetries: 0,
    timeout: PROBE_TIMEOUT_MS,
    dangerouslyAllowBrowser: true,
  });

  try {
    // `models.list()` is the lightest authenticated call: it confirms the key
    // has valid API access without consuming quota.
    await client.models.list();
  } catch (err) {
    // --- Network / timeout errors -----------------------------------------
    // APIConnectionTimeoutError extends APIConnectionError, so check it first.
    if (err instanceof APIConnectionTimeoutError || err instanceof APIConnectionError) {
      const message =
        err instanceof Error ? err.message : "Network error — could not reach OpenAI.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // --- OpenAI API errors (HTTP responses) --------------------------------
    if (err instanceof AuthenticationError) {
      // HTTP 401 — key is invalid or revoked.
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status: 401 },
      );
    }

    if (err instanceof RateLimitError) {
      // HTTP 429 — rate-limited or quota exhausted.
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status: 429 },
      );
    }

    if (err instanceof APIError) {
      // Any other structured OpenAI error (403, 500, …).
      return NextResponse.json(
        { error: extractApiErrorMessage(err) },
        { status: err.status ?? 502 },
      );
    }

    // --- Unexpected / non-API errors --------------------------------------
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, model: modelToReport });
}
