import {
  commerceTools,
  createCommerceTools,
  type CommerceToolDeps,
} from "../chat-tools";
import type { ToolDefinition } from "../chat-adapter";
import type {
  CheckoutSession,
  Order,
  Product,
} from "../api";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Widget",
    description: "A widget",
    price: 9.99,
    currency: "USD",
    stock: 10,
    category: "things",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<CheckoutSession> = {}): CheckoutSession {
  return {
    id: "sess_abc",
    product_id: 1,
    product_name: "Widget",
    quantity: 1,
    unit_price: 9.99,
    total_amount: 9.99,
    currency: "USD",
    status: "created",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    checkout_session_id: "sess_abc",
    product_id: 1,
    product_name: "Widget",
    quantity: 1,
    total_amount: 9.99,
    currency: "USD",
    payment_status: "paid",
    order_status: "completed",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CommerceToolDeps> = {}): {
  deps: CommerceToolDeps;
  calls: {
    listProducts: number;
    getProduct: Array<number | string>;
    createSession: Array<[number, number]>;
    paySession: string[];
    listOrders: number;
  };
} {
  const calls = {
    listProducts: 0,
    getProduct: [] as Array<number | string>,
    createSession: [] as Array<[number, number]>,
    paySession: [] as string[],
    listOrders: 0,
  };
  const deps: CommerceToolDeps = {
    catalog: {
      listProducts: async () => {
        calls.listProducts += 1;
        return [makeProduct()];
      },
      getProduct: async (id) => {
        calls.getProduct.push(id);
        return makeProduct({ id: Number(id) });
      },
      ...(overrides.catalog ?? {}),
    },
    checkout: {
      createSession: async (productId, quantity) => {
        calls.createSession.push([productId, quantity]);
        return makeSession({ product_id: productId, quantity });
      },
      paySession: async (sessionId) => {
        calls.paySession.push(sessionId);
        return makeOrder({ checkout_session_id: sessionId });
      },
      listOrders: async () => {
        calls.listOrders += 1;
        return [makeOrder()];
      },
      ...(overrides.checkout ?? {}),
    },
  };
  return { deps, calls };
}

function byName(tools: ToolDefinition[], name: string): ToolDefinition {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

const EXPECTED_TOOL_NAMES = [
  "list_products",
  "get_product",
  "create_checkout_session",
  "process_payment",
  "list_orders",
];

describe("commerceTools — shape (AC1, AC2)", () => {
  it("exposes exactly 5 tools by name", () => {
    expect(commerceTools.map((t) => t.name).sort()).toEqual(
      EXPECTED_TOOL_NAMES.slice().sort()
    );
  });

  it("each tool has a name, description, and JSON Schema parameters object", () => {
    for (const tool of commerceTools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      // AC2: descriptions long enough to guide the LLM, not 5-word stubs.
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.parameters).toBeTruthy();
      expect((tool.parameters as { type?: string }).type).toBe("object");
      expect(
        (tool.parameters as { properties?: unknown }).properties
      ).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("create_checkout_session declares product_id and quantity as required", () => {
    const tool = byName(commerceTools, "create_checkout_session");
    const required = (tool.parameters as { required?: string[] }).required ?? [];
    expect(required).toEqual(expect.arrayContaining(["product_id", "quantity"]));
  });

  it("get_product declares id as required", () => {
    const tool = byName(commerceTools, "get_product");
    const required = (tool.parameters as { required?: string[] }).required ?? [];
    expect(required).toContain("id");
  });

  it("process_payment declares session_id as required", () => {
    const tool = byName(commerceTools, "process_payment");
    const required = (tool.parameters as { required?: string[] }).required ?? [];
    expect(required).toContain("session_id");
  });
});

describe("commerceTools — routing to lib/api.ts (AC3)", () => {
  it("list_products dispatches to catalogApi.listProducts", async () => {
    const { deps, calls } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "list_products").execute({});
    expect(calls.listProducts).toBe(1);
    expect(JSON.parse(out as string)).toEqual([makeProduct()]);
  });

  it("get_product dispatches to catalogApi.getProduct with the id arg", async () => {
    const { deps, calls } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "get_product").execute({ id: 42 });
    expect(calls.getProduct).toEqual([42]);
    expect(JSON.parse(out as string).id).toBe(42);
  });

  it("create_checkout_session dispatches to checkoutApi.createSession with product_id and quantity", async () => {
    const { deps, calls } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "create_checkout_session").execute({
      product_id: 7,
      quantity: 3,
    });
    expect(calls.createSession).toEqual([[7, 3]]);
    const parsed = JSON.parse(out as string);
    expect(parsed.product_id).toBe(7);
    expect(parsed.quantity).toBe(3);
  });

  it("process_payment dispatches to checkoutApi.paySession with the session_id arg", async () => {
    const { deps, calls } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "process_payment").execute({
      session_id: "sess_xyz",
    });
    expect(calls.paySession).toEqual(["sess_xyz"]);
    expect(JSON.parse(out as string).checkout_session_id).toBe("sess_xyz");
  });

  it("list_orders dispatches to checkoutApi.listOrders", async () => {
    const { deps, calls } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "list_orders").execute({});
    expect(calls.listOrders).toBe(1);
    expect(JSON.parse(out as string)).toEqual([makeOrder()]);
  });
});

