/**
 * Integration tests for app/settings/page.tsx
 *
 * Strategy
 * --------
 * global.fetch is replaced by jest-fetch-mock (via jest.config.ts setupFiles)
 * so all network calls — GET /api/ai/config, POST /api/ai/config, and
 * POST /api/ai/config/test — are intercepted and controlled per test.
 *
 * We render the page with @testing-library/react and drive interactions
 * through @testing-library/user-event to stay as close to real-user
 * behaviour as possible.
 *
 * URL matching note
 * -----------------
 * The settings page calls fetch with relative paths (e.g. "/api/ai/config").
 * jsdom's URL constructor rejects relative URLs without a base, so we match
 * against the raw url string using .endsWith() instead of parsing it through
 * new URL(), mirroring the approach used in app/products/__tests__/page.test.tsx.
 *
 * Timer note
 * ----------
 * The settings page uses setTimeout to auto-clear transient success/error
 * states.  We use jest.useFakeTimers() so we can advance time
 * deterministically without waiting for real wall-clock delays.
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "jest-fetch-mock";

import SettingsPage from "../page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    status,
    headers: { "Content-Type": "application/json" },
  };
}

/** Safely extract the pathname from a fetch url argument that may be a relative string. */
function getPath(url: unknown): string {
  if (typeof url !== "string") return "";
  // Absolute URL — extract pathname properly
  if (/^https?:\/\//i.test(url)) {
    try { return new URL(url).pathname; } catch { return url; }
  }
  // Relative URL — everything before the query string
  return url.split("?")[0];
}

/**
 * Program fetchMock to handle all requests the settings page may make.
 *
 * Defaults:
 *  - GET  /api/ai/config       → { model: null, hasApiKey: false }
 *  - POST /api/ai/config       → { success: true }
 *  - POST /api/ai/config/test  → { ok: true, model: "gpt-4o" }
 */
function setupFetchMock({
  getConfig = { model: null, hasApiKey: false },
  postConfigStatus = 200,
  postConfigBody = { success: true } as object,
  testStatus = 200,
  testBody = { ok: true, model: "gpt-4o" } as object,
}: {
  getConfig?: { model: string | null; hasApiKey: boolean };
  postConfigStatus?: number;
  postConfigBody?: object;
  testStatus?: number;
  testBody?: object;
} = {}) {
  fetchMock.mockResponse((req) => {
    // Match on URL suffix to avoid issues with relative vs absolute URL
    // parsing in jsdom — mirrors the pattern in products page tests.
    const url = req.url as string;

    if (req.method === "GET" && url.endsWith("/api/ai/config")) {
      return Promise.resolve(jsonResponse(getConfig));
    }

    if (req.method === "POST" && url.endsWith("/api/ai/config/test")) {
      return Promise.resolve(jsonResponse(testBody, testStatus));
    }

    if (req.method === "POST" && url.endsWith("/api/ai/config")) {
      return Promise.resolve(jsonResponse(postConfigBody, postConfigStatus));
    }

    return Promise.reject(new Error(`Unexpected fetch: ${req.method} ${req.url}`));
  });
}

/** Return true if this fetchMock call targets the given method + URL suffix. */
function isCall(
  call: [unknown, unknown?],
  method: string,
  urlSuffix: string,
): boolean {
  const [url, init] = call;
  // When no method is set in the init object, the browser defaults to GET.
  const callMethod =
    (init as RequestInit | undefined)?.method?.toUpperCase() ?? "GET";
  return (
    typeof url === "string" &&
    url.endsWith(urlSuffix) &&
    callMethod === method.toUpperCase()
  );
}

/** Find the first fetchMock call that matches method + URL suffix. */
function findCall(
  method: string,
  urlSuffix: string,
): [unknown, unknown?] | undefined {
  return fetchMock.mock.calls.find((c) =>
    isCall(c as [unknown, unknown?], method, urlSuffix),
  ) as [unknown, unknown?] | undefined;
}

