/**
 * Shared fixtures for the server-side test suite: the stub servers, the seeded
 * merchant, and the request/response bodies the stubs trade in.
 *
 * The stubs themselves are started by `@/tests/support/env`, which
 * `@/tests/support/register.mjs` awaits during Node's `--import` phase — so by
 * the time this module (or any application module) is evaluated, they are
 * already listening and `serverConfig` already points at them. Re-importing
 * `env` here just picks up that same, already-running set.
 */
import {
  catalogStub,
  checkoutStub,
  closeStubs,
  openaiStub,
  OTHER_MERCHANT_ID,
  stubs,
  TEST_API_KEY,
  TEST_MERCHANT_ID,
} from "@/tests/support/env";
import type { StubReply } from "@/tests/support/http-stub";

import type { ChatRequest } from "@/lib/dto/chat";
import type { CommerceAuthContext } from "@/lib/server/commerce-client";
import { closeDb, getDb } from "@/lib/server/db";
import { upsertProviderConfig } from "@/lib/server/provider-config-repository";
import type { Provider } from "@/lib/models/provider-config";

export {
  catalogStub,
  checkoutStub,
  closeStubs,
  openaiStub,
  OTHER_MERCHANT_ID,
  TEST_API_KEY,
  TEST_MERCHANT_ID,
};
export type { RecordedRequest, StubReply } from "@/tests/support/http-stub";

/** Drops recorded requests and stored provider configs. Use in `beforeEach`. */
export function resetHarness(): void {
  for (const stub of stubs) stub.reset();
  getDb().exec("DELETE FROM provider_configs");
}

/** Closes the stubs and the SQLite handle. Use in a top-level `after`. */
export async function teardownHarness(): Promise<void> {
  closeDb();
  await closeStubs();
}

/** Stores a validated-looking key for a merchant, as the settings screen would. */
export function seedProviderKey(
  overrides: {
    merchantId?: string;
    provider?: Provider;
    apiKey?: string;
    selectedModel?: string | null;
  } = {},
): void {
  upsertProviderConfig({
    merchantId: overrides.merchantId ?? TEST_MERCHANT_ID,
    provider: overrides.provider,
    apiKey: overrides.apiKey ?? TEST_API_KEY,
    // Distinguishes "not specified" from an explicit `null`, which is how a
    // merchant with a key but no model choice is stored.
    selectedModel: "selectedModel" in overrides ? overrides.selectedModel : "gpt-4o-mini",
  });
}

/** A caller identity, as a route handler would hand one to a service. */
export function authContext(
  overrides: {
    merchantId?: string;
    forwardedHeaders?: Record<string, string>;
  } = {},
): CommerceAuthContext {
  return {
    merchantId: overrides.merchantId ?? TEST_MERCHANT_ID,
    forwardedHeaders: overrides.forwardedHeaders ?? {
      cookie: "session=merchant-under-test-session",
      authorization: "Bearer merchant-under-test-token",
      "x-request-id": "req-abc-123",
    },
  };
}

/**
 * One chat turn, already parsed — the shape a route handler passes to the chat
 * service, defaults filled in as `chatRequestSchema` would fill them.
 */
export function chatTurn(content: string, overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    provider: "openai",
    messages: [{ role: "user", content }],
    stream: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// OpenAI stub replies
// ---------------------------------------------------------------------------

/**
 * A slice of a real `GET /v1/models` answer: chat models mixed in with the
 * embedding, audio, image, moderation, instruct, realtime and search families
 * the model picker must never offer.
 */
export const CHAT_MODEL_IDS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "chatgpt-4o-latest",
  "o1",
  "o3-mini",
] as const;

export const NON_CHAT_MODEL_IDS = [
  "text-embedding-3-small",
  "text-embedding-ada-002",
  "whisper-1",
  "tts-1",
  "gpt-4o-mini-tts",
  "dall-e-3",
  "gpt-image-1",
  "omni-moderation-latest",
  "text-moderation-stable",
  "gpt-4o-audio-preview",
  "gpt-4o-realtime-preview",
  "gpt-4o-transcribe",
  "gpt-4o-search-preview",
  "gpt-3.5-turbo-instruct",
  "davinci-002",
] as const;

