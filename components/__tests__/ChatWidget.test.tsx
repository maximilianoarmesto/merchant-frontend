/**
 * Component tests for components/ChatWidget.tsx
 *
 * Strategy
 * --------
 * global.fetch is replaced by jest-fetch-mock (configured in jest.config.ts
 * setupFiles), so all POST /api/ai/chat calls are intercepted and controlled
 * per test.  No real network traffic occurs.
 *
 * We render the widget with @testing-library/react and drive interactions
 * through @testing-library/user-event, staying as close to real-user
 * behaviour as possible.
 *
 * Mock pattern
 * ------------
 * We use `fetchMock.mockResponse(fn)` with a URL-dispatching handler (matching
 * the pattern used across the rest of the test suite — see products page tests)
 * rather than `mockResponseOnce`, so the mock is reliably installed before the
 * component renders and is not accidentally consumed by stray requests.
 *
 * Coverage
 * --------
 * 1.  Collapsed by default — FAB visible, panel hidden
 * 2.  Expand / collapse toggle via FAB
 * 3.  Expand / collapse toggle via panel close button (✕)
 * 4.  aria-expanded state on the FAB
 * 5.  Send message — happy path (mocked API, reply appears)
 * 6.  Send message — Enter key triggers send
 * 7.  Send button disabled when input is empty or whitespace
 * 8.  Send button and input disabled while loading (in-flight request)
 * 9.  Typing indicator visible while loading
 * 10. Typing indicator hidden once response arrives
 * 11. `no_config` error state — human-readable message shown
 * 12. Generic API error shown as assistant message
 * 13. Network failure handled gracefully
 * 14. Input cleared after send
 * 15. Empty state hint shown when no messages
 * 16. User and assistant bubbles use distinct CSS classes
 * 17. Multiple messages accumulate in order
 * 18. data-testid attributes present for key elements
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "jest-fetch-mock";

import ChatWidget from "../ChatWidget";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MockResponseBody = { body: string; status: number; headers: Record<string, string> };

// ---------------------------------------------------------------------------
// Helpers — response factories
// ---------------------------------------------------------------------------

/** Successful chat reply response object. */
function chatOkBody(reply: string): MockResponseBody {
  return {
    body: JSON.stringify({ reply }),
    status: 200,
    headers: { "Content-Type": "application/json" },
  };
}

/** Error chat response object. */
function chatErrBody(error: string, status = 400): MockResponseBody {
  return {
    body: JSON.stringify({ error }),
    status,
    headers: { "Content-Type": "application/json" },
  };
}

// ---------------------------------------------------------------------------
// Helpers — mock installation
// ---------------------------------------------------------------------------

/**
 * Install a fetch mock that responds to POST /api/ai/chat with the given static
 * response.  Uses the handler form of `mockResponse` (matching the pattern in
 * `app/products/__tests__/page.test.tsx`) so the mock is matched by URL rather
 * than consumed blindly in call order.
 */
function mockChatOk(reply: string): void {
  const resp = chatOkBody(reply);
  fetchMock.mockResponse((req) => {
    if (req.method === "POST" && req.url.endsWith("/api/ai/chat")) {
      return Promise.resolve(resp);
    }
    return Promise.reject(new Error(`Unexpected: ${req.method} ${req.url}`));
  });
}

/** Install a fetch mock that returns an error JSON body for the chat endpoint. */
function mockChatErr(error: string, status = 400): void {
  const resp = chatErrBody(error, status);
  fetchMock.mockResponse((req) => {
    if (req.method === "POST" && req.url.endsWith("/api/ai/chat")) {
      return Promise.resolve(resp);
    }
    return Promise.reject(new Error(`Unexpected: ${req.method} ${req.url}`));
  });
}

/**
 * Install a fetch mock that keeps the chat request pending indefinitely.
 * Use this to observe in-flight / loading UI states.
 */
function mockChatPending(): void {
  fetchMock.mockResponse((req) => {
    if (req.method === "POST" && req.url.endsWith("/api/ai/chat")) {
      return new Promise(() => {}); // never resolves
    }
    return Promise.reject(new Error(`Unexpected: ${req.method} ${req.url}`));
  });
}

/**
 * Install a fetch mock that rejects the chat request — models a network-level
 * failure where no HTTP response is received at all.
 */
function mockChatNetworkError(): void {
  fetchMock.mockResponse((req) => {
    if (req.method === "POST" && req.url.endsWith("/api/ai/chat")) {
      return Promise.reject(new Error("Network failure"));
    }
    return Promise.reject(new Error(`Unexpected: ${req.method} ${req.url}`));
  });
}

// ---------------------------------------------------------------------------
// Helpers — render & interaction shortcuts
// ---------------------------------------------------------------------------