/** Parse the JSON body of a fetchMock call. */
function parseCallBody(call: [unknown, unknown?]): unknown {
  return JSON.parse((call[1] as RequestInit).body as string);
}

/** Render the page and wait for the initial GET /api/ai/config to fire. */
async function renderAndWait() {
  const utils = render(<SettingsPage />);
  // Wait until at least one GET /api/ai/config call has been made (the on-mount effect).
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some((c) => isCall(c as [unknown, unknown?], "GET", "/api/ai/config")),
    ).toBe(true);
  });
  return utils;
}

// ---------------------------------------------------------------------------
// Global mock hygiene
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.enableMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ===========================================================================
// 1. Page structure
// ===========================================================================

describe("page structure", () => {
  it('renders the "Settings" page heading', async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByRole("heading", { name: /settings/i, level: 1 })).toBeInTheDocument();
  });

  it("renders the OpenAI configuration section", async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByText(/openai configuration/i)).toBeInTheDocument();
  });

  it("renders the API key input", async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByLabelText(/openai api key/i)).toBeInTheDocument();
  });

  it("renders the model selector", async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
  });

  it('renders the "Save" button', async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it('renders the "Test token" button', async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByRole("button", { name: /test token/i })).toBeInTheDocument();
  });

  it("renders the System Information panel", async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByText(/system/i)).toBeInTheDocument();
    expect(screen.getByText("merchant-frontend")).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. Model selector options
// ===========================================================================

describe("model selector options", () => {
  it("lists gpt-4o as an option", async () => {
    setupFetchMock();
    await renderAndWait();
    const select = screen.getByLabelText(/model/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("gpt-4o");
  });

  it("lists gpt-4-turbo as an option", async () => {
    setupFetchMock();
    await renderAndWait();
    const select = screen.getByLabelText(/model/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("gpt-4-turbo");
  });

  it("lists gpt-3.5-turbo as an option", async () => {
    setupFetchMock();
    await renderAndWait();
    const select = screen.getByLabelText(/model/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("gpt-3.5-turbo");
  });

  it("has at least three model options", async () => {
    setupFetchMock();
    await renderAndWait();
    const select = screen.getByLabelText(/model/i) as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// 3. Pre-populating from the stored config
// ===========================================================================

describe("pre-populating from stored config", () => {
  it("selects the stored model in the dropdown when one is saved", async () => {
    setupFetchMock({ getConfig: { model: "gpt-3.5-turbo", hasApiKey: true } });
    await renderAndWait();
    await waitFor(() => {
      const select = screen.getByLabelText(/model/i) as HTMLSelectElement;
      expect(select.value).toBe("gpt-3.5-turbo");
    });
  });

  it("shows the masked key badge when a key is stored", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument();
    });
  });

  it("does not show the masked key badge when no key is stored", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    await renderAndWait();
    expect(screen.queryByLabelText(/key saved/i)).not.toBeInTheDocument();
  });

  it("shows the masked placeholder text when a key is stored", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    await renderAndWait();
    await waitFor(() => {
      const input = screen.getByLabelText(/openai api key/i) as HTMLInputElement;
      expect(input.placeholder).toMatch(/sk-••••••••/);
    });
  });
});

// ===========================================================================
// 4. Save button state
// ===========================================================================

describe("Save button disabled state", () => {
  it("is disabled when no key is stored and the input is empty", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    await renderAndWait();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("is enabled when a key is stored (even with an empty input)", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    await renderAndWait();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
    });
  });

  it("becomes enabled when the user types a key into the input", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-new-key");

    expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });
});

// ===========================================================================
// 5. Successful Save flow
// ===========================================================================

