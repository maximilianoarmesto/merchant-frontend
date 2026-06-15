"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ChatPanel from "@/components/ChatPanel";

/**
 * Floating chat launcher mounted in the root layout. Renders a fixed
 * bottom-right button that toggles a collapsible panel containing the full
 * <ChatPanel>. Because it lives in the root layout it persists across page
 * navigations and never remounts.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState<boolean>(false);
  // Keep the panel mounted through its close animation so the conversation
  // state inside <ChatPanel> survives a quick open/close toggle.
  const [mounted, setMounted] = useState<boolean>(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        if (closeTimer.current) {
          clearTimeout(closeTimer.current);
          closeTimer.current = null;
        }
        setMounted(true);
      }
      return next;
    });
  }, []);

  // Unmount the panel only after the close animation finishes.
  useEffect(() => {
    if (open || !mounted) return;
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      closeTimer.current = null;
    }, 220);
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [open, mounted]);

  // Allow Escape to close the panel when it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="chat-widget" data-testid="chat-widget">
      {mounted && (
        <div
          className={"chat-widget-panel" + (open ? " open" : " closing")}
          data-testid="chat-widget-panel"
          data-open={open ? "true" : "false"}
          role="dialog"
          aria-modal="false"
          aria-label="AI assistant"
          aria-hidden={open ? "false" : "true"}
        >
          <ChatPanel />
        </div>
      )}

      <button
        type="button"
        className="chat-widget-button"
        data-testid="chat-widget-button"
        aria-label={open ? "Close chat assistant" : "Open chat assistant"}
        aria-expanded={open ? "true" : "false"}
        onClick={toggle}
      >
        <span aria-hidden="true">{open ? "✕" : "💬"}</span>
      </button>
    </div>
  );
}
