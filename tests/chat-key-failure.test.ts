/**
 * What a chat turn does when the merchant's stored key stops working.
 *
 * A key is validated once, when the merchant saves it, and nothing re-checks it
 * on a timer — so the first sign that it was revoked, expired or had its
 * permissions narrowed is a rejection in the middle of a chat turn. That has to
 * come back as a structured "re-validate your key" instruction the chat UI can
 * act on, not as a generic failure or an empty answer.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import {
  authContext,
  chatAnswerReply,
  chatToolCallReply,
  chatTurn,
  openAiErrorReply,
  openaiStub,
  resetHarness,
  seedProviderKey,
  serveCommerceReads,
  teardownHarness,
  TEST_API_KEY,
  TEST_MERCHANT_ID,
} from "@/tests/support/harness";

import {
  chatErrorSchema,
  requiresKeyRevalidation,
  type ChatError,
  type ChatErrorCode,
} from "@/lib/dto/chat";
import { runChatCompletion } from "@/lib/server/chat-service";
import { getProviderConfig } from "@/lib/server/provider-config-repository";
import { POST as postChat } from "@/app/api/chat/route";

beforeEach(resetHarness);
after(teardownHarness);

describe("a stored key the provider refuses mid-chat", () => {
  beforeEach(() => seedProviderKey());

  for (const status of [401, 403]) {
    test(`answers with the re-validate instruction on ${status}`, async () => {
      openaiStub.respondWith(openAiErrorReply(status));

      const error = await failedTurn();

      assert.equal(error.code, "key_rejected");
      assert.equal(error.action, "revalidate_key");
      assert.equal(error.provider, "openai");
      assert.match(error.error, /re-validate it in Settings/);
      assert.match(error.error, /revoked or expired/);
    });
  }

  test("produces a body the shared ChatError schema accepts", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    const error = await failedTurn();

    assert.equal(chatErrorSchema.safeParse(error).success, true);
    // `ChatError` is a superset of the app's shared `ApiError`, so a client that
    // only reads `error` still gets something to show.
    assert.equal(typeof error.error, "string");
    assert.ok(error.error.length > 0);
  });

  test("is recognised as a case the merchant fixes by re-validating", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    assert.equal(requiresKeyRevalidation(await failedTurn()), true);
  });

  test("resolves rather than throwing, so a route never has to catch it", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    await assert.doesNotReject(() =>
      runChatCompletion(
        chatTurn("Hello"),
        { merchantId: TEST_MERCHANT_ID, auth: authContext() },
      ),
    );
  });

  test("leaves the stored key exactly as it was", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    await failedTurn();

    // Validation is explicit: a mid-chat rejection reports the problem, it does
    // not re-validate, rewrite or clear the key behind the merchant's back.
    const stored = getProviderConfig(TEST_MERCHANT_ID);
    assert.equal(stored?.apiKey, TEST_API_KEY);
    assert.equal(stored?.selectedModel, "gpt-4o-mini");
  });

  test("still reports a rejected key when it happens after a successful read", async () => {
    serveCommerceReads();
    openaiStub.respondInSequence([
      chatToolCallReply([{ name: "list_products", arguments: {} }]),
      openAiErrorReply(401),
    ]);

    const error = await failedTurn("How many products do I have?");

    assert.equal(error.code, "key_rejected");
    assert.equal(error.action, "revalidate_key");
    assert.equal(openaiStub.requestsFor("/chat/completions").length, 2);
  });
});

describe("the other ways a chat turn can fail", () => {
  test("no key on file asks the merchant to configure one", async () => {
    const error = await failedTurn();

    assert.equal(error.code, "key_missing");
    assert.equal(error.action, "configure_key");
    assert.match(error.error, /add and validate one in Settings/);
    // The provider is never contacted without a key.
    assert.equal(openaiStub.requests.length, 0);
    assert.equal(requiresKeyRevalidation(error), true);
  });

  test("a model the key cannot reach asks the merchant to pick another", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(404, "The model does not exist"));

    const error = await failedTurn();

    assert.equal(error.code, "model_unavailable");
    assert.equal(error.action, "select_model");
    assert.match(error.error, /pick another in Settings/);
    // Not a credential problem, so the UI must not send them to re-validate.
    assert.equal(requiresKeyRevalidation(error), false);
  });

  test("a rate limit asks for a retry", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(429));

    const error = await failedTurn();

    assert.equal(error.code, "provider_rate_limited");
    assert.equal(error.action, "retry");
    assert.equal(requiresKeyRevalidation(error), false);
  });

  test("a provider outage asks for a retry and does not blame the key", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(503));

    const error = await failedTurn();

    assert.equal(error.code, "provider_unavailable");
    assert.equal(error.action, "retry");
    assert.equal(error.error, "OpenAI is currently unavailable");
  });

  test("an abandoned request is a retry, not a rejected key", async () => {
    seedProviderKey();
    openaiStub.respondWith(chatAnswerReply());

    // The call never got an answer, so there is no status to read — and nothing
    // that implicates the key.
    const result = await runChatCompletion(
      chatTurn("Hello"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext(), signal: AbortSignal.abort() },
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "provider_unavailable");
    assert.equal(result.error.action, "retry");
  });

  test("an answerless completion is reported as a provider error", async () => {
    seedProviderKey();
    openaiStub.respondWith({
      status: 200,
      body: { id: "chatcmpl-empty", object: "chat.completion", created: 1, model: "gpt-4o-mini", choices: [] },
    });

    const error = await failedTurn();

    assert.equal(error.code, "provider_error");
    assert.equal(error.action, "none");
    assert.match(error.error, /no completion choices/);
  });
});

describe("POST /api/chat when the key fails", () => {
  test("answers 409 with the re-validate body verbatim", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(401));

    const response = await postChat(chatRequest());
    const body = await response.json();

    // 409: the request was well-formed and will keep failing until the merchant
    // fixes their configuration, which is what `action` tells the UI to ask for.
    assert.equal(response.status, 409);
    assert.equal(body.code, "key_rejected");
    assert.equal(body.action, "revalidate_key");
    assert.equal(body.provider, "openai");
    assert.equal(chatErrorSchema.safeParse(body).success, true);
    assert.equal(requiresKeyRevalidation(body), true);
  });

  test("never leaks the stored key into the failure body", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(401));

    const response = await postChat(chatRequest());

    assert.equal(JSON.stringify(await response.json()).includes(TEST_API_KEY), false);
  });

  test("answers 409 with configure_key when no key is on file", async () => {
    const response = await postChat(chatRequest());
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.code, "key_missing");
    assert.equal(body.action, "configure_key");
  });

  test("maps each failure onto the status its remedy implies", async () => {
    // Provider status → the code the service reports → the HTTP status the
    // route answers with.
    const cases: { provider: number; code: ChatErrorCode; status: number }[] = [
      { provider: 401, code: "key_rejected", status: 409 },
      { provider: 404, code: "model_unavailable", status: 409 },
      { provider: 429, code: "provider_rate_limited", status: 429 },
      { provider: 503, code: "provider_unavailable", status: 503 },
    ];

    for (const { provider, code, status } of cases) {
      resetHarness();
      seedProviderKey();
      openaiStub.respondWith(openAiErrorReply(provider));

      const response = await postChat(chatRequest());
      const body = await response.json();

      assert.equal(body.code, code, `provider ${provider} should report ${code}`);
      assert.equal(response.status, status, `${code} should answer ${status}`);
    }
  });

  test("answers normally once the merchant has fixed the key", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(401));
    assert.equal((await postChat(chatRequest())).status, 409);

    openaiStub.respondWith(chatAnswerReply("You have 3 products."));
    const response = await postChat(chatRequest());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message.content, "You have 3 products.");
    assert.deepEqual(body.usage, { promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    assert.deepEqual(body.toolCalls, []);
  });
});

/** Runs a turn that is expected to fail and returns its `ChatError`. */
async function failedTurn(content = "Hello"): Promise<ChatError> {
  const result = await runChatCompletion(
    chatTurn(content),
    { merchantId: TEST_MERCHANT_ID, auth: authContext() },
  );

  assert.equal(result.ok, false, "expected the turn to fail");
  if (result.ok) throw new Error("unreachable");
  return result.error;
}

function chatRequest(): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "How many products do I have?" }] }),
  });
}
