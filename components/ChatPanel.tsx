"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ConversationStore,
  conversationStore as defaultStore,
  type Conversation,
  type StoredMessage,
} from "@/lib/conversation-store";
import ConversationSidebar from "@/components/ConversationSidebar";
import {
  CheckoutCard,
  OrderConfirmationCard,
  PaymentErrorCard,
} from "@/components/ChatCards";
import { parseToolResultCard } from "@/lib/chat-cards";
import { commerceTools } from "@/lib/chat-tools";
import type { ToolDefinition } from "@/lib/chat-adapter";

interface ChatPanelProps {
  store?: ConversationStore;
  /** Tools used to fulfil in-card actions (e.g. process_payment). Injectable for tests. */
  tools?: ToolDefinition[];
}

export default function ChatPanel({
  store = defaultStore,
  tools = commerceTools,
}: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);

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

  const handleConfirmPurchase = useCallback(
    async (sessionId: string) => {
      if (!activeId) return;
      const payTool = tools.find((t) => t.name === "process_payment");
      if (!payTool) return;
      setPayingSessionId(sessionId);
      try {
        const result = await payTool.execute({ session_id: sessionId });
        store.appendMessage(activeId, { role: "tool", content: result });
        refresh();
      } finally {
        setPayingSessionId(null);
      }
    },
    [activeId, tools, store, refresh]
  );

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
            messages.map((m, idx) => {
              const key = `${activeConversation?.id ?? "none"}-${idx}`;
              if (m.role === "tool") {
                const card = parseToolResultCard(m.content);
                if (card?.kind === "checkout") {
                  return (
                    <CheckoutCard
                      key={key}
                      session={card.session}
                      pending={payingSessionId === card.session.id}
                      onConfirm={handleConfirmPurchase}
                    />
                  );
                }
                if (card?.kind === "order") {
                  return <OrderConfirmationCard key={key} order={card.order} />;
                }
                if (card?.kind === "error") {
                  return <PaymentErrorCard key={key} reason={card.reason} />;
                }
              }
              return (
                <div
                  key={key}
                  className={`chat-message role-${m.role}`}
                  data-testid="chat-message"
                  data-role={m.role}
                >
                  <span className="chat-message-role">{m.role}</span>
                  <span className="chat-message-content">{m.content}</span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
