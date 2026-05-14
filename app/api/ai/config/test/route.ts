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
 *   Returns { valid: true } on success.
 *   Returns HTTP 400 with { valid: false, error: string } when no key is available.
 *   Returns HTTP 401 with { valid: false, error: "Invalid API key" } when OpenAI rejects the key.
 *   Returns HTTP 429 with { valid: false, error: "Rate limit or quota exceeded" } on quota errors.
 *   Returns HTTP 502 with { valid: false, error: "Could not reach OpenAI" } on network failures.
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

  if (!keyToTest) {
    return NextResponse.json(
      {
        valid: false,
        error: "No API key available. Enter a key in the form or save one first.",
      },
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
      return NextResponse.json(
        { valid: false, error: "Could not reach OpenAI" },
        { status: 502 },
      );
    }

    // --- OpenAI API errors (HTTP responses) --------------------------------
    if (err instanceof AuthenticationError) {
      // HTTP 401 — key is invalid or revoked.
      return NextResponse.json(
        { valid: false, error: "Invalid API key" },
        { status: 401 },
      );
    }

    if (err instanceof RateLimitError) {
      // HTTP 429 — rate-limited or quota exhausted.
      return NextResponse.json(
        { valid: false, error: "Rate limit or quota exceeded" },
        { status: 429 },
      );
    }

    if (err instanceof APIError) {
      // Any other structured OpenAI error (403, 500, …).
      return NextResponse.json(
        { valid: false, error: err.message },
        { status: err.status ?? 502 },
      );
    }

    // --- Unexpected / non-API errors --------------------------------------
    return NextResponse.json(
      { valid: false, error: "Could not reach OpenAI" },
      { status: 502 },
    );
  }

  return NextResponse.json({ valid: true });
}