/** Render the widget and return user-event + utils. */
function setup() {
  const user = userEvent.setup();
  const utils = render(<ChatWidget />);
  return { user, ...utils };
}

/** Click the FAB and wait until the panel is visible. */
async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("chat-toggle"));
  await waitFor(() =>
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument(),
  );
}

// ---------------------------------------------------------------------------
// Global mock hygiene
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.enableMocks();
});

// ===========================================================================
// 1. Collapsed by default
// ===========================================================================

describe("collapsed by default", () => {
  it("renders the FAB button on initial mount", () => {
    setup();
    expect(screen.getByTestId("chat-toggle")).toBeInTheDocument();
  });

  it("does NOT render the chat panel on initial mount", () => {
    setup();
    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("does NOT render the message log on initial mount", () => {
    setup();
    expect(screen.queryByTestId("chat-messages")).not.toBeInTheDocument();
  });

  it("FAB has aria-expanded=false when collapsed", () => {
    setup();
    expect(screen.getByTestId("chat-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("FAB has aria-label 'Open AI assistant' when collapsed", () => {
    setup();
    expect(screen.getByTestId("chat-toggle")).toHaveAccessibleName(
      /open ai assistant/i,
    );
  });
});

// ===========================================================================
// 2. Expand via FAB click
// ===========================================================================

describe("expand via FAB click", () => {
  it("shows the chat panel after clicking the FAB", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("shows the message log after expanding", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-messages")).toBeInTheDocument();
  });

  it("shows the input row after expanding", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-input-row")).toBeInTheDocument();
  });

  it("sets aria-expanded=true on the FAB when expanded", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("FAB has aria-label 'Close AI assistant' when expanded", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-toggle")).toHaveAccessibleName(
      /close ai assistant/i,
    );
  });
});

// ===========================================================================
// 3. Collapse via FAB click (toggle)
// ===========================================================================

describe("collapse via second FAB click", () => {
  it("hides the chat panel after a second FAB click", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle")); // open
    await user.click(screen.getByTestId("chat-toggle")); // close

    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("restores aria-expanded=false after collapsing", async () => {
    const { user } = setup();

    await user.click(screen.getByTestId("chat-toggle"));
    await user.click(screen.getByTestId("chat-toggle"));

    expect(screen.getByTestId("chat-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

// ===========================================================================
// 4. Collapse via panel close button (✕)
// ===========================================================================

describe("collapse via close button inside panel", () => {
  it("hides the panel when the ✕ close button is clicked", async () => {
    const { user } = setup();

    await openPanel(user);

    await user.click(screen.getByTestId("chat-close"));

    expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
  });

  it("restores FAB to collapsed state after close button click", async () => {
    const { user } = setup();

    await openPanel(user);
    await user.click(screen.getByTestId("chat-close"));

    expect(screen.getByTestId("chat-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

// ===========================================================================
// 5. Empty state hint
// ===========================================================================

describe("empty state hint", () => {
  it("shows a hint message when the panel is open and has no messages", async () => {
    const { user } = setup();

    await openPanel(user);

    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();
  });

  it("hint text mentions the store / products / orders", async () => {
    const { user } = setup();

    await openPanel(user);

    expect(screen.getByTestId("chat-empty")).toHaveTextContent(
      /store|product|order/i,
    );
  });
});

// ===========================================================================
// 6. Send button disabled when input is empty or whitespace
// ===========================================================================

describe("send button disabled state", () => {
  it("is disabled when the input is empty", async () => {
    const { user } = setup();

    await openPanel(user);

    expect(screen.getByTestId("chat-send")).toBeDisabled();
  });

  it("is disabled when the input contains only whitespace", async () => {
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "   ");

    expect(screen.getByTestId("chat-send")).toBeDisabled();
  });

  it("is enabled once the user types a non-whitespace character", async () => {
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello");

    expect(screen.getByTestId("chat-send")).not.toBeDisabled();
  });
});

// ===========================================================================
// 7. Successful message send
// ===========================================================================

describe("successful message send flow", () => {
  it("adds the user message to the conversation immediately", async () => {
    mockChatOk("Hello back!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello!");
    await user.click(screen.getByTestId("chat-send"));

    // User bubble appears immediately after the send (before the response)
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("clears the input after sending", async () => {
    mockChatOk("Hi there!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello!");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(
        (screen.getByTestId("chat-input") as HTMLInputElement).value,
      ).toBe(""),
    );
  });

  it("shows the assistant reply in the conversation", async () => {
    mockChatOk("I can help with that!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Help me");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByText("I can help with that!")).toBeInTheDocument(),
    );
  });

  it("calls POST /api/ai/chat with the correct message payload", async () => {
    mockChatOk("Got it!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "What is in stock?");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByText("Got it!")).toBeInTheDocument(),
    );

    const calls = fetchMock.mock.calls;
    const chatCall = calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/api/ai/chat"),
    );
    expect(chatCall).toBeDefined();
    const body = JSON.parse((chatCall![1] as RequestInit).body as string);
    expect(body).toEqual({ message: "What is in stock?" });
  });

  it("uses POST method for the chat request", async () => {
    mockChatOk("Sure!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hi");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() => expect(screen.getByText("Sure!")).toBeInTheDocument());

    const chatCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === "string" && url.endsWith("/api/ai/chat"),
    );
    expect((chatCall![1] as RequestInit).method?.toUpperCase()).toBe("POST");
  });
});

// ===========================================================================
// 8. Send via Enter key
// ===========================================================================

describe("send via Enter key", () => {
  it("sends the message when Enter is pressed in the input", async () => {
    mockChatOk("Enter works!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello via Enter");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByText("Enter works!")).toBeInTheDocument(),
    );
  });

  it("clears the input after sending via Enter", async () => {
    mockChatOk("OK");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "test");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        (screen.getByTestId("chat-input") as HTMLInputElement).value,
      ).toBe(""),
    );
  });
});

// ===========================================================================
// 9. Loading / busy state while request is in flight
// ===========================================================================

describe("loading state while request is in flight", () => {
  it("shows the typing indicator while the request is pending", async () => {
    mockChatPending();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Loading test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-typing")).toBeInTheDocument(),
    );
  });

  it("disables the input while loading", async () => {
    mockChatPending();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Loading test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).toBeDisabled(),
    );
  });

  it("disables the send button while loading", async () => {
    mockChatPending();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Loading test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-send")).toBeDisabled(),
    );
  });

  it("typing indicator has accessible label containing 'typing'", async () => {
    mockChatPending();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-typing")).toBeInTheDocument(),
    );

    const typingEl = screen.getByTestId("chat-typing");
    const label = typingEl.getAttribute("aria-label") ?? "";
    expect(label.toLowerCase()).toContain("typing");
  });
});

