/**
 * app/api/ai/chat/route.ts
 *
 * Next.js App Router Route Handler for the AI merchant assistant chat.
 *
 * POST /api/ai/chat
 *   Accepts { message: string }.
 *   Uses the stored OpenAI config to generate a reply.
 *   Returns { reply: string } on success.
 *   Returns HTTP 400 with { error: "no_config" } when no API key is configured.
 *   Returns HTTP 400 with { error: string } for validation failures.
 *   Returns HTTP 502 with { error: string } on OpenAI errors.
 *
 * Security: the API key is sent server-to-OpenAI only — it is never reflected
 * in any response body and never logged.
 */

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { readConfig } from "@/lib/ai-config";

const SYSTEM_PROMPT =
  "You are a helpful merchant assistant. Answer questions about products, orders, and store management concisely and accurately.";

const MAX_TOKENS = 512;

// ---------------------------------------------------------------------------
// POST /api/ai/chat
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // --- Parse body -----------------------------------------------------------
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

  const { message } = body as Record<string, unknown>;

  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "message is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  // --- Resolve config -------------------------------------------------------
  const { apiKey, model } = readConfig();

  if (!apiKey) {
    return NextResponse.json({ error: "no_config" }, { status: 400 });
  }

  // --- Call OpenAI ----------------------------------------------------------
  const client = new OpenAI({
    apiKey,
    maxRetries: 1,
    dangerouslyAllowBrowser: true,
  });

  try {
    const completion = await client.chat.completions.create({
      model: model ?? "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message.trim() },
      ],
      max_tokens: MAX_TOKENS,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ??
      "Sorry, I could not generate a response.";

    return NextResponse.json({ reply });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
