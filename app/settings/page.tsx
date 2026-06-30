"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"valid" | "invalid" | null>(null);

  useEffect(() => {
    setAssistantEnabled(localStorage.getItem("assistant_enabled") === "true");
    setApiKey(localStorage.getItem("openai_api_key") ?? "");
    setSelectedModel(localStorage.getItem("openai_model") ?? "");
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  // Editing the key invalidates a previous validation: the model list belongs
  // to the key that produced it.
  function handleKeyChange(value: string) {
    setApiKey(value);
    setValidated(false);
    setValidationError(null);
    setModels([]);
    setTestResult(null);
  }

  async function handleTest() {
    if (apiKey.length === 0 || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = (await res.json().catch(() => ({}))) as { valid?: boolean };
      setTestResult(res.ok && data.valid ? "valid" : "invalid");
    } catch {
      setTestResult("invalid");
    } finally {
      setTesting(false);
    }
  }

  async function handleValidate() {
    if (apiKey.length === 0 || validating) return;
    setValidating(true);
    setValidationError(null);
    try {
      const res = await fetch("/api/ai/list-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) {
        setValidated(false);
        setModels([]);
        setValidationError("Could not validate key. Check it and try again.");
        return;
      }
      const data = (await res.json()) as { models?: string[] };
      const available = data.models ?? [];
      setModels(available);
      setValidated(true);
      // Keep a previously saved model selected if it is still available.
      setSelectedModel((current) =>
        current && available.includes(current) ? current : "",
      );
    } catch {
      setValidated(false);
      setModels([]);
      setValidationError("Could not reach the server. Try again.");
    } finally {
      setValidating(false);
    }
  }

  function handleSave() {
    localStorage.setItem("openai_api_key", apiKey);
    localStorage.setItem("assistant_enabled", String(assistantEnabled));
    localStorage.setItem("openai_model", selectedModel);
    setSaved(true);
  }

  const canSave = validated && selectedModel.length > 0;

  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Settings</span>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="detail">
        <div>
          <div className="panel">
            <span className="eyebrow">Assistant</span>
            <h2 style={{ marginBottom: "0.5rem" }}>AI merchant assistant</h2>
            <p className="muted">
              Connect your OpenAI API key to ask an AI assistant to manage your
              products, check inventory, draft descriptions, and search orders
              in natural language.
            </p>
            <hr className="divider" />
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              <label>
                Assistant state
                <select
                  value={assistantEnabled ? "on" : "off"}
                  onChange={(e) =>
                    setAssistantEnabled(e.target.value === "on")
                  }
                >
                  <option value="off">Disabled</option>
                  <option value="on">Enabled</option>
                </select>
              </label>
              <label>
                OpenAI API key
                <input
                  type="password"
                  placeholder="sk-…"
                  value={apiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                />
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <button
                  type="button"
                  className="btn"
                  onClick={handleTest}
                  disabled={apiKey.length === 0 || testing}
                >
                  {testing ? "Testing…" : "Test"}
                </button>
                {testResult === "valid" ? (
                  <span
                    className="tag"
                    style={{
                      color: "var(--accent)",
                      borderColor: "var(--accent)",
                    }}
                  >
                    ✓ Key is valid
                  </span>
                ) : null}
                {testResult === "invalid" ? (
                  <span
                    className="tag"
                    style={{
                      color: "var(--danger)",
                      borderColor: "var(--danger)",
                    }}
                  >
                    ✗ Invalid key
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleValidate}
                disabled={apiKey.length === 0 || validating}
              >
                {validating
                  ? "Validating…"
                  : validated
                    ? "Validated ✓"
                    : "Validate key"}
              </button>
              {validationError ? (
                <p className="faded-hint" style={{ color: "var(--danger, #c0392b)" }}>
                  {validationError}
                </p>
              ) : null}
              {validated ? (
                <label>
                  Model
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="">Select a model…</option>
                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="submit"
                className="btn primary"
                disabled={!canSave}
              >
                {saved ? "Saved ✓" : "Save"}
              </button>
            </form>
            <p className="faded-hint">
              Your API key is stored locally in this browser and never leaves
              your device.
            </p>
          </div>
        </div>

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
