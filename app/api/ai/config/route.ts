/**
 * app/api/ai/config/route.ts
 *
 * Next.js App Router Route Handler for reading and writing the OpenAI
 * configuration stored server-side via lib/ai-config.ts.
 *
 * GET  /api/ai/config
 *   Returns { model: string | null, hasApiKey: boolean }.
 *   The raw API key is NEVER included in the response.
 *
 * POST /api/ai/config
 *   Accepts { apiKey: string, model: string }.
 *   Validates that both fields are non-empty strings, persists the config,
 *   and returns { success: true }.
 *   Returns HTTP 400 with { error: string } when validation fails.
 */

import { NextResponse } from "next/server";
import { readConfig, writeConfig } from "@/lib/ai-config";

// ---------------------------------------------------------------------------
// GET /api/ai/config
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const { apiKey, model } = readConfig();

  return NextResponse.json({
    model,
    hasApiKey: apiKey !== null,
  });
}

// ---------------------------------------------------------------------------
// POST /api/ai/config
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const { apiKey, model } = body as Record<string, unknown>;

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return NextResponse.json(
      { error: "apiKey is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  if (typeof model !== "string" || model.trim() === "") {
    return NextResponse.json(
      { error: "model is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    writeConfig({ apiKey: apiKey.trim(), model: model.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
