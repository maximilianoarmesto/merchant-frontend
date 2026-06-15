import { NextResponse } from "next/server";

type ListModelsBody = {
  apiKey?: unknown;
};

type OpenAIModel = {
  id: string;
};

type OpenAIModelsResponse = {
  data?: OpenAIModel[];
};

export async function POST(request: Request) {
  let body: ListModelsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { apiKey } = body;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return NextResponse.json({ error: "Missing API key" }, { status: 400 });
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
      { error: "Failed to reach OpenAI" },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to list models" },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as OpenAIModelsResponse;

  const models = (payload.data ?? [])
    .map((model) => model.id)
    .filter((id) => typeof id === "string" && id.startsWith("gpt-"))
    .sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ models });
}