describe("commerceTools — error handling (AC4)", () => {
  it("returns 'Error: ...' string on 404 from get_product", async () => {
    const { deps } = makeDeps({
      catalog: {
        listProducts: async () => [makeProduct()],
        getProduct: async () => {
          throw new Error("404 Product not found");
        },
      },
    });
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "get_product").execute({ id: 999 });
    expect(typeof out).toBe("string");
    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toMatch(/404/);
  });

  it("returns 'Error: ...' string on 409 stock error from create_checkout_session", async () => {
    const { deps } = makeDeps({
      checkout: {
        createSession: async () => {
          throw new Error("409 Insufficient stock");
        },
        paySession: async () => makeOrder(),
        listOrders: async () => [],
      },
    });
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "create_checkout_session").execute({
      product_id: 1,
      quantity: 9999,
    });
    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toMatch(/409|stock/i);
  });

  it("returns 'Error: ...' string on network failure from list_products", async () => {
    const { deps } = makeDeps({
      catalog: {
        listProducts: async () => {
          throw new TypeError("fetch failed");
        },
        getProduct: async () => makeProduct(),
      },
    });
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "list_products").execute({});
    expect(out as string).toMatch(/^Error:/);
    expect(out as string).toMatch(/fetch failed/);
  });

  it("returns 'Error: ...' string when required arg is missing", async () => {
    const { deps } = makeDeps();
    const tools = createCommerceTools(deps);
    const out = await byName(tools, "get_product").execute({});
    expect(out as string).toMatch(/^Error:.*id/);
  });

  it("execute never throws — errors are returned as strings", async () => {
    const { deps } = makeDeps({
      catalog: {
        listProducts: async () => {
          throw new Error("boom");
        },
        getProduct: async () => {
          throw new Error("boom");
        },
      },
      checkout: {
        createSession: async () => {
          throw new Error("boom");
        },
        paySession: async () => {
          throw new Error("boom");
        },
        listOrders: async () => {
          throw new Error("boom");
        },
      },
    });
    const tools = createCommerceTools(deps);
    for (const tool of tools) {
      await expect(
        Promise.resolve(tool.execute({ id: 1, product_id: 1, quantity: 1, session_id: "s" }))
      ).resolves.toMatch(/^Error:/);
    }
  });
});

describe("commerceTools — shared shape usable by both adapters (AC5)", () => {
  it("default commerceTools constant uses real api modules (not throwing on import)", () => {
    expect(Array.isArray(commerceTools)).toBe(true);
    expect(commerceTools).toHaveLength(5);
  });

  it("each tool conforms to the ToolDefinition contract consumed by OpenAIAdapter and AnthropicAdapter", () => {
    const requiredKeys: Array<keyof ToolDefinition> = [
      "name",
      "description",
      "parameters",
      "execute",
    ];
    for (const tool of commerceTools) {
      for (const k of requiredKeys) {
        expect(tool[k]).toBeDefined();
      }
    }
  });

  it("can be mapped into OpenAI function-tool format without losing fields", () => {
    const openaiTools = commerceTools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    expect(openaiTools).toHaveLength(5);
    for (const tool of openaiTools) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect((tool.function.parameters as { type?: string }).type).toBe("object");
    }
  });

  it("can be mapped into Anthropic tool format (input_schema) without losing fields", () => {
    const anthropicTools = commerceTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
    expect(anthropicTools).toHaveLength(5);
    for (const tool of anthropicTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect((tool.input_schema as { type?: string }).type).toBe("object");
    }
  });
});
