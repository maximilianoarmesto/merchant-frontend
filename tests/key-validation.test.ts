/**
 * OpenAI key validation: what a merchant sees when a key is accepted, and each
 * of the ways one can be refused.
 *
 * The provider call is real HTTP against the stub from
 * `@/tests/support/harness`, so these exercise the OpenAI SDK's own error
 * classification rather than a hand-made stand-in for it.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import {
  ALL_MODEL_IDS,
  CHAT_MODEL_IDS,
  modelsReply,
  openAiErrorReply,
  openaiStub,
  resetHarness,
  seedProviderKey,
  teardownHarness,
  TEST_API_KEY,
  TEST_MERCHANT_ID,
} from "@/tests/support/harness";

import { keyValidationStateSchema } from "@/lib/dto/validate-key";
import {
  describeOpenAIError,
  fetchModelSummaries,
  openAIErrorStatus,
  validateApiKey,
} from "@/lib/server/openai";
import {
  getProviderConfig,
  hasProviderConfig,
} from "@/lib/server/provider-config-repository";
import {
  validateAndSaveProviderKey,
  validateProviderKey,
} from "@/lib/server/provider-key-service";
import { POST as postValidateKey } from "@/app/api/provider/validate-key/route";

beforeEach(resetHarness);
after(teardownHarness);

describe("a key the provider accepts", () => {
  beforeEach(() => openaiStub.respondWith(modelsReply()));

  test("settles as valid, and reports the provider it was checked against", async () => {
    const state = await validateApiKey(TEST_API_KEY);

    assert.equal(state.status, "valid");
    assert.equal(state.provider, "openai");
  });

  test("counts every reachable model but offers only the chat-capable ones", async () => {
    const state = await validateApiKey(TEST_API_KEY);
    assert.equal(state.status, "valid");
    if (state.status !== "valid") return;

    // `modelCount` is a capability signal — the total the key can reach.
    assert.equal(state.modelCount, ALL_MODEL_IDS.length);
    // `models` is what the merchant may pick from, so it is chat-only.
    assert.deepEqual(new Set(state.models.map((model) => model.id)), new Set(CHAT_MODEL_IDS));
    assert.ok(state.models.length < state.modelCount);
  });

  test("produces a state the DTO schema accepts", async () => {
    const state = await validateApiKey(TEST_API_KEY);
    assert.equal(keyValidationStateSchema.safeParse(state).success, true);
  });

  test("checks the key with one models.list call, and never puts it in the URL", async () => {
    await validateApiKey(TEST_API_KEY);

    assert.equal(openaiStub.requests.length, 1);
    const request = openaiStub.lastRequest;
    assert.equal(request.method, "GET");
    assert.equal(request.path, "/models");
    assert.equal(request.headers.authorization, `Bearer ${TEST_API_KEY}`);
    assert.deepEqual(request.query, {});
  });

  test("reports validating before the provider call, then the settled state", async () => {
    const seen: string[] = [];
    const state = await validateProviderKey(TEST_API_KEY, {
      onState: (published) => seen.push(published.status),
    });

    assert.deepEqual(seen, ["validating", "valid"]);
    assert.equal(state.status, "valid");
  });
});

describe("a key the provider refuses", () => {
  // Each status the provider can answer with, and the reason a merchant is
  // shown for it. 401 is the one that means "this key is wrong".
  const refusals = [
    { status: 401, reason: "The API key was rejected by OpenAI" },
    { status: 403, reason: "This API key is not permitted to perform that request" },
    { status: 429, reason: "OpenAI rate limit reached — try again shortly" },
    { status: 500, reason: "OpenAI is currently unavailable" },
    { status: 503, reason: "OpenAI is currently unavailable" },
  ];

  for (const { status, reason } of refusals) {
    test(`settles as invalid with a readable reason on ${status}`, async () => {
      openaiStub.respondWith(openAiErrorReply(status, "stubbed refusal"));

      const state = await validateApiKey(TEST_API_KEY);

      assert.equal(state.status, "invalid");
      if (state.status !== "invalid") return;
      assert.equal(state.provider, "openai");
      assert.equal(state.reason, reason);
    });
  }

  test("resolves rather than throwing, so a caller has no error path to forget", async () => {
    openaiStub.respondWith(openAiErrorReply(401));
    await assert.doesNotReject(() => validateApiKey(TEST_API_KEY));
  });

  test("reports validating before the provider call, then invalid", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    const seen: string[] = [];
    await validateProviderKey(TEST_API_KEY, {
      onState: (published) => seen.push(published.status),
    });

    assert.deepEqual(seen, ["validating", "invalid"]);
  });

  test("tells a rejected key apart from an unreachable provider by status", async () => {
    openaiStub.respondWith(openAiErrorReply(401));
    const rejected = await captureError(() => fetchModelSummaries(TEST_API_KEY));
    assert.equal(openAIErrorStatus(rejected), 401);
    assert.equal(describeOpenAIError(rejected), "The API key was rejected by OpenAI");

    // A dropped connection never reached OpenAI, so there is no status to read
    // and the key itself is not implicated.
    openaiStub.respondWith({ destroy: true });
    const unreachable = await captureError(() => fetchModelSummaries(TEST_API_KEY));
    assert.equal(openAIErrorStatus(unreachable), undefined);

    const state = await validateApiKey(TEST_API_KEY);
    assert.equal(state.status, "invalid");
  });

  test("treats a garbled provider response as invalid, not as a crash", async () => {
    openaiStub.respondWith({ status: 200, body: "<html>gateway</html>" });

    const state = await validateApiKey(TEST_API_KEY);

    assert.equal(state.status, "invalid");
    if (state.status !== "invalid") return;
    assert.ok(state.reason.length > 0, "a reason is always shown to the merchant");
  });
});

describe("persisting a validated key", () => {
  test("stores the key once the provider has accepted it", async () => {
    openaiStub.respondWith(modelsReply());

    const result = await validateAndSaveProviderKey({
      apiKey: TEST_API_KEY,
      merchantId: TEST_MERCHANT_ID,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.hasApiKey, true);
    assert.deepEqual(new Set(result.models.map((model) => model.id)), new Set(CHAT_MODEL_IDS));
    assert.equal(getProviderConfig(TEST_MERCHANT_ID)?.apiKey, TEST_API_KEY);
  });

  test("writes nothing when the provider refuses the key", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    const result = await validateAndSaveProviderKey({
      apiKey: TEST_API_KEY,
      merchantId: TEST_MERCHANT_ID,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "The API key was rejected by OpenAI");
    assert.equal(hasProviderConfig(TEST_MERCHANT_ID), false);
  });

  test("leaves an already-working key untouched when a replacement is refused", async () => {
    seedProviderKey({ apiKey: "sk-test-previously-validated-key", selectedModel: "gpt-4o" });
    openaiStub.respondWith(openAiErrorReply(401));

    const result = await validateAndSaveProviderKey({
      apiKey: "sk-test-freshly-typed-and-wrong",
      merchantId: TEST_MERCHANT_ID,
    });

    assert.equal(result.ok, false);
    const stored = getProviderConfig(TEST_MERCHANT_ID);
    assert.equal(stored?.apiKey, "sk-test-previously-validated-key");
    assert.equal(stored?.selectedModel, "gpt-4o");
  });
});

describe("POST /api/provider/validate-key", () => {
  test("answers 200 with the valid state and stores the key", async () => {
    openaiStub.respondWith(modelsReply());

    const response = await postValidateKey(validateKeyRequest({ apiKey: TEST_API_KEY }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "valid");
    assert.equal(body.modelCount, ALL_MODEL_IDS.length);
    assert.deepEqual(
      new Set(body.models.map((model: { id: string }) => model.id)),
      new Set(CHAT_MODEL_IDS),
    );
    assert.equal(hasProviderConfig(TEST_MERCHANT_ID), true);
  });

  test("never echoes the submitted key back", async () => {
    openaiStub.respondWith(modelsReply());

    const response = await postValidateKey(validateKeyRequest({ apiKey: TEST_API_KEY }));

    assert.equal(JSON.stringify(await response.json()).includes(TEST_API_KEY), false);
  });

  test("answers 200 with the invalid state, and stores nothing, on a refusal", async () => {
    openaiStub.respondWith(openAiErrorReply(401));

    const response = await postValidateKey(validateKeyRequest({ apiKey: TEST_API_KEY }));
    const body = await response.json();

    // "This key is invalid, because …" is the answer to a validation request,
    // not a failure of it.
    assert.equal(response.status, 200);
    assert.equal(body.status, "invalid");
    assert.equal(body.reason, "The API key was rejected by OpenAI");
    assert.equal(hasProviderConfig(TEST_MERCHANT_ID), false);
  });

  test("rejects a key that cannot be one before calling the provider", async () => {
    openaiStub.respondWith(modelsReply());

    const response = await postValidateKey(validateKeyRequest({ apiKey: "sk-short" }));

    assert.equal(response.status, 400);
    assert.equal(openaiStub.requests.length, 0);
    assert.equal(hasProviderConfig(TEST_MERCHANT_ID), false);
  });
});

function validateKeyRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/provider/validate-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Runs `action` and returns whatever it threw. Fails if it resolved. */
async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  assert.fail("expected the call to reject");
}
