const STORAGE_KEY = "ai_settings_v1";

export interface ProviderSettings {
  apiKey: string;
  selectedModel: string;
}

export interface AISettings {
  openai: ProviderSettings;
  anthropic: ProviderSettings;
  activeProvider: "openai" | "anthropic" | null;
}

const DEFAULT_SETTINGS: AISettings = {
  openai: { apiKey: "", selectedModel: "" },
  anthropic: { apiKey: "", selectedModel: "" },
  activeProvider: null,
};

export function getAISettings(): AISettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      openai: {
        apiKey: parsed.openai?.apiKey ?? "",
        selectedModel: parsed.openai?.selectedModel ?? "",
      },
      anthropic: {
        apiKey: parsed.anthropic?.apiKey ?? "",
        selectedModel: parsed.anthropic?.selectedModel ?? "",
      },
      activeProvider: parsed.activeProvider ?? null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(settings: AISettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearAISettings(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
