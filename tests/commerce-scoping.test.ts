/**
 * Server-side commerce access: every read must carry the caller's own
 * auth/session upstream, so the catalog and checkout services scope the answer
 * to the merchant who is actually signed in rather than to this frontend's
 * identity.
 *
 * The assertions read the headers a stub service actually received, since
 * forwarding is only true if it is true on the wire.
 */
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import {
  authContext,
  catalogStub,
  chatAnswerReply,
  chatToolCallReply,
  chatTurn,
  checkoutStub,
  openaiStub,
  orderPayload,
  OTHER_MERCHANT_ID,
  resetHarness,
  seedProviderKey,
  serveCommerceReads,
  teardownHarness,
  TEST_MERCHANT_ID,
  type RecordedRequest,
} from "@/tests/support/harness";

import { productListPayloadSchema } from "@/lib/dto/commerce";
import { runChatCompletion } from "@/lib/server/chat-service";
import {
  CommerceApiError,
  CommerceResponseError,
  getCommerceAuthContext,
  getJson,
  MERCHANT_ID_HEADER,
} from "@/lib/server/commerce-client";
import { commerceRepository } from "@/lib/server/commerce-repository";
import { executeCommerceTool } from "@/lib/server/commerce-tools";
import { POST as postChat } from "@/app/api/chat/route";

beforeEach(resetHarness);
after(teardownHarness);

describe("the headers a commerce read carries upstream", () => {
  beforeEach(serveCommerceReads);

  test("replays the caller's session and bearer token verbatim", async () => {
    const auth = authContext({
      forwardedHeaders: {
        cookie: "session=abc123; theme=dark",
        authorization: "Bearer merchant-token-xyz",
        "x-request-id": "req-42",
      },
    });

    await commerceRepository.listProducts({ auth });

    const { headers } = catalogStub.lastRequest;
    assert.equal(headers.cookie, "session=abc123; theme=dark");
    assert.equal(headers.authorization, "Bearer merchant-token-xyz");
    assert.equal(headers["x-request-id"], "req-42");
  });

  test("names the merchant the read is scoped to", async () => {
    await commerceRepository.listProducts({ auth: authContext() });

    assert.equal(catalogStub.lastRequest.headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID);
  });

  test("lets the session's merchant override one smuggled in as a forwarded header", async () => {
    const auth = authContext({
      merchantId: TEST_MERCHANT_ID,
      forwardedHeaders: { [MERCHANT_ID_HEADER]: OTHER_MERCHANT_ID, cookie: "session=abc" },
    });

    await commerceRepository.listProducts({ auth });

    assert.equal(catalogStub.lastRequest.headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID);
  });

  test("scopes two merchants' reads separately", async () => {
    await commerceRepository.listProducts({ auth: authContext({ merchantId: TEST_MERCHANT_ID }) });
    await commerceRepository.listProducts({
      auth: authContext({
        merchantId: OTHER_MERCHANT_ID,
        forwardedHeaders: { cookie: "session=next-door" },
      }),
    });

    assert.deepEqual(
      catalogStub.requests.map((request) => request.headers[MERCHANT_ID_HEADER]),
      [TEST_MERCHANT_ID, OTHER_MERCHANT_ID],
    );
  });

  test("forwards the session on all four reads, catalog and checkout alike", async () => {
    const auth = authContext();

    await commerceRepository.listProducts({ auth });
    await commerceRepository.getProduct(1, { auth });
    await commerceRepository.listOrders({ auth });
    await commerceRepository.getOrder(500, { auth });

    const requests = [...catalogStub.requests, ...checkoutStub.requests];
    assert.equal(requests.length, 4);
    for (const request of requests) assertCarriesSession(request);
  });

  test("keeps the session on the fallback read when a per-order route is missing", async () => {
    // Some checkout deployments have no `GET /orders/{id}`; the repository then
    // picks the order out of the merchant's own list, which must stay scoped.
    checkoutStub.respond((request) =>
      request.path === "/orders"
        ? { status: 200, body: [orderPayload({ id: 500 })] }
        : { status: 404, body: { detail: "not found" } },
    );

    const order = await commerceRepository.getOrder(500, { auth: authContext() });

    assert.equal(order?.id, 500);
    assert.equal(checkoutStub.requests.length, 2);
    for (const request of checkoutStub.requests) assertCarriesSession(request);
  });

  test("passes the merchant's filters upstream rather than filtering locally", async () => {
    const auth = authContext();

    await commerceRepository.listProducts({ auth, category: "coffee", isActive: true, limit: 5, offset: 10 });
    await commerceRepository.listOrders({ auth, status: "paid", limit: 3 });

    assert.deepEqual(catalogStub.lastRequest.query, {
      category: "coffee",
      is_active: "true",
      limit: "5",
      offset: "10",
    });
    assert.deepEqual(checkoutStub.lastRequest.query, { status: "paid", limit: "3" });
  });

  test("never caches a merchant-scoped response", async (t) => {
    const realFetch = globalThis.fetch;
    const calls: RequestInit[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return realFetch(input, init);
    }) as typeof fetch;
    t.after(() => {
      globalThis.fetch = realFetch;
    });

    await commerceRepository.listProducts({ auth: authContext() });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.cache, "no-store");
    assert.equal(calls[0]!.body, undefined);
  });
});

