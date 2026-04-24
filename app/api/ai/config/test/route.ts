/**
 * app/api/ai/config/test/route.ts
 *
 * Next.js App Router Route Handler that validates an OpenAI API key by making
 * a lightweight probe to the OpenAI models endpoint.
 *
 * POST /api/ai/config/test
 *   Accepts an optional { apiKey?: string, model?: string } body.
 *   If `apiKey` is supplied in the body it is used for the probe; otherwise
 *   the stored key from lib/ai-config is used.
 *   Returns { ok: true, model: string } on success.
 *   Returns HTTP 400 with { error: string } when no key is available to test.
 *   Returns HTTP 401/other with { error: string } when OpenAI rejects the key.
 */

import { NextResponse } from "next/server";
import { readConfig } from "@/lib/ai-config";

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

  // Probe the OpenAI API using the models list endpoint — the lightest
  // authenticated call that confirms the key is valid and has API access.
  let probeResponse: Response;
  try {
    probeResponse = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${keyToTest}`,
        "Content-Type": "application/json",
      },
    });
  } catch (networkErr) {
    const message =
      networkErr instanceof Error
        ? networkErr.message
        : "Network error — could not reach OpenAI.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (probeResponse.ok) {
    return NextResponse.json({ ok: true, model: modelToReport });
  }

  // Parse the OpenAI error body for a meaningful message.
  let errorMessage = `OpenAI returned ${probeResponse.status}.`;
  try {
    const errData = (await probeResponse.json()) as {
      error?: { message?: string };
    };
    if (errData.error?.message) {
      errorMessage = errData.error.message;
    }
  } catch {
    // Fall through to the generic message.
  }

  return NextResponse.json(
    { error: errorMessage },
    { status: probeResponse.status },
  );
}
