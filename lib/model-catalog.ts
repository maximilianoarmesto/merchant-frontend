export type Provider = "openai" | "anthropic";

export const STATIC_MODELS: Record<Provider, string[]> = {
  openai: ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  anthropic: [
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "claude-haiku-3-5",
    "claude-opus-4",
    "claude-sonnet-4",
  ],
};

const NON_CHAT_TERMS = ["embedding", "instruct", "whisper", "tts", "dall", "audio"];

function isChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (!lower.includes("gpt")) return false;
  return !NON_CHAT_TERMS.some((term) => lower.includes(term));
}

export async function getAvailableModels(
  provider: Provider,
  apiKey?: string
): Promise<string[]> {
  if (!apiKey) return STATIC_MODELS[provider];

  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return STATIC_MODELS[provider];
      const data = (await res.json()) as { data: Array<{ id: string }> };
      const models = data.data.map((m) => m.id).filter(isChatModel).sort();
      return models.length > 0 ? models : STATIC_MODELS[provider];
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) return STATIC_MODELS[provider];
      const data = (await res.json()) as { data: Array<{ id: string }> };
      const models = data.data.map((m) => m.id);
      return models.length > 0 ? models : STATIC_MODELS[provider];
    }
  } catch {
    return STATIC_MODELS[provider];
  }

  return STATIC_MODELS[provider];
}