describe("resolving the caller outside an inbound request", () => {
  test("falls back to the configured merchant and forwards nothing", () => {
    // `headers()` throws outside a request scope — a background job or a test —
    // and there is then no session to replay.
    const auth = getCommerceAuthContext();

    assert.equal(auth.merchantId, TEST_MERCHANT_ID);
    assert.deepEqual(auth.forwardedHeaders, {});
  });
});

describe("the tools the assistant calls", () => {
  beforeEach(serveCommerceReads);

  test("forward the session they were given", async () => {
    const context = { auth: authContext() };

    await executeCommerceTool("list_products", "{}", context);
    await executeCommerceTool("get_product", '{"productId":1}', context);
    await executeCommerceTool("list_orders", "{}", context);
    await executeCommerceTool("get_order", '{"orderId":500}', context);

    const requests = [...catalogStub.requests, ...checkoutStub.requests];
    assert.equal(requests.length, 4);
    for (const request of requests) assertCarriesSession(request);
  });

  test("scope a read to the merchant in the context, not to a merchant in the arguments", async () => {
    await executeCommerceTool(
      "list_products",
      JSON.stringify({ merchantId: OTHER_MERCHANT_ID, category: "coffee" }),
      { auth: authContext({ merchantId: TEST_MERCHANT_ID }) },
    );

    // `merchantId` is not part of any tool's schema, so it cannot travel.
    assert.equal(catalogStub.lastRequest.headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID);
    assert.equal(catalogStub.lastRequest.query.merchantId, undefined);
  });

  test("tell the model when the forwarded session was rejected", async () => {
    catalogStub.respondWith({ status: 403, body: { detail: "merchant mismatch" } });

    const outcome = await executeCommerceTool("list_products", "{}", { auth: authContext() });

    assert.equal(outcome.ok, false);
    assert.match(
      JSON.stringify(outcome.payload),
      /catalog service rejected this merchant's session/,
    );
  });

  test("report an upstream status and a malformed payload differently", async () => {
    catalogStub.respondWith({ status: 500, body: { detail: "boom" } });
    const failed = await executeCommerceTool("list_products", "{}", { auth: authContext() });
    assert.match(JSON.stringify(failed.payload), /catalog service returned 500/);

    catalogStub.respondWith({ status: 200, body: { products: "not a list" } });
    const garbled = await executeCommerceTool("list_products", "{}", { auth: authContext() });
    assert.match(JSON.stringify(garbled.payload), /unexpected payload/);
  });
});