// ===========================================================================
// 10. Typing indicator hidden after response
// ===========================================================================

describe("typing indicator hidden after response", () => {
  it("hides the typing indicator once the response arrives", async () => {
    mockChatOk("Done!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Quick question");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-typing")).not.toBeInTheDocument(),
    );
  });

  it("re-enables the input once the response arrives", async () => {
    mockChatOk("Done!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Quick question");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).not.toBeDisabled(),
    );
  });
});

// ===========================================================================
// 11. `no_config` error state
// ===========================================================================

describe("no_config error state", () => {
  it("shows a human-readable message when the API returns no_config", async () => {
    mockChatErr("no_config", 400);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() => {
      const assistantBubbles = screen
        .getAllByTestId("chat-bubble-assistant")
        .map((el) => el.textContent ?? "");
      // The message must reference Settings so the user knows where to go
      expect(assistantBubbles.some((t) => /settings/i.test(t))).toBe(true);
    });
  });

  it("no_config message is shown as an assistant bubble, not the raw error code", async () => {
    mockChatErr("no_config", 400);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hi");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() => {
      const assistantBubbles = screen
        .getAllByTestId("chat-bubble-assistant")
        .map((el) => el.textContent ?? "");
      // The displayed text must NOT be the bare error code "no_config"
      expect(
        assistantBubbles.some((t) => t.toLowerCase() === "no_config"),
      ).toBe(false);
    });
  });

  it("no_config message mentions Settings so the user knows where to go", async () => {
    mockChatErr("no_config", 400);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hi");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() => {
      const assistantBubbles = screen
        .getAllByTestId("chat-bubble-assistant")
        .map((el) => el.textContent ?? "");
      expect(assistantBubbles.some((t) => /settings/i.test(t))).toBe(true);
    });
  });

  it("hides the typing indicator after no_config error", async () => {
    mockChatErr("no_config", 400);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hi");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-typing")).not.toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 12. Generic API error
// ===========================================================================

describe("generic API error", () => {
  it("shows the error text as an assistant bubble", async () => {
    mockChatErr("OpenAI returned an error.", 502);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Error test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(
        screen.getByText("OpenAI returned an error."),
      ).toBeInTheDocument(),
    );
  });

  it("re-enables the input after a generic API error", async () => {
    mockChatErr("Something went wrong.", 502);
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Error test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).not.toBeDisabled(),
    );
  });
});

// ===========================================================================
// 13. Network failure
// ===========================================================================

describe("network failure", () => {
  it("shows a network error message as an assistant bubble", async () => {
    mockChatNetworkError();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByText(/network error/i)).toBeInTheDocument(),
    );
  });

  it("re-enables the input after a network failure", async () => {
    mockChatNetworkError();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-input")).not.toBeDisabled(),
    );
  });

  it("hides the typing indicator after a network failure", async () => {
    mockChatNetworkError();
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Test");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-typing")).not.toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 14. Message bubble CSS classes
// ===========================================================================

