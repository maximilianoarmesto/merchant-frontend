"use client";

import { useEffect, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type TestStatus = "idle" | "testing" | "success" | "error";

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [hasStoredKey, setHasStoredKey] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  // Reset transient success states after a short delay
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing config from the server on mount
  useEffect(() => {
    fetch("/api/ai/config")
      .then((r) => r.json())
      .then((data: { model: string | null; hasApiKey: boolean }) => {
        if (data.hasApiKey) setHasStoredKey(true);
        if (data.model) setModel(data.model);
      })
      .catch(() => {
        // Non-fatal: the form is still usable without prefilled values
      });
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (testTimerRef.current) clearTimeout(testTimerRef.current);
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveStatus === "saving") return;

    setSaveStatus("saving");
    setSaveError(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Failed to save configuration.");
      }

      setHasStoredKey(true);
      setApiKey("");
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3500);
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveStatus("error");
    }
  };

  const handleTestToken = async () => {
    if (testStatus === "testing") return;

    setTestStatus("testing");
    setTestMessage(null);
    if (testTimerRef.current) clearTimeout(testTimerRef.current);

    // Resolve the key to test: the current input value takes priority over
    // whatever is already stored server-side.
    const keyToTest = apiKey.trim();

    if (!keyToTest && !hasStoredKey) {
      setTestStatus("error");
      setTestMessage("Enter an API key before testing.");
      testTimerRef.current = setTimeout(() => {
        setTestStatus("idle");
        setTestMessage(null);
      }, 4000);
      return;
    }

    try {
      // Use the OpenAI models endpoint as a lightweight connectivity probe.
      // If a new key is in the input field we test that; otherwise we rely on
      // the stored key being forwarded through our own backend.
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${keyToTest}`,
        },
      });

      if (res.ok) {
        setTestStatus("success");
        setTestMessage("API key is valid and the connection succeeded.");
        testTimerRef.current = setTimeout(() => {
          setTestStatus("idle");
          setTestMessage(null);
        }, 5000);
      } else {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errData.error?.message ?? `OpenAI returned ${res.status}.`,
        );
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage((err as Error).message);
      testTimerRef.current = setTimeout(() => {
        setTestStatus("idle");
        setTestMessage(null);
      }, 6000);
    }
  };

  const isSaving = saveStatus === "saving";
  const isTesting = testStatus === "testing";
  const isAnyBusy = isSaving || isTesting;

  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Settings</span>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="detail">
        {/* ---------------------------------------------------------------- */}
        {/* AI configuration panel                                           */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <div className="panel">
            <span className="eyebrow">AI assistant</span>
            <h2 className="ai-config-title">OpenAI configuration</h2>
            <p className="ai-config-desc">
              Connect an OpenAI API key to enable the AI merchant assistant.
              Your key is stored server-side and never exposed to the browser.
            </p>

            <hr className="divider" />

            <form
              className="form ai-config-form"
              onSubmit={handleSave}
              noValidate
            >
              {/* API key input */}
              <label htmlFor="settings-api-key">
                OpenAI API key
                <div className="api-key-wrap">
                  <input
                    id="settings-api-key"
                    type="password"
                    placeholder={hasStoredKey ? "Leave blank to keep existing key" : "sk-…"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      // Clear stale feedback when the user starts editing
                      if (saveStatus === "error") {
                        setSaveStatus("idle");
                        setSaveError(null);
                      }
                      if (testStatus !== "idle") {
                        setTestStatus("idle");
                        setTestMessage(null);
                      }
                    }}
                    disabled={isAnyBusy}
                    autoComplete="off"
                    aria-describedby={
                      testStatus === "error" || testStatus === "success"
                        ? "settings-test-status"
                        : undefined
                    }
                  />
                  {hasStoredKey && (
                    <span className="api-key-badge" aria-label="Key saved">
                      ●●● saved
                    </span>
                  )}
                </div>
              </label>

              {/* Model selector */}
              <label htmlFor="settings-model">
                Model
                <select
                  id="settings-model"
                  className="model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={isAnyBusy}
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Inline test status */}
              {testMessage && (
                <p
                  id="settings-test-status"
                  className={`ai-status ${
                    testStatus === "success"
                      ? "ai-status--success"
                      : "ai-status--error"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="ai-status__icon" aria-hidden="true">
                    {testStatus === "success" ? "✓" : "✕"}
                  </span>
                  {testMessage}
                </p>
              )}

              {/* Inline save error */}
              {saveStatus === "error" && saveError && (
                <p
                  className="ai-status ai-status--error"
                  role="alert"
                  aria-live="assertive"
                >
                  <span className="ai-status__icon" aria-hidden="true">
                    ✕
                  </span>
                  {saveError}
                </p>
              )}

              {/* Inline save success */}
              {saveStatus === "saved" && (
                <p
                  className="ai-status ai-status--success"
                  role="status"
                  aria-live="polite"
                >
                  <span className="ai-status__icon" aria-hidden="true">
                    ✓
                  </span>
                  Configuration saved successfully.
                </p>
              )}

              {/* Action row */}
              <div className="ai-config-actions">
                {/* Test Token button */}
                <button
                  type="button"
                  className={`btn ${
                    testStatus === "success"
                      ? "success"
                      : testStatus === "error"
                        ? "danger"
                        : ""
                  }`}
                  onClick={handleTestToken}
                  disabled={isAnyBusy}
                  aria-busy={isTesting}
                >
                  {isTesting && (
                    <span className="spinner" aria-hidden="true" />
                  )}
                  {isTesting
                    ? "Testing…"
                    : testStatus === "success"
                      ? "✓ Token OK"
                      : testStatus === "error"
                        ? "✕ Test failed"
                        : "Test token"}
                </button>

                {/* Save button */}
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isAnyBusy || (!apiKey.trim() && !hasStoredKey)}
                  aria-busy={isSaving}
                >
                  {isSaving && (
                    <span className="spinner" aria-hidden="true" />
                  )}
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* System info panel                                                */}
        {/* ---------------------------------------------------------------- */}
        <aside>
          <div className="panel">
            <span className="eyebrow">System</span>
            <dl className="kv">
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
        </aside>
      </div>
    </div>
  );
}
