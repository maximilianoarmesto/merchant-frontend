"use client";

import { useState } from "react";

export default function ChatBubble() {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      className={`chat-bubble${open ? " is-open" : ""}`}
      aria-label={open ? "Close chat" : "Open chat"}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <span className="chat-bubble-icon" aria-hidden="true">
        {open ? "×" : "Chat"}
      </span>
    </button>
  );
}
