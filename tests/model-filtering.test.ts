/**
 * Chat-capable model filtering: the merchant's model picker may only ever be
 * offered models that can serve `chat.completions`.
 *
 * The classifier is unit-tested against the model families OpenAI actually
 * ships, and then the same expectation is asserted at each layer that reaches a
 * caller — the provider helpers, the key-validation state, the service layer,
 * and `GET /api/provider/models`.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import {
  CHAT_MODEL_IDS,
  modelsReply,
  NON_CHAT_MODEL_IDS,
  openAiErrorReply,
  openaiStub,
  resetHarness,
  seedProviderKey,
  teardownHarness,
  TEST_API_KEY,
  TEST_MERCHANT_ID,
} from "@/tests/support/harness";

import type { ModelSummary } from "@/lib/dto/list-models";
import { filterChatModels, isChatModel, listModels, validateApiKey } from "@/lib/server/openai";
import { getProviderConfig } from "@/lib/server/provider-config-repository";
import { listChatModels, saveSelectedModel } from "@/lib/server/provider-key-service";
import { GET as getModels } from "@/app/api/provider/models/route";

beforeEach(resetHarness);
after(teardownHarness);

describe("isChatModel", () => {
  for (const id of CHAT_MODEL_IDS) {
    test(`accepts ${id}`, () => assert.equal(isChatModel(id), true));
  }

  // The families that must never reach the picker, one representative each of
  // embeddings, audio, image, moderation, completion-only and realtime.
  for (const id of NON_CHAT_MODEL_IDS) {
    test(`rejects ${id}`, () => assert.equal(isChatModel(id), false));
  }

  test("rejects a model from no known family", () => {
    assert.equal(isChatModel("babbage-002"), false);
    assert.equal(isChatModel(""), false);
  });
});

describe("filterChatModels", () => {
  test("drops every non-chat model and keeps the order of the rest", () => {
    const models = summaries([
      "text-embedding-3-small",
      "gpt-4o",
      "whisper-1",
      "gpt-4o-mini",
      "dall-e-3",
    ]);

    assert.deepEqual(
      filterChatModels(models).map((model) => model.id),
      ["gpt-4o", "gpt-4o-mini"],
    );
  });

  test("can return nothing, for a key that reaches no chat model at all", () => {
    assert.deepEqual(filterChatModels(summaries([...NON_CHAT_MODEL_IDS])), []);
  });
});

describe("listModels", () => {
  beforeEach(() => openaiStub.respondWith(modelsReply()));

  test("excludes non-chat models by default", async () => {
    const { models, provider } = await listModels(TEST_API_KEY);
    const ids = models.map((model) => model.id);

    assert.equal(provider, "openai");
    assert.deepEqual(new Set(ids), new Set(CHAT_MODEL_IDS));
    for (const excluded of NON_CHAT_MODEL_IDS) {
      assert.equal(ids.includes(excluded), false, `${excluded} must not be selectable`);
    }
  });

  test("returns the unfiltered list only when explicitly asked", async () => {
    const { models } = await listModels(TEST_API_KEY, { chatOnly: false });
    const ids = models.map((model) => model.id);

    assert.equal(ids.includes("text-embedding-3-small"), true);
    assert.equal(ids.length, CHAT_MODEL_IDS.length + NON_CHAT_MODEL_IDS.length);
  });

  test("sorts newest first", async () => {
    const { models } = await listModels(TEST_API_KEY, { chatOnly: false });
    const created = models.map((model) => model.created ?? 0);

    assert.deepEqual(created, [...created].sort((a, b) => b - a));
  });
});

describe("the model list a merchant is offered", () => {
  test("excludes non-chat models on the validation state", async () => {
    openaiStub.respondWith(modelsReply());

    const state = await validateApiKey(TEST_API_KEY);
    assert.equal(state.status, "valid");
    if (state.status !== "valid") return;

    for (const excluded of NON_CHAT_MODEL_IDS) {
      assert.equal(
        state.models.some((model) => model.id === excluded),
        false,
        `${excluded} must not be offered`,
      );
    }
  });

  test("excludes non-chat models when read through the stored key", async () => {
    seedProviderKey();
    openaiStub.respondWith(modelsReply());

    const result = await listChatModels({ merchantId: TEST_MERCHANT_ID });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(new Set(result.models.map((model) => model.id)), new Set(CHAT_MODEL_IDS));
  });

  test("reports no key configured rather than an empty list", async () => {
    const result = await listChatModels({ merchantId: TEST_MERCHANT_ID });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /No openai API key is configured/);
    assert.equal(openaiStub.requests.length, 0);
  });
});

describe("GET /api/provider/models", () => {
  test("returns only chat-capable models", async () => {
    seedProviderKey();
    openaiStub.respondWith(modelsReply());

    const response = await getModels(modelsRequest());
    const body = await response.json();
    const ids: string[] = body.models.map((model: { id: string }) => model.id);

    assert.equal(response.status, 200);
    assert.equal(body.provider, "openai");
    assert.deepEqual(new Set(ids), new Set(CHAT_MODEL_IDS));
    for (const excluded of NON_CHAT_MODEL_IDS) {
      assert.equal(ids.includes(excluded), false, `${excluded} leaked into the picker`);
    }
  });

  test("answers 409 when the merchant has no key on file", async () => {
    const response = await getModels(modelsRequest());

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /No openai API key is configured/);
  });

  test("answers 502 when the stored key stops working", async () => {
    seedProviderKey();
    openaiStub.respondWith(openAiErrorReply(401));

    const response = await getModels(modelsRequest());

    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "The API key was rejected by OpenAI");
  });

  test("rejects an unknown provider against the provider field", async () => {
    const response = await getModels(modelsRequest("?provider=anthropic"));

    assert.equal(response.status, 400);
    assert.deepEqual(
      (await response.json()).errors.map((error: { path: string }) => error.path),
      ["provider"],
    );
  });
});

describe("saveSelectedModel", () => {
  beforeEach(() => seedProviderKey({ selectedModel: null }));

  test("refuses a non-chat model without calling the provider", async () => {
    const result = await saveSelectedModel({
      model: "text-embedding-3-small",
      merchantId: TEST_MERCHANT_ID,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, '"text-embedding-3-small" is not a chat-capable model');
    assert.equal(openaiStub.requests.length, 0);
    assert.equal(getProviderConfig(TEST_MERCHANT_ID)?.selectedModel, null);
  });

  test("accepts a chat model", async () => {
    const result = await saveSelectedModel({ model: "gpt-4o", merchantId: TEST_MERCHANT_ID });

    assert.equal(result.ok, true);
    assert.equal(getProviderConfig(TEST_MERCHANT_ID)?.selectedModel, "gpt-4o");
  });

  test("refuses a chat model the stored key cannot reach when verifying", async () => {
    openaiStub.respondWith(modelsReply(["gpt-4o-mini"]));

    const result = await saveSelectedModel({
      model: "gpt-4o",
      merchantId: TEST_MERCHANT_ID,
      verify: true,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, '"gpt-4o" is not available to the stored key');
    assert.equal(getProviderConfig(TEST_MERCHANT_ID)?.selectedModel, null);
  });

  test("clears the choice when passed null", async () => {
    await saveSelectedModel({ model: "gpt-4o", merchantId: TEST_MERCHANT_ID });

    const result = await saveSelectedModel({ model: null, merchantId: TEST_MERCHANT_ID });

    assert.equal(result.ok, true);
    assert.equal(getProviderConfig(TEST_MERCHANT_ID)?.selectedModel, null);
  });
});

function summaries(ids: string[]): ModelSummary[] {
  return ids.map((id, index) => ({ id, ownedBy: "system", created: 1_000 - index }));
}

function modelsRequest(search = ""): Request {
  return new Request(`http://localhost/api/provider/models${search}`);
}
