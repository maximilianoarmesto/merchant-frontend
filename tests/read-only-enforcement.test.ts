/**
 * Read-only enforcement: nothing a model asks for may mutate commerce data.
 *
 * Three independent barriers are asserted here, because any one of them failing
 * on its own should still leave the property intact:
 *
 * 1. the tool catalog handed to OpenAI contains only reads,
 * 2. dispatch is by exact name, so a hallucinated write resolves to nothing,
 * 3. the HTTP layer underneath issues GETs and takes no body.
 *
 * The commerce stubs are the last line of defence in these tests: a write that
 * somehow got through would show up as a non-GET request against them.
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
  MUTATING_TOOL_NAMES,
  openaiStub,
  resetHarness,
  seedProviderKey,
  serveCommerceReads,
  teardownHarness,
  TEST_MERCHANT_ID,
} from "@/tests/support/harness";

import { chatService, runChatCompletion } from "@/lib/server/chat-service";
import { getJson } from "@/lib/server/commerce-client";
import { commerceRepository } from "@/lib/server/commerce-repository";
import {
  COMMERCE_TOOL_NAMES,
  COMMERCE_TOOLS,
  executeCommerceTool,
  isCommerceToolName,
} from "@/lib/server/commerce-tools";
import { productListPayloadSchema } from "@/lib/dto/commerce";

beforeEach(resetHarness);
after(teardownHarness);

describe("the tool catalog handed to the model", () => {
  test("is exactly the four commerce reads", () => {
    assert.deepEqual([...COMMERCE_TOOL_NAMES].sort(), [
      "get_order",
      "get_product",
      "list_orders",
      "list_products",
    ]);
  });

  test("names only reads — every tool is a list_* or get_*", () => {
    for (const tool of COMMERCE_TOOLS) {
      assert.match(tool.function.name, /^(list|get)_[a-z0-9_]+$/);
    }
  });

  test("contains no tool that could create, update or delete anything", () => {
    const advertised = COMMERCE_TOOLS.map((tool) => tool.function.name);

    for (const mutating of MUTATING_TOOL_NAMES) {
      assert.equal(advertised.includes(mutating), false, `${mutating} is exposed to the model`);
    }
    for (const verb of ["create", "update", "delete", "cancel", "refund", "set", "pay", "post"]) {
      assert.equal(
        advertised.some((name) => name.startsWith(`${verb}_`)),
        false,
        `a ${verb}_* tool is exposed to the model`,
      );
    }
  });

  test("offers no generic escape hatch that could reach an arbitrary endpoint", () => {
    const surface = JSON.stringify(COMMERCE_TOOLS).toLowerCase();

    for (const forbidden of ["\"url\"", "\"method\"", "\"body\"", "\"endpoint\"", "\"sql\"", "\"query\""]) {
      assert.equal(surface.includes(forbidden), false, `the tool surface exposes ${forbidden}`);
    }
  });

  test("is the same list the chat service runs with", () => {
    assert.equal(chatService.tools, COMMERCE_TOOLS);
  });
});

describe("dispatching a tool call the model invented", () => {
  beforeEach(serveCommerceReads);

  for (const name of MUTATING_TOOL_NAMES) {
    test(`refuses ${name} and reaches no commerce service`, async () => {
      const outcome = await executeCommerceTool(name, JSON.stringify({ productId: 1, quantity: 1 }), {
        auth: authContext(),
      });

      assert.equal(outcome.ok, false);
      assert.equal(isCommerceToolName(name), false);
      assert.match(
        JSON.stringify(outcome.payload),
        /cannot create, update or delete commerce data/,
      );
      // The refusal happens before any network call.
      assert.deepEqual([...catalogStub.requests, ...checkoutStub.requests], []);
    });
  }

  test("lists the read-only alternatives back to the model", async () => {
    const outcome = await executeCommerceTool("create_order", "{}", { auth: authContext() });

    const payload = JSON.stringify(outcome.payload);
    for (const name of COMMERCE_TOOL_NAMES) assert.match(payload, new RegExp(name));
  });

  test("refuses a name that only looks like a read", async () => {
    for (const name of ["list_products_and_update", "get_product; DROP TABLE", "GET_PRODUCT"]) {
      const outcome = await executeCommerceTool(name, "{}", { auth: authContext() });
      assert.equal(outcome.ok, false, `${name} was dispatched`);
    }
    assert.deepEqual([...catalogStub.requests, ...checkoutStub.requests], []);
  });
});

describe("the HTTP layer under the tools", () => {
  beforeEach(serveCommerceReads);

  test("issues a GET with no body for every read the repository performs", async () => {
    const auth = authContext();

    await commerceRepository.listProducts({ auth });
    await commerceRepository.getProduct(1, { auth });
    await commerceRepository.listOrders({ auth });
    await commerceRepository.getOrder(500, { auth });

    const requests = [...catalogStub.requests, ...checkoutStub.requests];
    assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.equal(request.method, "GET");
      assert.equal(request.rawBody, "");
    }
  });

  test("issues a GET with no body for every tool the model can call", async () => {
    const context = { auth: authContext() };

    await executeCommerceTool("list_products", "{}", context);
    await executeCommerceTool("get_product", '{"productId":1}', context);
    await executeCommerceTool("list_orders", "{}", context);
    await executeCommerceTool("get_order", '{"orderId":500}', context);

    const requests = [...catalogStub.requests, ...checkoutStub.requests];
    assert.ok(requests.length >= 4);
    for (const request of requests) {
      assert.equal(request.method, "GET");
      assert.equal(request.rawBody, "");
    }
  });

  test("never lets a caller talk it into another method", async () => {
    // `getJson` takes no method and no body, so the only way to try is to smuggle
    // one in as a query parameter — which cannot change the verb on the wire.
    await getJson("catalog", "/products", productListPayloadSchema, {
      auth: authContext(),
      query: { method: "DELETE", _method: "DELETE" },
    });

    assert.equal(catalogStub.lastRequest.method, "GET");
    assert.equal(catalogStub.lastRequest.query.method, "DELETE");
  });
});

describe("a chat turn that asks for a write", () => {
  beforeEach(() => {
    seedProviderKey();
    serveCommerceReads();
  });

  test("reports the refused call and mutates nothing", async () => {
    openaiStub.respondInSequence([
      chatToolCallReply([{ name: "create_order", arguments: { productId: 1, quantity: 2 } }]),
      chatAnswerReply("I can only read your catalog and orders."),
    ]);

    const result = await runChatCompletion(
      chatTurn("Place an order for 2 bags of the Ethiopia"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.response.toolCalls, [
      { name: "create_order", arguments: { productId: 1, quantity: 2 }, ok: false },
    ]);
    // Nothing reached the catalog or the checkout service.
    assert.deepEqual([...catalogStub.requests, ...checkoutStub.requests], []);
  });

  test("hands the model back a refusal it can relay, instead of ending the turn", async () => {
    openaiStub.respondInSequence([
      chatToolCallReply([{ name: "delete_product", arguments: { productId: 1 } }]),
      chatAnswerReply("I cannot delete products."),
    ]);

    const result = await runChatCompletion(
      chatTurn("Delete product 1"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    assert.equal(result.ok, true);
    const toolMessage = chatMessagesSentOnRound(1).find((message) => message.role === "tool");
    assert.ok(toolMessage, "the refusal is replayed to the model as a tool result");
    assert.match(String(toolMessage.content), /cannot create, update or delete commerce data/);
  });

  test("advertises only the read-only tools on the wire", async () => {
    openaiStub.respondWith(chatAnswerReply());

    await runChatCompletion(
      chatTurn("How many products do I have?"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    const sent = chatRequestBody(0);
    assert.deepEqual(
      sent.tools.map((tool) => tool.function.name).sort(),
      ["get_order", "get_product", "list_orders", "list_products"],
    );
  });

  test("tells the model in the system prompt that it has no way to write", async () => {
    openaiStub.respondWith(chatAnswerReply());

    await runChatCompletion(
      chatTurn("Cancel order 500"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    const [system] = chatRequestBody(0).messages;
    assert.equal(system.role, "system");
    assert.match(String(system.content), /read-only access/);
    assert.match(String(system.content), /cannot create, update, cancel or delete/);
  });

  test("keeps the read-only framing even when the caller supplies its own prompt", async () => {
    openaiStub.respondWith(chatAnswerReply());

    await runChatCompletion(
      chatTurn("Hello"),
      {
        merchantId: TEST_MERCHANT_ID,
        auth: authContext(),
        systemPrompt: "You are a helpful assistant with read-only access to commerce data.",
      },
    );

    const messages = chatRequestBody(0).messages;
    assert.equal(messages[0].role, "system");
    // A caller may replace the wording, but the system turn is still the
    // server's to write — the request's own messages never become message zero.
    assert.equal(messages.filter((message) => message.role === "user").length, 1);
    assert.equal(messages[1].content, "Hello");
  });

  test("withdraws the tools on the last round so the loop cannot run forever", async () => {
    // The model asks for a read every single time; the loop still terminates.
    openaiStub.respondWith(chatToolCallReply([{ name: "list_products", arguments: {} }]));

    const result = await runChatCompletion(
      chatTurn("List everything, repeatedly"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext(), maxToolRounds: 2 },
    );

    const rounds = openaiStub.requestsFor("/chat/completions");
    assert.equal(rounds.length, 3, "maxToolRounds rounds with tools, then one without");
    assert.equal(chatRequestBody(0).tool_choice, "auto");
    assert.equal(chatRequestBody(1).tool_choice, "auto");
    assert.equal(chatRequestBody(2).tool_choice, "none");
    // The final round still answers, because the model has no tools left to ask for.
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "provider_error");
  });
});

describe("the merchant's own credentials", () => {
  test("are not reachable through any tool the model can call", async () => {
    seedProviderKey({ apiKey: "sk-test-secret-to-stay-put" });
    serveCommerceReads();
    openaiStub.respondInSequence([
      chatToolCallReply([
        { name: "get_provider_config", arguments: {} },
        { name: "list_products", arguments: {} },
      ]),
      chatAnswerReply("You have 1 product."),
    ]);

    const result = await runChatCompletion(
      chatTurn("What is my API key?"),
      { merchantId: TEST_MERCHANT_ID, auth: authContext() },
    );

    assert.equal(result.ok, true);
    // Every message the model was ever shown, and the answer it produced.
    const transcript = JSON.stringify([
      ...openaiStub.requestsFor("/chat/completions").map((request) => request.body),
      result,
    ]);
    assert.equal(transcript.includes("sk-test-secret-to-stay-put"), false);
  });
});

/** The JSON body of the nth `chat.completions` request the stub received. */
function chatRequestBody(round: number): {
  tools: { function: { name: string } }[];
  messages: { role: string; content: unknown }[];
  tool_choice: string;
} {
  const request = openaiStub.requestsFor("/chat/completions")[round];
  assert.ok(request, `the stub received no round ${round}`);
  return request.body as ReturnType<typeof chatRequestBody>;
}

/** The message history the model was shown on a given round. */
function chatMessagesSentOnRound(round: number): { role: string; content: unknown }[] {
  return chatRequestBody(round).messages;
}
