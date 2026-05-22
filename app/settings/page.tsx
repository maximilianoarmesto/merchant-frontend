"use client";

import {
  useEffect,
  useState,
  useCallback,
  useId,
  type ChangeEvent,
} from "react";
import {
  AISettings,
  ProviderSettings,
  getAISettings,
  saveAISettings,
} from "@/lib/ai-settings";

// ---------------------------------------------------------------------------
// Static model lists
// ---------------------------------------------------------------------------

const OPENAI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "gpt-4", label: "GPT-4" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-3-5", label: "Claude Haiku 3.5" },
  { id: "claude-3-opus-20240229", label: "Claude 3 Opus" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { id: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
];

type Provider = "openai" | "anthropic";

// ---------------------------------------------------------------------------
// Key validation helpers
// ---------------------------------------------------------------------------

function validateKey(provider: Provider, key: string): boolean {
  if (!key.trim()) return false;
  if (provider === "openai") {
    // OpenAI keys: sk-... or sk-proj-...
    return /^sk-[A-Za-z0-9_-]{20,}$/.test(key.trim());
  }
  // Anthropic keys: sk-ant-...
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

// ---------------------------------------------------------------------------
// Status badge component
// ---------------------------------------------------------------------------

type KeyStatus = "idle" | "valid" | "invalid";

function StatusBadge({ status }: { status: KeyStatus }) {
  if (status === "idle") return null;
  const valid = status === "valid";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "11px",
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: valid ? "var(--accent)" : "var(--danger)",
        padding: "2px 8px",
        borderRadius: "999px",
        border: `1px solid ${valid ? "var(--accent)" : "var(--danger)"}`,
        background: valid
          ? "rgba(30, 58, 52, 0.06)"
          : "rgba(122, 31, 31, 0.06)",
      }}
      role="status"
      aria-live="polite"
    >
      {valid ? "✓ Valid" : "✕ Invalid format"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  provider: Provider;
  label: string;
  keyPlaceholder: string;
  models: { id: string; label: string }[];
  settings: ProviderSettings;
  isActive: boolean;
  onSave: (provider: Provider, settings: ProviderSettings) => void;
  onReset: (provider: Provider) => void;
  onActivate: (provider: Provider) => void;
}

function ProviderCard({
  provider,
  label,
  keyPlaceholder,
  models,
  settings,
  isActive,
  onSave,
  onReset,
  onActivate,
}: ProviderCardProps) {
  const [localKey, setLocalKey] = useState(settings.apiKey);
  const [localModel, setLocalModel] = useState(settings.selectedModel);
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "reset">(
    "idle"
  );

  const inputId = useId();
  const modelId = useId();
  const radioId = useId();

  // Sync when parent resets
  useEffect(() => {
    setLocalKey(settings.apiKey);
    setLocalModel(settings.selectedModel);
  }, [settings.apiKey, settings.selectedModel]);

  const keyStatus: KeyStatus = localKey
    ? validateKey(provider, localKey)
      ? "valid"
      : "invalid"
    : "idle";

  const keyIsValid = keyStatus === "valid";

  // Auto-save model selection immediately when changed
  const handleModelChange = (model: string) => {
    setLocalModel(model);
    onSave(provider, { apiKey: localKey, selectedModel: model });
  };

  const handleSave = () => {
    if (!keyIsValid) return;
    onSave(provider, { apiKey: localKey, selectedModel: localModel });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const handleReset = () => {
    onReset(provider);
    setLocalKey("");
    setLocalModel("");
    setShowKey(false);
    setSaveStatus("reset");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const isDirty =
    localKey !== settings.apiKey || localModel !== settings.selectedModel;

  return (
    <div
      className="panel"
      style={{
        outline: isActive ? "2px solid var(--accent)" : "none",
        outlineOffset: "2px",
      }}
    >
      {/* Header row */}
      <div className="spaced" style={{ marginBottom: "1.25rem" }}>
        <div>
          <span className="eyebrow" style={{ marginBottom: "0.25rem" }}>
            {provider === "openai" ? "OpenAI" : "Anthropic"}
          </span>
          <h2 style={{ fontSize: "1.2rem", margin: 0 }}>{label}</h2>
        </div>

        {/* Active provider radio */}
        <label
          htmlFor={radioId}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "11px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: isActive ? "var(--accent)" : "var(--fg-muted)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <input
            id={radioId}
            type="radio"
            name="activeProvider"
            value={provider}
            checked={isActive}
            onChange={() => onActivate(provider)}
            style={{ accentColor: "var(--accent)", width: 16, height: 16 }}
            aria-label={`Set ${label} as active provider`}
          />
          {isActive ? "Active" : "Set active"}
        </label>
      </div>

      <hr className="divider" />

      <div className="form" style={{ maxWidth: "100%", gap: "1.1rem" }}>
        {/* API Key field */}
        <label htmlFor={inputId}>
          API Key
          <div style={{ position: "relative" }}>
            <input
              id={inputId}
              type={showKey ? "text" : "password"}
              placeholder={keyPlaceholder}
              value={localKey}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLocalKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%",
                paddingRight: "2.75rem",
                fontFamily: localKey && !showKey ? "var(--font-mono)" : "inherit",
                borderColor:
                  keyStatus === "valid"
                    ? "var(--accent)"
                    : keyStatus === "invalid"
                    ? "var(--danger)"
                    : undefined,
              }}
              aria-describedby={`${inputId}-status`}
            />
            {/* Show / hide toggle */}
            <button
              type="button"
              onClick={() => setShowKey((v: boolean) => !v)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              style={{
                position: "absolute",
                right: "0.6rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-muted)",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                fontSize: "18px",
              }}
            >
              {showKey ? "⊘" : "⊙"}
            </button>
          </div>
          <div
            id={`${inputId}-status`}
            style={{ minHeight: "1.4em", marginTop: "0.25rem" }}
          >
            <StatusBadge status={keyStatus} />
          </div>
        </label>

        {/* Model dropdown */}
        <label htmlFor={modelId}>
          Model
          <select
            id={modelId}
            value={localModel}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleModelChange(e.target.value)}
            disabled={!keyIsValid}
            aria-disabled={!keyIsValid}
          >
            <option value="">
              {keyIsValid ? "Select a model…" : "Enter a valid key first"}
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        {/* Action row */}
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={!keyIsValid || !isDirty}
          >
            Save
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleReset}
          >
            Reset
          </button>

          {/* Transient feedback */}
          {saveStatus === "saved" && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--accent)",
                fontWeight: 500,
                marginLeft: "0.25rem",
              }}
              role="status"
              aria-live="polite"
            >
              ✓ Saved
            </span>
          )}
          {saveStatus === "reset" && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--fg-muted)",
                fontWeight: 500,
                marginLeft: "0.25rem",
              }}
              role="status"
              aria-live="polite"
            >
              Reset
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton (shown during SSR hydration)
// ---------------------------------------------------------------------------

