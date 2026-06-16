import { NextResponse } from "next/server";

type ValidateKeyBody = {
  apiKey?: unknown;
};

export async function POST(request: Request) {
  let body: ValidateKeyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { apiKey } = body;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return NextResponse.json(
      { valid: false, error: "Missing API key" },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Failed to reach OpenAI" },
      { status: 502 },
    );
  }

  if (response.ok) {
    return NextResponse.json({ valid: true });
  }

  const error =
    response.status === 401 || response.status === 403
      ? "Invalid API key"
      : "Failed to validate API key";

  return NextResponse.json(
    { valid: false, error },
    { status: response.status },
  );
}
