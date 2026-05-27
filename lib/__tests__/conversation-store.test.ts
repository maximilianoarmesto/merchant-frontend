import {
  ConversationStore,
  Conversation,
  StoredMessage,
} from "../conversation-store";

const STORAGE_KEY = "ai_conversations";

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

// AC-1: ConversationStore exposes the full method surface and they work end-to-end
describe("ConversationStore method surface (ac-1)", () => {
  it("supports createConversation, appendMessage, getConversation, listConversations, deleteConversation", () => {
    const store = new ConversationStore();
    expect(typeof store.createConversation).toBe("function");
    expect(typeof store.appendMessage).toBe("function");
    expect(typeof store.getConversation).toBe("function");
    expect(typeof store.listConversations).toBe("function");
    expect(typeof store.deleteConversation).toBe("function");
  });

  it("createConversation returns a Conversation persisted to storage", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    expect(conv.id).toBeTruthy();
    expect(conv.messages).toEqual([]);
    const fetched = store.getConversation(conv.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(conv.id);
  });

  it("appendMessage adds a message and getConversation reflects it", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, { role: "user", content: "hi" });
    const fetched = store.getConversation(conv.id);
    expect(fetched!.messages).toHaveLength(1);
    expect(fetched!.messages[0].content).toBe("hi");
  });

  it("listConversations returns every created conversation", () => {
    const store = new ConversationStore();
    const a = store.createConversation();
    const b = store.createConversation();
    const c = store.createConversation();
    const ids = store.listConversations().map((conv) => conv.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(ids).toHaveLength(3);
  });

  it("deleteConversation removes it from storage", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const removed = store.deleteConversation(conv.id);
    expect(removed).toBe(true);
    expect(store.getConversation(conv.id)).toBeNull();
    expect(store.listConversations()).toHaveLength(0);
  });

  it("appendMessage returns null when the conversation does not exist", () => {
    const store = new ConversationStore();
    const result = store.appendMessage("does-not-exist", {
      role: "user",
      content: "x",
    });
    expect(result).toBeNull();
  });
});

// AC-2: UUID + default title from first user message truncated to 40 chars
describe("createConversation UUID and default title (ac-2)", () => {
  it("generates a non-empty id and gives the conversation a default title", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    expect(typeof conv.id).toBe("string");
    expect(conv.id.length).toBeGreaterThan(0);
    expect(typeof conv.title).toBe("string");
    expect(conv.title.length).toBeGreaterThan(0);
  });

  it("each new conversation gets a unique id", () => {
    const store = new ConversationStore();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(store.createConversation().id);
    }
    expect(ids.size).toBe(20);
  });

  it("title is set from the first user message", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, { role: "user", content: "Hello there, friend!" });
    const fetched = store.getConversation(conv.id);
    expect(fetched!.title).toBe("Hello there, friend!");
  });

  it("title from the first user message is truncated to 40 chars", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const long =
      "This is a really quite long opening question that goes on and on past the limit";
    store.appendMessage(conv.id, { role: "user", content: long });
    const fetched = store.getConversation(conv.id);
    expect(fetched!.title.length).toBeLessThanOrEqual(40);
    expect(long.startsWith(fetched!.title)).toBe(true);
  });

  it("non-user messages before the first user message do not set the title", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const initialTitle = conv.title;
    store.appendMessage(conv.id, { role: "assistant", content: "How can I help?" });
    expect(store.getConversation(conv.id)!.title).toBe(initialTitle);
  });

  it("subsequent user messages do not overwrite the title", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, { role: "user", content: "First question" });
    store.appendMessage(conv.id, { role: "user", content: "A totally different topic" });
    expect(store.getConversation(conv.id)!.title).toBe("First question");
  });
});

// AC-3: Conversations persist across page refreshes (simulated via fresh store instance)
describe("persistence across refresh (ac-3)", () => {
  it("conversations created by one store instance are visible from a fresh instance", () => {
    const writer = new ConversationStore();
    const conv = writer.createConversation();
    writer.appendMessage(conv.id, { role: "user", content: "remember me" });

    // Simulate a page refresh: localStorage survives, the store object does not.
    const reader = new ConversationStore();
    const fetched = reader.getConversation(conv.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.messages).toHaveLength(1);
    expect(fetched!.messages[0].content).toBe("remember me");
  });

  it("the raw localStorage entry under 'ai_conversations' contains the data", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, { role: "user", content: "persisted" });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Conversation[];
    expect(parsed.find((c) => c.id === conv.id)).toBeTruthy();
  });

  it("deletes are also persisted across instances", () => {
    const writer = new ConversationStore();
    const conv = writer.createConversation();
    writer.deleteConversation(conv.id);
    const reader = new ConversationStore();
    expect(reader.getConversation(conv.id)).toBeNull();
  });
});

