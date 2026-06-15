"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAssistantEnabled(localStorage.getItem("assistant_enabled") === "true");
    setApiKey(localStorage.getItem("openai_api_key") ?? "");
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  function handleSave() {
    localStorage.setItem("openai_api_key", apiKey);
    localStorage.setItem("assistant_enabled", String(assistantEnabled));
    setSaved(true);
  }

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
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
              <button type="submit" className="btn primary">
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
