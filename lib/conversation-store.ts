const STORAGE_KEY = "ai_conversations";
const MAX_CONVERSATIONS = 50;
const TITLE_MAX_LENGTH = 40;
const DEFAULT_TITLE = "New conversation";

export type StoredMessageRole = "user" | "assistant" | "tool";

export interface StoredMessage {
  role: StoredMessageRole;
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

export interface NewMessageInput {
  role: StoredMessageRole;
  content: string;
  timestamp?: number;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (unlikely under Next.js 14+/jsdom).
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function deriveTitleFromContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return DEFAULT_TITLE;
  return trimmed.length > TITLE_MAX_LENGTH
    ? trimmed.slice(0, TITLE_MAX_LENGTH)
    : trimmed;
}

function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): Conversation[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidConversation);
  } catch {
    return [];
  }
}

function writeAll(conversations: Conversation[]): void {
  if (!isStorageAvailable()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function isValidConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Conversation>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.createdAt === "number" &&
    typeof c.updatedAt === "number" &&
    Array.isArray(c.messages)
  );
}

function pruneOldest(conversations: Conversation[]): Conversation[] {
  if (conversations.length <= MAX_CONVERSATIONS) return conversations;
  return [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

export class ConversationStore {
  createConversation(): Conversation {
    const now = Date.now();
    const conversation: Conversation = {
      id: generateId(),
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const all = readAll();
    all.push(conversation);
    writeAll(pruneOldest(all));
    return conversation;
  }

  appendMessage(conversationId: string, message: NewMessageInput): Conversation | null {
    const all = readAll();
    const index = all.findIndex((c) => c.id === conversationId);
    if (index === -1) return null;

    const existing = all[index];
    const stored: StoredMessage = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp ?? Date.now(),
    };
    const messages = [...existing.messages, stored];

    const hadUserMessage = existing.messages.some((m) => m.role === "user");
    const titleNeedsUpdate =
      !hadUserMessage &&
      stored.role === "user" &&
      (existing.title === DEFAULT_TITLE || existing.title.trim() === "");
    const title = titleNeedsUpdate ? deriveTitleFromContent(stored.content) : existing.title;

    const updated: Conversation = {
      ...existing,
      messages,
      title,
      updatedAt: stored.timestamp,
    };
    all[index] = updated;
    writeAll(pruneOldest(all));
    return updated;
  }

  getConversation(id: string): Conversation | null {
    const all = readAll();
    return all.find((c) => c.id === id) ?? null;
  }

  listConversations(): Conversation[] {
    return [...readAll()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteConversation(id: string): boolean {
    const all = readAll();
    const next = all.filter((c) => c.id !== id);
    if (next.length === all.length) return false;
    writeAll(next);
    return true;
  }
}

export const conversationStore = new ConversationStore();