// AC-4: Maximum of 50 stored conversations; oldest pruned
describe("50-conversation cap (ac-4)", () => {
  it("stores up to 50 conversations exactly", () => {
    const store = new ConversationStore();
    for (let i = 0; i < 50; i++) {
      store.createConversation();
    }
    expect(store.listConversations()).toHaveLength(50);
  });

  it("prunes the oldest (by updatedAt) when the cap is exceeded", () => {
    const store = new ConversationStore();
    let now = 1_000_000;
    const dateSpy = jest.spyOn(Date, "now");
    const created: Conversation[] = [];
    for (let i = 0; i < 51; i++) {
      dateSpy.mockReturnValue(now);
      created.push(store.createConversation());
      now += 1000;
    }
    dateSpy.mockRestore();
    const list = store.listConversations();
    expect(list).toHaveLength(50);
    // The very first conversation (oldest updatedAt) must have been pruned.
    expect(list.find((c) => c.id === created[0].id)).toBeUndefined();
    // The most recently created conversation is retained.
    expect(list.find((c) => c.id === created[50].id)).toBeDefined();
  });

  it("touching a conversation via appendMessage protects it from being pruned", () => {
    const store = new ConversationStore();
    let now = 2_000_000;
    const dateSpy = jest.spyOn(Date, "now");

    dateSpy.mockReturnValue(now);
    const protectedConv = store.createConversation();
    now += 1000;

    // Fill up to 50 newer conversations
    for (let i = 0; i < 49; i++) {
      dateSpy.mockReturnValue(now);
      store.createConversation();
      now += 1000;
    }
    // Touch the protected one so it becomes the most recently updated.
    dateSpy.mockReturnValue(now);
    store.appendMessage(protectedConv.id, { role: "user", content: "still here" });
    now += 1000;

    // Now add another conversation that should push the cap to 51 -> prune to 50.
    dateSpy.mockReturnValue(now);
    store.createConversation();
    dateSpy.mockRestore();

    const list = store.listConversations();
    expect(list).toHaveLength(50);
    expect(list.find((c) => c.id === protectedConv.id)).toBeDefined();
  });
});

// AC-5: Every stored message has role, content and timestamp
describe("stored messages shape (ac-5)", () => {
  it("appendMessage stamps timestamp when not provided", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const before = Date.now();
    store.appendMessage(conv.id, { role: "user", content: "auto-stamped" });
    const after = Date.now();
    const msg = store.getConversation(conv.id)!.messages[0];
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("auto-stamped");
    expect(typeof msg.timestamp).toBe("number");
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it("appendMessage honors an explicit timestamp when provided", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    store.appendMessage(conv.id, {
      role: "assistant",
      content: "fixed time",
      timestamp: 1_750_000_000_000,
    });
    const msg = store.getConversation(conv.id)!.messages[0];
    expect(msg.timestamp).toBe(1_750_000_000_000);
  });

  it("every stored message across roles carries role, content, and timestamp", () => {
    const store = new ConversationStore();
    const conv = store.createConversation();
    const inputs: { role: StoredMessage["role"]; content: string }[] = [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "tool", content: "t1" },
      { role: "user", content: "u2" },
    ];
    inputs.forEach((m) => store.appendMessage(conv.id, m));
    const fetched = store.getConversation(conv.id)!;
    fetched.messages.forEach((m) => {
      expect(m.role).toMatch(/^(user|assistant|tool)$/);
      expect(typeof m.content).toBe("string");
      expect(typeof m.timestamp).toBe("number");
    });
    expect(fetched.messages).toHaveLength(inputs.length);
  });

  it("messages survive a refresh with role, content and timestamp intact", () => {
    const writer = new ConversationStore();
    const conv = writer.createConversation();
    writer.appendMessage(conv.id, {
      role: "tool",
      content: '{"ok":true}',
      timestamp: 1_700_000_000_000,
    });
    const reader = new ConversationStore();
    const msg = reader.getConversation(conv.id)!.messages[0];
    expect(msg.role).toBe("tool");
    expect(msg.content).toBe('{"ok":true}');
    expect(msg.timestamp).toBe(1_700_000_000_000);
  });
});
