"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ConversationStore,
  conversationStore as defaultStore,
  type Conversation,
  type StoredMessage,
} from "@/lib/conversation-store";
import ConversationSidebar from "@/components/ConversationSidebar";

interface ChatPanelProps {
  store?: ConversationStore;
}

export default function ChatPanel({ store = defaultStore }: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const refresh = useCallback(() => {
    setConversations(store.listConversations());
  }, [store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeConversation: Conversation | null = activeId
    ? store.getConversation(activeId)
    : null;
  const messages: StoredMessage[] = activeConversation?.messages ?? [];

  const handleSelect = useCallback(
    (id: string) => {
      setActiveId(id);
    },
    [setActiveId]
  );

  const handleNew = useCallback(() => {
    const conv = store.createConversation();
    setActiveId(conv.id);
    setConversations(store.listConversations());
  }, [store]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  return (
    <div
      className={
        "chat-panel" + (sidebarOpen ? " sidebar-open" : " sidebar-closed")
      }
      data-testid="chat-panel"
      data-sidebar-open={sidebarOpen ? "true" : "false"}
    >
      {sidebarOpen && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onClose={handleToggleSidebar}
        />
      )}

      <section className="chat-main" data-testid="chat-main">
        <div className="chat-main-header">
          {!sidebarOpen && (
            <button
              type="button"
              className="btn ghost chat-sidebar-open-toggle"
              data-testid="chat-sidebar-open"
              aria-label="Open conversation sidebar"
              onClick={handleToggleSidebar}
            >
              ⟩
            </button>
          )}
          <h2 className="chat-main-title">
            {activeConversation?.title ?? "New conversation"}
          </h2>
        </div>

        <div
          className="chat-messages"
          data-testid="chat-messages"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="chat-empty muted">
              {activeConversation
                ? "No messages yet in this conversation."
                : "Select a conversation, or start a new chat."}
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={`${activeConversation?.id ?? "none"}-${idx}`}
                className={`chat-message role-${m.role}`}
                data-testid="chat-message"
                data-role={m.role}
              >
                <span className="chat-message-role">{m.role}</span>
                <span className="chat-message-content">{m.content}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