describe("errors the commerce client raises", () => {
  test("classify a rejected session apart from a missing record", async () => {
    catalogStub.respondWith({ status: 401, body: { detail: "no session" } });
    const unauthorized = await rejection(() =>
      getJson("catalog", "/products", productListPayloadSchema, { auth: authContext() }),
    );
    assert.ok(unauthorized instanceof CommerceApiError);
    assert.equal(unauthorized.isUnauthorized, true);
    assert.equal(unauthorized.isNotFound, false);
    assert.equal(unauthorized.service, "catalog");

    catalogStub.respondWith({ status: 404, body: { detail: "gone" } });
    const missing = await rejection(() =>
      getJson("catalog", "/products", productListPayloadSchema, { auth: authContext() }),
    );
    assert.ok(missing instanceof CommerceApiError);
    assert.equal(missing.isNotFound, true);
    assert.equal(missing.isUnauthorized, false);
  });

  test("name the offending fields when a payload does not match", async () => {
    catalogStub.respondWith({ status: 200, body: [{ name: "no id" }] });

    const error = await rejection(() =>
      getJson("catalog", "/products", productListPayloadSchema, { auth: authContext() }),
    );

    assert.ok(error instanceof CommerceResponseError);
    assert.equal(error.service, "catalog");
    assert.ok(error.issues.length > 0);
  });
});

describe("a chat turn's commerce reads", () => {
  beforeEach(() => {
    seedProviderKey();
    serveCommerceReads();
  });

  test("carry the session the caller handed the chat service", async () => {
    openaiStub.respondInSequence([
      chatToolCallReply([{ name: "list_products", arguments: { category: "coffee" } }]),
      chatAnswerReply("You have 1 coffee product."),
    ]);

    const auth = authContext({
      forwardedHeaders: {
        cookie: "session=chat-session",
        authorization: "Bearer chat-token",
        "x-request-id": "req-chat-1",
      },
    });
    const result = await runChatCompletion(
      chatTurn("How much coffee do I have?"),
      { merchantId: TEST_MERCHANT_ID, auth },
    );

    assert.equal(result.ok, true);
    const { headers, query } = catalogStub.lastRequest;
    assert.equal(headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID);
    assert.equal(headers.cookie, "session=chat-session");
    assert.equal(headers.authorization, "Bearer chat-token");
    assert.equal(headers["x-request-id"], "req-chat-1");
    assert.equal(query.category, "coffee");
  });

  test("report the reads that were made, so the UI can show its work", async () => {
    openaiStub.respondInSequence([
      chatToolCallReply([
        { name: "list_products", arguments: { limit: 5 } },
        { name: "list_orders", arguments: { status: "paid" } },
      ]),
      chatAnswerReply("1 product, 1 paid order."),
    ]);

    const result = await runChatCompletion(
      chatTurn("Summarise my store"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.response.toolCalls, [
      { name: "list_products", arguments: { limit: 5 }, ok: true },
      { name: "list_orders", arguments: { status: "paid" }, ok: true },
    ]);
  });
});

describe("POST /api/chat", () => {
  beforeEach(() => {
    seedProviderKey();
    serveCommerceReads();
  });

  test("scopes the turn to the session, not to a merchantId in the body", async () => {
    openaiStub.respondInSequence([
      chatToolCallReply([{ name: "list_products", arguments: {} }]),
      chatAnswerReply("You have 1 product."),
    ]);

    // Only the session's merchant has a key on file; a body naming someone else
    // must not switch merchants, and must not fail either.
    const response = await postChat(
      chatRequest({
        merchantId: OTHER_MERCHANT_ID,
        messages: [{ role: "user", content: "What do I sell?" }],
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(catalogStub.lastRequest.headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID);
  });

  test("refuses a streaming request rather than silently answering without it", async () => {
    const response = await postChat(
      chatRequest({ messages: [{ role: "user", content: "Hi" }], stream: true }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(
      (await response.json()).errors,
      [{ path: "stream", message: "Streaming responses are not supported yet" }],
    );
    assert.equal(openaiStub.requests.length, 0);
  });
});

function chatRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Asserts a recorded request carries the default test session upstream. */
function assertCarriesSession(request: RecordedRequest): void {
  assert.equal(request.headers[MERCHANT_ID_HEADER], TEST_MERCHANT_ID, `${request.path} lost the merchant`);
  assert.equal(request.headers.cookie, "session=merchant-under-test-session", `${request.path} lost the cookie`);
  assert.equal(
    request.headers.authorization,
    "Bearer merchant-under-test-token",
    `${request.path} lost the bearer token`,
  );
}

/** Runs `action` and returns whatever it threw. Fails if it resolved. */
async function rejection<T>(action: () => Promise<unknown>): Promise<T> {
  try {
    await action();
  } catch (error) {
    return error as T;
  }
  assert.fail("expected the call to reject");
}