describe("message bubble CSS classes", () => {
  it("user message has the --user modifier class", async () => {
    mockChatOk("Hi!");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "My message");
    await user.click(screen.getByTestId("chat-send"));

    // User bubble appears immediately (synchronously) after the send click
    const userBubble = screen.getByTestId("chat-bubble-user");
    expect(userBubble).toHaveClass("chat-bubble--user");
  });

  it("assistant reply has the --assistant modifier class", async () => {
    mockChatOk("My reply");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Hello");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByTestId("chat-bubble-assistant")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("chat-bubble-assistant")).toHaveClass(
      "chat-bubble--assistant",
    );
  });
});

// ===========================================================================
// 15. Multiple messages accumulate in order
// ===========================================================================

describe("multiple messages accumulate correctly", () => {
  it("shows both user and assistant messages in order after a single exchange", async () => {
    mockChatOk("Answer 1");
    const { user } = setup();

    await openPanel(user);
    await user.type(screen.getByTestId("chat-input"), "Question 1");
    await user.click(screen.getByTestId("chat-send"));

    await waitFor(() =>
      expect(screen.getByText("Answer 1")).toBeInTheDocument(),
    );

    const messages = screen.getByTestId("chat-messages");
    const allBubbles = within(messages).getAllByText(/question 1|answer 1/i);
    expect(allBubbles).toHaveLength(2);
  });

  it("accumulates two exchanges correctly", async () => {
    // Use a counter-based handler so each call can return a different response
    let callCount = 0;
    const replies = ["Reply A", "Reply B"];
    fetchMock.mockResponse((req) => {
      if (req.method === "POST" && req.url.endsWith("/api/ai/chat")) {
        const reply = replies[callCount++] ?? "Extra reply";
        return Promise.resolve({
          body: JSON.stringify({ reply }),
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return Promise.reject(new Error(`Unexpected: ${req.method} ${req.url}`));
    });

    const { user } = setup();

    await openPanel(user);

    // First exchange
    await user.type(screen.getByTestId("chat-input"), "Message A");
    await user.click(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByText("Reply A")).toBeInTheDocument());

    // Second exchange
    await user.type(screen.getByTestId("chat-input"), "Message B");
    await user.click(screen.getByTestId("chat-send"));
    await waitFor(() => expect(screen.getByText("Reply B")).toBeInTheDocument());

    // All four messages must be present
    expect(screen.getByText("Message A")).toBeInTheDocument();
    expect(screen.getByText("Reply A")).toBeInTheDocument();
    expect(screen.getByText("Message B")).toBeInTheDocument();
    expect(screen.getByText("Reply B")).toBeInTheDocument();
  });

  it("empty state hint disappears after the first message is sent", async () => {
    mockChatOk("Hello!");
    const { user } = setup();

    await openPanel(user);
    expect(screen.getByTestId("chat-empty")).toBeInTheDocument();

    await user.type(screen.getByTestId("chat-input"), "Hi");
    await user.click(screen.getByTestId("chat-send"));

    // Hint disappears as soon as the user message is added (before response)
    await waitFor(() =>
      expect(screen.queryByTestId("chat-empty")).not.toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 16. data-testid attributes
// ===========================================================================

describe("data-testid attributes", () => {
  it("outer wrapper has data-testid=chat-widget", () => {
    setup();
    expect(screen.getByTestId("chat-widget")).toBeInTheDocument();
  });

  it("FAB has data-testid=chat-toggle", () => {
    setup();
    expect(screen.getByTestId("chat-toggle")).toBeInTheDocument();
  });

  it("chat panel has data-testid=chat-panel when open", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("message log has data-testid=chat-messages when open", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-messages")).toBeInTheDocument();
  });

  it("text input has data-testid=chat-input when open", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
  });

  it("send button has data-testid=chat-send when open", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-send")).toBeInTheDocument();
  });

  it("close button has data-testid=chat-close when open", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-close")).toBeInTheDocument();
  });
});

// ===========================================================================
// 17. Panel accessibility attributes
// ===========================================================================

describe("panel accessibility", () => {
  it("chat panel has role=dialog", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("role", "dialog");
  });

  it("message log has role=log", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-messages")).toHaveAttribute("role", "log");
  });

  it("message log has aria-live=polite", async () => {
    const { user } = setup();
    await openPanel(user);
    expect(screen.getByTestId("chat-messages")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("text input has an accessible label", async () => {
    const { user } = setup();
    await openPanel(user);
    // The input has aria-label="Message input"
    expect(screen.getByLabelText(/message input/i)).toBeInTheDocument();
  });
});
