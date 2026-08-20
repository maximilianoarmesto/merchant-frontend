/**
 * What the browser-side assistant client does with the answers the routes give
 * it.
 *
 * Two properties matter here and neither is visible from the server tests.
 * First, the client is the only thing standing between the merchant's browser
 * and a provider: every call it makes has to land on this app's own routes, so
 * the key stays server-side. Second, a chat turn that fails because the stored
 * key stopped working carries `code`/`action`, and the client has to hand that
 * signal to the caller rather than flatten it into a generic failure.
 *
 * `fetch` is patched rather than pointed at a stub server on purpose: the paths
 * the client requests are relative, which is the behaviour under test, and a
 * relative URL has no server to reach outside a browser.
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, test } from "node:test";

import { closeStubs } from "@/tests/support/env";

import {
  assistantApi,
  AssistantApiError,
  ChatApiError,
  isAssistantApiError,
  isKeyRevalidationError,
} from "@/lib/api";
import type { ChatError } from "@/lib/dto/chat";

// The stub servers `--import` starts for the server-side suites are unused
// here, but they hold the process open until they are closed.
after(closeStubs);

/** One `fetch` the client made, in the shape the assertions want to read. */
interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const calls: RecordedCall[] = [];
const realFetch = globalThis.fetch;

/** What the patched `fetch` answers with next. */
type Reply = { status?: number; body?: unknown } | { throws: Error };

let reply: Reply = { status: 200, body: {} };