function ProviderCardSkeleton() {
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        className="skeleton"
        style={{ height: "1rem", width: "30%", borderRadius: 4 }}
      />
      <div
        className="skeleton"
        style={{ height: "1.4rem", width: "55%", borderRadius: 4 }}
      />
      <hr className="divider" />
      <div
        className="skeleton"
        style={{ height: "2.6rem", borderRadius: 4 }}
      />
      <div
        className="skeleton"
        style={{ height: "2.6rem", borderRadius: 4 }}
      />
      <div
        className="skeleton"
        style={{ height: "2.4rem", width: "40%", borderRadius: 4 }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<AISettings>({
    openai: { apiKey: "", selectedModel: "" },
    anthropic: { apiKey: "", selectedModel: "" },
    activeProvider: null,
  });

  useEffect(() => {
    setSettings(getAISettings());
    setHydrated(true);
  }, []);

  const handleSave = useCallback(
    (provider: Provider, providerSettings: ProviderSettings) => {
      setSettings((prev: AISettings) => {
        const next: AISettings = {
          ...prev,
          [provider]: providerSettings,
        };
        saveAISettings(next);
        return next;
      });
    },
    []
  );

  const handleReset = useCallback((provider: Provider) => {
    setSettings((prev: AISettings) => {
      const next: AISettings = {
        ...prev,
        [provider]: { apiKey: "", selectedModel: "" },
        // If we're resetting the active provider, deactivate it
        activeProvider:
          prev.activeProvider === provider ? null : prev.activeProvider,
      };
      saveAISettings(next);
      return next;
    });
  }, []);

  const handleActivate = useCallback((provider: Provider) => {
    setSettings((prev: AISettings) => {
      const next: AISettings = {
        ...prev,
        activeProvider: prev.activeProvider === provider ? null : provider,
      };
      saveAISettings(next);
      return next;
    });
  }, []);

  const activeModel =
    settings.activeProvider === "openai"
      ? OPENAI_MODELS.find((m) => m.id === settings.openai.selectedModel)
          ?.label ?? settings.openai.selectedModel
      : settings.activeProvider === "anthropic"
      ? ANTHROPIC_MODELS.find(
          (m) => m.id === settings.anthropic.selectedModel
        )?.label ?? settings.anthropic.selectedModel
      : null;

  return (
    <div>
      {/* Page heading */}
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Configuration</span>
          <h1>Settings</h1>
          <p>
            Configure your AI provider credentials. Keys are stored locally in
            your browser and never sent to any server.
          </p>
        </div>
      </div>

      <div className="detail">
        {/* Left column — provider cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {!hydrated ? (
            <>
              <ProviderCardSkeleton />
              <ProviderCardSkeleton />
            </>
          ) : (
            <>
              <ProviderCard
                provider="openai"
                label="OpenAI"
                keyPlaceholder="sk-…"
                models={OPENAI_MODELS}
                settings={settings.openai}
                isActive={settings.activeProvider === "openai"}
                onSave={handleSave}
                onReset={handleReset}
                onActivate={handleActivate}
              />
              <ProviderCard
                provider="anthropic"
                label="Anthropic"
                keyPlaceholder="sk-ant-api03-…"
                models={ANTHROPIC_MODELS}
                settings={settings.anthropic}
                isActive={settings.activeProvider === "anthropic"}
                onSave={handleSave}
                onReset={handleReset}
                onActivate={handleActivate}
              />
            </>
          )}
        </div>

        {/* Right column — aside */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Active configuration summary */}
          <div className="panel">
            <span className="eyebrow">Active Configuration</span>
            {!hydrated ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                <div className="skeleton" style={{ height: "0.9rem", width: "70%", borderRadius: 4 }} />
                <div className="skeleton" style={{ height: "0.9rem", width: "50%", borderRadius: 4 }} />
              </div>
            ) : settings.activeProvider ? (
              <dl className="kv" style={{ marginTop: "0.75rem" }}>
                <dt>Provider</dt>
                <dd style={{ textTransform: "capitalize" }}>
                  {settings.activeProvider}
                </dd>
                <dt>Model</dt>
                <dd>{activeModel || <span className="muted">None selected</span>}</dd>
                <dt>Key</dt>
                <dd>
                  {settings[settings.activeProvider].apiKey ? (
                    <span className="mono" style={{ fontSize: 12 }}>
                      ••••{settings[settings.activeProvider].apiKey.slice(-4)}
                    </span>
                  ) : (
                    <span className="muted">Not set</span>
                  )}
                </dd>
              </dl>
            ) : (
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: 14 }}>
                No active provider selected. Use the radio buttons on each
                provider card to set one as active.
              </p>
            )}
          </div>

          {/* System info */}
          <div className="panel">
            <span className="eyebrow">System</span>
            <dl className="kv" style={{ marginTop: "0.75rem" }}>
              <dt>Frontend</dt>
              <dd>merchant-frontend</dd>
              <dt>Catalog API</dt>
              <dd>
                <code className="inline-code">
                  {process.env.NEXT_PUBLIC_CATALOG_API_URL ||
                    "http://localhost:8001"}
                </code>
              </dd>
              <dt>Checkout API</dt>
              <dd>
                <code className="inline-code">
                  {process.env.NEXT_PUBLIC_CHECKOUT_API_URL ||
                    "http://localhost:8002"}
                </code>
              </dd>
              <dt>Environment</dt>
              <dd>local</dd>
            </dl>
          </div>

          {/* Storage note */}
          <div
            className="panel"
            style={{ borderStyle: "dashed", background: "transparent" }}
          >
            <span className="eyebrow">Privacy</span>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", marginTop: "0.5rem", lineHeight: 1.6 }}>
              API keys are stored exclusively in your browser&apos;s{" "}
              <code className="inline-code">localStorage</code> under the key{" "}
              <code className="inline-code">ai_settings_v1</code>. They are
              never transmitted to any server and are only used within this
              browser session.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
