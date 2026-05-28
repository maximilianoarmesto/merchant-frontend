"use client";

import { type Conversation } from "@/lib/conversation-store";
import { formatRelativeTime } from "@/lib/relative-time";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  now?: number;
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onClose,
  now,
}: ConversationSidebarProps) {
  return (
    <aside
      className="chat-sidebar"
      data-testid="chat-sidebar"
      aria-label="Conversation history"
    >
      <div className="chat-sidebar-header">
        <button
          type="button"
          className="btn primary chat-sidebar-new"
          data-testid="chat-new-button"
          onClick={onNew}
        >
          + New Chat
        </button>
        <button
          type="button"
          className="btn ghost chat-sidebar-close"
          data-testid="chat-sidebar-close"
          aria-label="Close conversation sidebar"
          onClick={onClose}
        >
          ⟨
        </button>
      </div>

      <ul className="chat-sidebar-list" data-testid="chat-conversation-list">
        {conversations.length === 0 && (
          <li className="chat-sidebar-empty muted">No conversations yet.</li>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          return (
            <li key={conv.id}>
              <button
                type="button"
                className={
                  "chat-sidebar-item" + (isActive ? " active" : "")
                }
                aria-current={isActive ? "true" : undefined}
                data-testid="chat-conversation-item"
                data-conversation-id={conv.id}
                onClick={() => onSelect(conv.id)}
              >
                <span className="chat-sidebar-item-title">{conv.title}</span>
                <span className="chat-sidebar-item-time">
                  {formatRelativeTime(conv.updatedAt, now)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
