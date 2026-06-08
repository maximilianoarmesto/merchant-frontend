"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
import {
  createApiChatStreamer,
  toolLabel,
  type ChatStreamer,
} from "@/lib/chat-stream";
import { getAISettings } from "@/lib/ai-settings";
import { renderMarkdownToHtml } from "@/lib/markdown";

interface ChatPanelProps {
  store?: ConversationStore;
  /** Tools used to fulfil in-card actions (e.g. process_payment). Injectable for tests. */
  tools?: ToolDefinition[];
  /** Produces the assistant reply stream. Injectable for tests; defaults to /api/chat. */
  streamer?: ChatStreamer;
}

export default function ChatPanel({
  store = defaultStore,
  tools = commerceTools,
  streamer,
}: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [payingSessionId, setPayingSessionId] = useState<string | null>(null);

  // Composer + streaming state.
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [streamingText, setStreamingText] = useState<string>("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const messagesRef = useRef<HTMLDivElement | null>(null);

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

  // AC: auto-scroll to bottom whenever new content arrives (messages, streamed
  // tokens, or the tool indicator appearing/disappearing).
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, activeTool, activeId]);

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

  const resolveStreamer = useCallback((): ChatStreamer => {
    if (streamer) return streamer;
    const settings = getAISettings();
    const provider = settings.activeProvider;
    if (!provider) {
      return async function* () {
        yield {
          type: "error" as const,
          message: "No AI provider configured. Add one in AI Settings.",
        };
      };
    }
    const ps = settings[provider];
    return createApiChatStreamer({
      provider,
      apiKey: ps.apiKey,
      model: ps.selectedModel,
    });
  }, [streamer]);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || streaming) return;

      // Ensure there is an active conversation to append to.
      let targetId = activeId;
      if (!targetId) {
        const conv = store.createConversation();
        targetId = conv.id;
        setActiveId(targetId);
      }

      // Optimistic user message — rendered immediately on send.
      store.appendMessage(targetId, { role: "user", content: text });
      setInput("");
      refresh();

      setStreaming(true);
      setStreamingText("");
      setActiveTool(null);
      setStreamError(null);

      const history = store.getConversation(targetId)?.messages ?? [];
      let acc = "";
      try {
        for await (const ev of resolveStreamer()(history)) {
          if (ev.type === "text") {
            acc += ev.delta;
            setStreamingText(acc);
          } else if (ev.type === "tool") {
            setActiveTool(ev.tool);
          } else if (ev.type === "tool_end") {
            setActiveTool(null);
          } else if (ev.type === "error") {
            setStreamError(ev.message);
          }
        }
      } catch (err) {
        setStreamError(err instanceof Error ? err.message : "Stream failed.");
      } finally {
        if (acc.trim()) {
          store.appendMessage(targetId, { role: "assistant", content: acc });
        }
        setStreaming(false);
        setStreamingText("");
        setActiveTool(null);
        refresh();
      }
    },
    [activeId, input, streaming, store, refresh, resolveStreamer]
  );

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

  const hasContent =
    messages.length > 0 || streaming || streamingText.length > 0;

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
          ref={messagesRef}
        >
          {!hasContent ? (
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
                <MessageBubble
                  key={key}
                  role={m.role}
                  content={m.content}
                  timestamp={m.timestamp}
                />
              );
            })
          )}

          {/* Live assistant reply streaming in token by token. */}
          {streaming && streamingText.length > 0 && (
            <div
              className="chat-message role-assistant"
              data-testid="chat-message"
              data-role="assistant"
              data-streaming="true"
            >
              <span className="chat-message-role">assistant</span>
              <span
                className="chat-message-content markdown"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(streamingText),
                }}
              />
            </div>
          )}

          {/* Labelled "thinking" indicator while a tool executes. */}
          {streaming && activeTool && (
            <div
              className="chat-tool-indicator"
              data-testid="chat-tool-indicator"
              data-tool={activeTool}
              aria-live="polite"
            >
              <span className="chat-tool-spinner" aria-hidden="true" />
              <span className="chat-tool-label">{toolLabel(activeTool)}</span>
            </div>
          )}

          {streamError && (
            <div className="chat-error" data-testid="chat-error" role="alert">
              {streamError}
            </div>
          )}
        </div>

        <form
          className="chat-composer"
          data-testid="chat-composer"
          onSubmit={handleSend}
        >
          <input
            type="text"
            className="chat-input"
            data-testid="chat-input"
            placeholder="Ask about products, checkout, orders…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            aria-label="Message"
          />
          <button
            type="submit"
            className="btn primary chat-send"
            data-testid="chat-send"
            disabled={streaming || input.trim().length === 0}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

function formatTimestamp(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

interface MessageBubbleProps {
  role: StoredMessage["role"];
  content: string;
  timestamp: number;
}

function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  const iso = new Date(timestamp).toISOString();
  const label = formatTimestamp(timestamp);
  return (
    <div
      className={`chat-message role-${role}`}
      data-testid="chat-message"
      data-role={role}
      title={label}
    >
      <span className="chat-message-role">{role}</span>
      {role === "assistant" ? (
        <span
          className="chat-message-content markdown"
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(content) }}
        />
      ) : (
        <span className="chat-message-content">{content}</span>
      )}
      <time
        className="chat-message-time"
        data-testid="chat-message-time"
        dateTime={iso}
      >
        {label}
      </time>
    </div>
  );
}
