"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = "user" | "assistant";

interface Message {
  id: number;
  role: Role;
  text: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NO_CONFIG_TEXT =
  "AI assistant is not configured. Add an OpenAI API key in Settings to get started.";

// A small counter so every message gets a stable, unique id without importing
// a uuid library.
let _msgId = 0;
function nextId(): number {
  return ++_msgId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Focus the text input every time the panel opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // Keep the message list scrolled to the bottom.
  // Guard against jsdom (used in tests) which does not implement scrollIntoView.
  useEffect(() => {
    const el = bottomRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleToggle = () => setOpen((prev) => !prev);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: nextId(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };

      if (!res.ok || data.error) {
        const errorText =
          data.error === "no_config"
            ? NO_CONFIG_TEXT
            : (data.error ?? `Request failed with status ${res.status}.`);

        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: errorText },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: data.reply ?? "" },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: "Network error — could not reach the assistant.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="chat-widget" data-testid="chat-widget">
      {/* ------------------------------------------------------------------ */}
      {/* Floating action button                                              */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        className="chat-fab"
        onClick={handleToggle}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
        aria-controls="chat-panel"
        data-testid="chat-toggle"
      >
        {open ? (
          /* Down-chevron / close icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        ) : (
          /* Chat bubble icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Chat panel                                                          */}
      {/* ------------------------------------------------------------------ */}
      {open && (
        <div
          id="chat-panel"
          className="chat-panel"
          role="dialog"
          aria-label="AI assistant"
          aria-modal="false"
          data-testid="chat-panel"
        >
          {/* Header */}
          <div className="chat-header" data-testid="chat-header">
            <span className="chat-title">AI assistant</span>
            <button
              type="button"
              className="btn ghost chat-close"
              onClick={handleToggle}
              aria-label="Close AI assistant"
              data-testid="chat-close"
            >
              ✕
            </button>
          </div>

          {/* Message list */}
          <div
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            data-testid="chat-messages"
          >
            {messages.length === 0 && !loading && (
              <p className="chat-empty" data-testid="chat-empty">
                Ask me anything about your store, products, or orders.
              </p>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-bubble chat-bubble--${msg.role}`}
                data-testid={`chat-bubble-${msg.role}`}
              >
                {msg.text}
              </div>
            ))}

            {/* Typing indicator while the AI is working */}
            {loading && (
              <div
                className="chat-bubble chat-bubble--assistant chat-bubble--typing"
                aria-label="Assistant is typing"
                data-testid="chat-typing"
              >
                <span className="chat-dot" aria-hidden="true" />
                <span className="chat-dot" aria-hidden="true" />
                <span className="chat-dot" aria-hidden="true" />
              </div>
            )}

            {/* Invisible scroll anchor */}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="chat-input-row" data-testid="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              aria-label="Message input"
              data-testid="chat-input"
            />
            <button
              type="button"
              className="btn primary chat-send"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              data-testid="chat-send"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