describe("successful Save flow", () => {
  it("calls POST /api/ai/config when Save is clicked", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-test-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(findCall("POST", "/api/ai/config")).toBeDefined();
    });
  });

  it("includes the apiKey in the POST body when typed", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-my-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = findCall("POST", "/api/ai/config");
      expect(call).toBeDefined();
      const body = parseCallBody(call!);
      expect((body as Record<string, unknown>).apiKey).toBe("sk-my-key");
    });
  });

  it("includes the selected model in the POST body", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.selectOptions(screen.getByLabelText(/model/i), "gpt-3.5-turbo");
    await user.type(screen.getByLabelText(/openai api key/i), "sk-my-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = findCall("POST", "/api/ai/config");
      expect(call).toBeDefined();
      const body = parseCallBody(call!);
      expect((body as Record<string, unknown>).model).toBe("gpt-3.5-turbo");
    });
  });

  it("shows a success message after saving", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-my-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText(/configuration saved successfully/i)).toBeInTheDocument(),
    );
  });

  it("clears the API key input after a successful save", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-my-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const input = screen.getByLabelText(/openai api key/i) as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  it("shows the saved-key badge after a successful save", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-my-key");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );
  });

  it("omits apiKey from POST body when a key is stored and no new key is typed", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    // Wait for stored config to be applied (Save becomes enabled)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const call = findCall("POST", "/api/ai/config");
      expect(call).toBeDefined();
      const body = parseCallBody(call!);
      expect(body as Record<string, unknown>).not.toHaveProperty("apiKey");
    });
  });
});

// ===========================================================================
// 6. Failed Save flow
// ===========================================================================

describe("failed Save flow", () => {
  it("shows an error message when POST /api/ai/config returns an error", async () => {
    setupFetchMock({
      getConfig: { model: null, hasApiKey: false },
      postConfigStatus: 400,
      postConfigBody: { error: "apiKey is required." },
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-bad");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText(/apiKey is required\./i)).toBeInTheDocument(),
    );
  });

  it("does not show the success message on save failure", async () => {
    setupFetchMock({
      getConfig: { model: null, hasApiKey: false },
      postConfigStatus: 500,
      postConfigBody: { error: "Internal server error" },
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-bad");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.queryByText(/configuration saved successfully/i)).not.toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 7. Test Token flow — success
// ===========================================================================

describe("Test Token — success", () => {
  it("calls POST /api/ai/config/test when the Test token button is clicked", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    // Wait for the stored-key badge to appear (confirms GET resolved and
    // hasStoredKey state has been applied) before clicking.
    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() => {
      expect(findCall("POST", "/api/ai/config/test")).toBeDefined();
    });
  });

  it("includes the model in the test request body", async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() => {
      const call = findCall("POST", "/api/ai/config/test");
      expect(call).toBeDefined();
      const body = parseCallBody(call!);
      expect((body as Record<string, unknown>).model).toBe("gpt-4o");
    });
  });

  it("includes a typed API key in the test request body", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.type(screen.getByLabelText(/openai api key/i), "sk-typed");
    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() => {
      const call = findCall("POST", "/api/ai/config/test");
      expect(call).toBeDefined();
      const body = parseCallBody(call!);
      expect((body as Record<string, unknown>).apiKey).toBe("sk-typed");
    });
  });

  it("shows the success status message with the model name after a successful test", async () => {
    setupFetchMock({
      getConfig: { model: "gpt-4o", hasApiKey: true },
      testBody: { ok: true, model: "gpt-4o" },
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/token is valid — model: gpt-4o/i),
      ).toBeInTheDocument(),
    );
  });

  it('shows "✓ Token OK" on the button after a successful test', async () => {
    setupFetchMock({ getConfig: { model: "gpt-4o", hasApiKey: true } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /✓ token ok/i })).toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 8. Test Token flow — error
// ===========================================================================

describe("Test Token — error", () => {
  it("shows an error message when the test endpoint returns an error", async () => {
    setupFetchMock({
      getConfig: { model: "gpt-4o", hasApiKey: true },
      testStatus: 401,
      testBody: { error: "Incorrect API key provided." },
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/incorrect api key provided/i),
      ).toBeInTheDocument(),
    );
  });

  it('shows "✕ Test failed" on the button after a failed test', async () => {
    setupFetchMock({
      getConfig: { model: "gpt-4o", hasApiKey: true },
      testStatus: 401,
      testBody: { error: "Bad key." },
    });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /✕ test failed/i })).toBeInTheDocument(),
    );
  });

  it("shows a client-side error when no key is available and input is empty", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/enter an api key before testing/i),
      ).toBeInTheDocument(),
    );
  });

  it("does NOT call POST /api/ai/config/test when no key is available", async () => {
    setupFetchMock({ getConfig: { model: null, hasApiKey: false } });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(screen.getByText(/enter an api key before testing/i)).toBeInTheDocument(),
    );

    expect(findCall("POST", "/api/ai/config/test")).toBeUndefined();
  });
});