function respondWith(next: Reply): void {
  reply = next;
}

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, body: {} };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers as Record<string, string>) ?? {};
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    if ("throws" in reply) throw reply.throws;
    const status = reply.status ?? 200;
    return new Response(JSON.stringify(reply.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** The single call the client just made. */
function onlyCall(): RecordedCall {
  assert.equal(calls.length, 1);
  return calls[0]!;
}

const KEY_REJECTED: ChatError = {
  error: "Your OpenAI API key was rejected — re-validate it in Settings",
  code: "key_rejected",
  action: "revalidate_key",
  provider: "openai",
};

describe("validateKey", () => {
  test("posts the key to this app's own route, in the body", async () => {
    respondWith({
      body: { status: "valid", provider: "openai", modelCount: 12, models: [] },
    });

    await assistantApi.validateKey("sk-test-0123456789abcdefghij");

    const call = onlyCall();
    assert.equal(call.url, "/api/provider/validate-key");
    assert.equal(call.method, "POST");
    // A key in a query string would land in access logs.
    assert.ok(!call.url.includes("sk-test"));
    assert.deepEqual(call.body, { apiKey: "sk-test-0123456789abcdefghij" });
  });

  test("resolves to the valid state with the chat models the key reaches", async () => {
    respondWith({
      body: {
        status: "valid",
        provider: "openai",
        modelCount: 42,
        models: [{ id: "gpt-4o-mini", ownedBy: "openai", created: 1_700_000_000 }],
      },
    });

    const state = await assistantApi.validateKey("sk-test-0123456789abcdefghij");

    assert.equal(state.status, "valid");
    if (state.status !== "valid") return;
    assert.equal(state.modelCount, 42);
    assert.deepEqual(
      state.models.map((model) => model.id),
      ["gpt-4o-mini"],
    );
  });

  test("reports a rejected key as an answer, not as a thrown error", async () => {
    respondWith({
      body: { status: "invalid", provider: "openai", reason: "Incorrect API key provided" },
    });

    const state = await assistantApi.validateKey("sk-test-0123456789abcdefghij");

    assert.equal(state.status, "invalid");
    if (state.status !== "invalid") return;
    assert.equal(state.reason, "Incorrect API key provided");
  });

  test("surfaces a malformed request the route refused", async () => {
    respondWith({
      status: 400,
      body: {
        error: "The request payload is invalid",
        errors: [{ path: "apiKey", message: "API key looks too short" }],
      },
    });

    const error = await rejection(() => assistantApi.validateKey("sk-short"));

    assert.ok(isAssistantApiError(error));
    assert.equal(error.status, 400);
    assert.equal(error.message, "The request payload is invalid");
    assert.deepEqual(error.fieldErrors, [
      { path: "apiKey", message: "API key looks too short" },
    ]);
  });
});

describe("listModels", () => {
  test("reads the merchant's chat models from the route, sending no key", async () => {
    respondWith({
      body: { provider: "openai", models: [{ id: "gpt-4o", ownedBy: "openai", created: null }] },
    });

    const result = await assistantApi.listModels();

    const call = onlyCall();
    assert.equal(call.url, "/api/provider/models");
    assert.equal(call.method, "GET");
    assert.equal(call.body, null);
    assert.equal(result.provider, "openai");
    assert.deepEqual(
      result.models.map((model) => model.id),
      ["gpt-4o"],
    );
  });

  test("passes an explicit provider as a query parameter", async () => {
    respondWith({ body: { provider: "openai", models: [] } });

    await assistantApi.listModels("openai");

    assert.equal(onlyCall().url, "/api/provider/models?provider=openai");
  });

  test("surfaces the 409 a merchant without a stored key gets", async () => {
    respondWith({
      status: 409,
      body: { error: "No openai API key is configured — add and validate one in Settings first" },
    });

    const error = await rejection(() => assistantApi.listModels());

    assert.ok(isAssistantApiError(error));
    assert.equal(error.status, 409);
    assert.match(error.message, /No openai API key is configured/);
  });
});

describe("sendChatMessage", () => {
  const answer = {
    message: { role: "assistant", content: "You have 12 products." },
    model: "gpt-4o-mini",
    finishReason: "stop",
    usage: { promptTokens: 30, completionTokens: 8, totalTokens: 38 },
    toolCalls: [{ name: "list_products", arguments: { limit: 50 }, ok: true }],
  };

  test("posts the turn to /api/chat and returns the assistant's answer", async () => {
    respondWith({ body: answer });

    const response = await assistantApi.sendChatMessage({
      messages: [{ role: "user", content: "How many products do I have?" }],
      model: "gpt-4o-mini",
    });

    const call = onlyCall();
    assert.equal(call.url, "/api/chat");
    assert.equal(call.method, "POST");
    assert.equal(call.headers["Content-Type"], "application/json");
    // The browser has no key to send, and the session decides the merchant.
    assert.deepEqual(Object.keys(call.body as object).sort(), ["messages", "model"]);
    assert.equal(response.message.content, "You have 12 products.");
    assert.deepEqual(
      response.toolCalls.map((toolCall) => toolCall.name),
      ["list_products"],
    );
  });

  test("throws the re-validate signal when the stored key was refused", async () => {
    respondWith({ status: 409, body: KEY_REJECTED });

    const error = await rejection(() =>
      assistantApi.sendChatMessage({ messages: [{ role: "user", content: "hi" }] }),
    );

    assert.ok(error instanceof ChatApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "key_rejected");
    assert.equal(error.action, "revalidate_key");
    assert.equal(error.provider, "openai");
    assert.equal(error.requiresKeyRevalidation, true);
    assert.equal(isKeyRevalidationError(error), true);
    // The human-readable half of the body is still what `message` carries.
    assert.equal(error.message, KEY_REJECTED.error);
  });

  test("keeps codes whose fix is not a new key out of the re-validate signal", async () => {
    respondWith({
      status: 429,
      body: {
        error: "OpenAI is rate limiting this key — try again shortly",
        code: "provider_rate_limited",
        action: "retry",
        provider: "openai",
      } satisfies ChatError,
    });

    const error = await rejection(() =>
      assistantApi.sendChatMessage({ messages: [{ role: "user", content: "hi" }] }),
    );

    assert.ok(error instanceof ChatApiError);
    assert.equal(error.code, "provider_rate_limited");
    assert.equal(error.requiresKeyRevalidation, false);
    assert.equal(isKeyRevalidationError(error), false);
  });

  test("surfaces an unreachable server instead of resolving empty", async () => {
    respondWith({ throws: new TypeError("fetch failed") });

    const error = await rejection(() =>
      assistantApi.sendChatMessage({ messages: [{ role: "user", content: "hi" }] }),
    );

    assert.ok(isAssistantApiError(error));
    assert.equal(error.status, 0);
    assert.match(error.message, /Could not reach \/api\/chat/);
    assert.ok(error.cause instanceof TypeError);
  });

  test("surfaces a response that does not match the chat schema", async () => {
    respondWith({ body: { message: { role: "assistant" }, model: "gpt-4o-mini" } });

    const error = await rejection(() =>
      assistantApi.sendChatMessage({ messages: [{ role: "user", content: "hi" }] }),
    );

    assert.ok(isAssistantApiError(error));
    assert.match(error.message, /unexpected response/);
    assert.ok(error.fieldErrors.length > 0);
  });
});

test("never calls a provider directly", async () => {
  respondWith({ body: { status: "invalid", provider: "openai", reason: "nope" } });
  await assistantApi.validateKey("sk-test-0123456789abcdefghij");
  respondWith({ body: { provider: "openai", models: [] } });
  await assistantApi.listModels();
  respondWith({ status: 409, body: KEY_REJECTED });
  await rejection(() =>
    assistantApi.sendChatMessage({ messages: [{ role: "user", content: "hi" }] }),
  );

  assert.equal(calls.length, 3);
  for (const call of calls) {
    // Relative, so it can only ever be this app's origin.
    assert.ok(call.url.startsWith("/api/"), `${call.url} is not one of this app's routes`);
  }
});

/** The error a call rejected with; fails the test if it resolved instead. */
async function rejection(call: () => Promise<unknown>): Promise<AssistantApiError> {
  try {
    await call();
  } catch (error) {
    assert.ok(error instanceof AssistantApiError, `unexpected error: ${String(error)}`);
    return error;
  }
  assert.fail("expected the call to reject");
}