export const ALL_MODEL_IDS = [...CHAT_MODEL_IDS, ...NON_CHAT_MODEL_IDS];

/** A `GET /v1/models` page. `created` descends with the index, as OpenAI's does. */
export function modelsReply(ids: readonly string[] = ALL_MODEL_IDS): StubReply {
  return {
    status: 200,
    body: {
      object: "list",
      data: ids.map((id, index) => ({
        id,
        object: "model",
        created: 1_700_000_000 - index * 1_000,
        owned_by: "system",
      })),
    },
  };
}

/** An OpenAI error body with the status the SDK will surface. */
export function openAiErrorReply(status: number, message = "stubbed failure"): StubReply {
  return {
    status,
    body: { error: { message, type: "stub_error", param: null, code: null } },
  };
}

const USAGE = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };

/** A finished assistant turn with no tool calls. */
export function chatAnswerReply(content = "You have 3 products.", model = "gpt-4o-mini"): StubReply {
  return {
    status: 200,
    body: {
      id: "chatcmpl-stub-answer",
      object: "chat.completion",
      created: 1_700_000_000,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content, refusal: null },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: USAGE,
    },
  };
}

/** An assistant turn that asks for one or more tools by name. */
export function chatToolCallReply(
  calls: readonly { name: string; arguments?: unknown }[],
  model = "gpt-4o-mini",
): StubReply {
  return {
    status: 200,
    body: {
      id: "chatcmpl-stub-tools",
      object: "chat.completion",
      created: 1_700_000_000,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            refusal: null,
            tool_calls: calls.map((call, index) => ({
              id: `call_${index}`,
              type: "function",
              function: {
                name: call.name,
                arguments:
                  typeof call.arguments === "string"
                    ? call.arguments
                    : JSON.stringify(call.arguments ?? {}),
              },
            })),
          },
          finish_reason: "tool_calls",
          logprobs: null,
        },
      ],
      usage: USAGE,
    },
  };
}

// ---------------------------------------------------------------------------
// Commerce stub replies
// ---------------------------------------------------------------------------

/**
 * A catalog product as FastAPI serializes one: snake_case, and `price` as a
 * string, which is what Pydantic does to a `Decimal`.
 */
export function productPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: "Roasted Ethiopia 250g",
    description: "Single origin, washed.",
    price: "18.50",
    currency: "USD",
    stock: 42,
    category: "coffee",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

/** An order as the checkout service serializes one. */
export function orderPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 500,
    checkout_session_id: "cs_stub_1",
    product_id: 1,
    product_name: "Roasted Ethiopia 250g",
    quantity: 2,
    total_amount: "37.00",
    currency: "USD",
    payment_status: "paid",
    order_status: "fulfilled",
    created_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

/** Answers the four reads the commerce repository performs. */
export function serveCommerceReads(): void {
  catalogStub.respond((request) => {
    if (request.path === "/products") return { status: 200, body: [productPayload()] };
    if (request.path.startsWith("/products/")) return { status: 200, body: productPayload() };
    return { status: 404, body: { detail: "not found" } };
  });
  checkoutStub.respond((request) => {
    if (request.path === "/orders") return { status: 200, body: [orderPayload()] };
    if (request.path.startsWith("/orders/")) return { status: 200, body: orderPayload() };
    return { status: 404, body: { detail: "not found" } };
  });
}

/** Names a model might hallucinate but that must not exist as a tool. */
export const MUTATING_TOOL_NAMES = [
  "create_order",
  "create_product",
  "update_product",
  "update_order",
  "delete_product",
  "delete_order",
  "cancel_order",
  "refund_order",
  "set_stock",
  "create_checkout_session",
  "pay_order",
] as const;
