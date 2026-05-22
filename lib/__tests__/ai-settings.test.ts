import {
  AISettings,
  ProviderSettings,
  getAISettings,
  saveAISettings,
  clearAISettings,
} from "../ai-settings";

// AC-1 helpers: compile-time checks that the interface has the right shape
function assertProviderSettings(_: ProviderSettings) {}
function assertAISettings(_: AISettings) {}

const FULL_SETTINGS: AISettings = {
  openai: { apiKey: "sk-test-openai", selectedModel: "gpt-4o" },
  anthropic: { apiKey: "sk-ant-test", selectedModel: "claude-3-5-sonnet" },
  activeProvider: "openai",
};

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

// AC-1: AISettings interface shape
describe("AISettings interface (ac-1)", () => {
  it("has openai and anthropic ProviderSettings and activeProvider", () => {
    const s: AISettings = {
      openai: { apiKey: "a", selectedModel: "b" },
      anthropic: { apiKey: "c", selectedModel: "d" },
      activeProvider: "anthropic",
    };
    assertProviderSettings(s.openai);
    assertProviderSettings(s.anthropic);
    assertAISettings(s);
    expect(s.activeProvider).toBe("anthropic");
  });

  it("activeProvider accepts null", () => {
    const s: AISettings = { ...FULL_SETTINGS, activeProvider: null };
    expect(s.activeProvider).toBeNull();
  });
});

// AC-2: getAISettings() returns safe defaults when nothing is stored
describe("getAISettings (ac-2)", () => {
  it("returns defaults when localStorage is empty", () => {
    const settings = getAISettings();
    expect(settings.openai.apiKey).toBe("");
    expect(settings.openai.selectedModel).toBe("");
    expect(settings.anthropic.apiKey).toBe("");
    expect(settings.anthropic.selectedModel).toBe("");
    expect(settings.activeProvider).toBeNull();
  });

  it("returns defaults when localStorage contains invalid JSON", () => {
    localStorage.setItem("ai_settings_v1", "not-json{{{");
    const settings = getAISettings();
    expect(settings.activeProvider).toBeNull();
  });

  it("fills missing fields with defaults for partial data", () => {
    localStorage.setItem("ai_settings_v1", JSON.stringify({ activeProvider: "openai" }));
    const settings = getAISettings();
    expect(settings.openai.apiKey).toBe("");
    expect(settings.activeProvider).toBe("openai");
  });
});

// AC-3: saveAISettings() persists to localStorage
describe("saveAISettings (ac-3)", () => {
  it("writes the full settings object to localStorage", () => {
    saveAISettings(FULL_SETTINGS);
    const raw = localStorage.getItem("ai_settings_v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.openai.apiKey).toBe("sk-test-openai");
    expect(parsed.openai.selectedModel).toBe("gpt-4o");
    expect(parsed.anthropic.apiKey).toBe("sk-ant-test");
    expect(parsed.anthropic.selectedModel).toBe("claude-3-5-sonnet");
    expect(parsed.activeProvider).toBe("openai");
  });

  it("round-trips through getAISettings correctly", () => {
    saveAISettings(FULL_SETTINGS);
    const retrieved = getAISettings();
    expect(retrieved).toEqual(FULL_SETTINGS);
  });
});

// AC-4: settings survive page refresh (simulated by save then fresh read)
describe("settings survive page refresh (ac-4)", () => {
  it("data is in localStorage and readable after save", () => {
    saveAISettings(FULL_SETTINGS);
    // Simulate a page refresh: the module is re-imported but localStorage persists
    const afterRefresh = getAISettings();
    expect(afterRefresh.openai.apiKey).toBe("sk-test-openai");
    expect(afterRefresh.anthropic.selectedModel).toBe("claude-3-5-sonnet");
    expect(afterRefresh.activeProvider).toBe("openai");
  });

  it("clearAISettings removes persisted data", () => {
    saveAISettings(FULL_SETTINGS);
    clearAISettings();
    const afterClear = getAISettings();
    expect(afterClear.openai.apiKey).toBe("");
    expect(afterClear.activeProvider).toBeNull();
  });
});

// AC-5: API keys are never logged or exposed via console
describe("API keys never logged (ac-5)", () => {
  it("saveAISettings does not log the API key", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    saveAISettings(FULL_SETTINGS);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-test-openai"));
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-ant-test"));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-test-openai"));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-ant-test"));
  });

  it("getAISettings does not log the API key", () => {
    saveAISettings(FULL_SETTINGS);
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    getAISettings();
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-test-openai"));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("sk-ant-test"));
  });
});