// ===========================================================================
// 9. Loading / busy states
// ===========================================================================

describe("loading and busy states", () => {
  it('shows "Saving…" on the Save button while saving', async () => {
    // Program: GET resolves immediately, POST stays pending indefinitely
    fetchMock.mockResponse((req) => {
      const path = getPath(req.url);
      if (req.method === "GET" && path === "/api/ai/config") {
        return Promise.resolve(jsonResponse({ model: null, hasApiKey: false }));
      }
      // Keep in-flight to observe the loading state
      return new Promise(() => {});
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) =>
          isCall(c as [unknown, unknown?], "GET", "/api/ai/config"),
        ),
      ).toBe(true);
    });

    await user.type(screen.getByLabelText(/openai api key/i), "sk-test");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /saving…/i })).toBeInTheDocument(),
    );
  });

  it('shows "Testing…" on the Test token button while testing', async () => {
    fetchMock.mockResponse((req) => {
      const url = req.url as string;
      if (req.method === "GET" && url.endsWith("/api/ai/config")) {
        return Promise.resolve(jsonResponse({ model: "gpt-4o", hasApiKey: true }));
      }
      // Hold test endpoint call in-flight indefinitely to observe loading state
      return new Promise(() => {});
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    // Wait for GET to resolve and apply hasStoredKey
    await waitFor(() =>
      expect(screen.getByLabelText(/key saved/i)).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /test token/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /testing…/i })).toBeInTheDocument(),
    );
  });

  it("disables both buttons while a save is in progress", async () => {
    fetchMock.mockResponse((req) => {
      const path = getPath(req.url);
      if (req.method === "GET" && path === "/api/ai/config") {
        return Promise.resolve(jsonResponse({ model: null, hasApiKey: false }));
      }
      return new Promise(() => {});
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) =>
          isCall(c as [unknown, unknown?], "GET", "/api/ai/config"),
        ),
      ).toBe(true);
    });

    await user.type(screen.getByLabelText(/openai api key/i), "sk-test");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /saving…/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /test token/i })).toBeDisabled();
    });
  });
});

// ===========================================================================
// 10. System Information panel
// ===========================================================================

describe("System Information panel", () => {
  it("renders the Catalog API URL", async () => {
    setupFetchMock();
    await renderAndWait();
    // The env var is not set in test environment — falls back to localhost
    expect(screen.getByText(/localhost:8001/i)).toBeInTheDocument();
  });

  it("renders the Checkout API URL", async () => {
    setupFetchMock();
    await renderAndWait();
    expect(screen.getByText(/localhost:8002/i)).toBeInTheDocument();
  });

  it('shows "local" as the environment label when NEXT_PUBLIC_ENV is not set', async () => {
    setupFetchMock();
    await renderAndWait();

    const dt = screen.getByText("Environment");
    const dl = dt.closest("dl");
    expect(dl).not.toBeNull();
    expect(within(dl!).getByText("local")).toBeInTheDocument();
  });

  it("uses NEXT_PUBLIC_ENV (not a hardcoded string) for the environment label", () => {
    // Validate the source code so we know the env var path is wired correctly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../page.tsx"),
      "utf-8",
    );
    // The page must reference the env var
    expect(src).toContain("NEXT_PUBLIC_ENV");
    // It must NOT use a raw bare-string <dd>local</dd> tag
    expect(src).not.toMatch(/<dd>local<\/dd>/);
  });
});
