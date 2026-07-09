"use client";

import { useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the conversation pinned to the latest message.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, loading]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (trimmed.length === 0 || loading) return;

    const apiKey = localStorage.getItem("openai_api_key") ?? "";
    const model = localStorage.getItem("openai_model") ?? "";

    if (apiKey.length === 0) {
      setError("Please configure your OpenAI API key in Settings first.");
      return;
    }

    setError(null);

    // Snapshot the history before adding the new message so it matches what
    // the backend should see as prior context.
    const history = messages;
    const userMessage: ChatMessage = { role: "user", content: trimmed };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          apiKey,
          model,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { reply?: string; error?: string }
        | null;

      if (!res.ok || !data) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      const reply = typeof data.reply === "string" ? data.reply : "";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Something went wrong";
      setError(detail);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <>
      {open && (
        <section className="chat-panel" aria-label="AI assistant">
          <header className="chat-panel-header">
            <span className="chat-panel-title">Merchant AI</span>
            <button
              type="button"
              className="chat-panel-close"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="chat-panel-messages" ref={scrollRef}>
            {messages.length === 0 && !loading && (
              <p className="chat-empty">
                Ask about products or orders to get started.
              </p>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`chat-message chat-message-${message.role}`}
              >
                <span className="chat-message-label">
                  {message.role === "user" ? "You" : "Assistant"}
                </span>
                <div className="chat-message-bubble">{message.content}</div>
              </div>
            ))}

            {loading && (
              <div className="chat-message chat-message-assistant">
                <span className="chat-message-label">Assistant</span>
                <div className="chat-message-bubble chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}

          <div className="chat-panel-input">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Type a message…"
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="chat-send"
              onClick={() => void sendMessage()}
              disabled={loading || input.trim().length === 0}
            >
              Send
            </button>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`chat-bubble${open ? " is-open" : ""}`}
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="chat-bubble-icon" aria-hidden="true">
          {open ? (
            "×"
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          )}
        </span>
      </button>
    </>
  );
}
