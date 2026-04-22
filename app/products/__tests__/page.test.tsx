/**
 * Integration tests for app/products/page.tsx
 *
 * Strategy
 * --------
 * All network calls go through the `catalogApi` helper in lib/api.ts, which
 * uses the global `fetch`.  jest-fetch-mock replaces `global.fetch` before
 * any module is loaded (configured in jest.config.ts `setupFiles`), so we
 * drive every test by programming `fetchMock` responses rather than mocking
 * the `catalogApi` module itself.  This exercises the real API layer and
 * keeps the tests as close to production behaviour as possible.
 *
 * URL conventions (matching lib/api.ts defaults):
 *   GET  http://localhost:8001/products   → listProducts()
 *   POST http://localhost:8001/products   → createProduct()
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "jest-fetch-mock";

import ProductsPage from "../page";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRODUCT_1 = {
  id: 1,
  name: "Wireless Headphones",
  description: "Great sound quality",
  price: 49.99,
  currency: "USD",
  stock: 10,
  category: "Electronics",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const PRODUCT_2 = {
  id: 2,
  name: "Mechanical Keyboard",
  description: "Clicky and fast",
  price: 129.0,
  currency: "USD",
  stock: 5,
  category: "Peripherals",
  is_active: true,
  created_at: "2024-01-02T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
};

const CREATED_PRODUCT = {
  id: 3,
  name: "USB-C Hub",
  description: "7-in-1 hub",
  price: 39.99,
  currency: "USD",
  stock: 20,
  category: "Accessories",
  is_active: true,
  created_at: "2024-01-03T00:00:00Z",
  updated_at: "2024-01-03T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** JSON-stringify a body with the correct Content-Type header. */
function jsonResponse(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    status,
    headers: { "Content-Type": "application/json" },
  };
}

/**
 * Program fetchMock so that:
 *   - The first GET /products returns `initialList`
 *   - A subsequent GET /products returns `refreshedList` (optional)
 *   - A POST /products returns `createdProduct` (optional)
 *
 * Uses `fetchMock.mockResponse` with a conditional handler so we can
 * distinguish GETs from POSTs and track call counts independently.
 */
function setupFetchMock({
  initialList = [PRODUCT_1, PRODUCT_2],
  refreshedList = [PRODUCT_1, PRODUCT_2, CREATED_PRODUCT],
  createdProduct = CREATED_PRODUCT,
  getCallsBeforeRefresh = 1,
}: {
  initialList?: object[];
  refreshedList?: object[];
  createdProduct?: object;
  /** How many GET calls should return `initialList` before switching to `refreshedList`. */
  getCallsBeforeRefresh?: number;
} = {}) {
  let getCount = 0;

  fetchMock.mockResponse((req) => {
    const url = new URL(req.url);
    const isProductsEndpoint = url.pathname === "/products";

    if (req.method === "GET" && isProductsEndpoint) {
      getCount += 1;
      const list = getCount <= getCallsBeforeRefresh ? initialList : refreshedList;
      return Promise.resolve(jsonResponse(list));
    }

    if (req.method === "POST" && isProductsEndpoint) {
      return Promise.resolve(jsonResponse(createdProduct, 201));
    }

    // Any unexpected request — fail loudly so it doesn't go unnoticed.
    return Promise.reject(new Error(`Unexpected fetch: ${req.method} ${req.url}`));
  });

  /** Expose a getter so tests can inspect the count without coupling to internals. */
  return {
    getGetCount: () => getCount,
  };
}

/** Render the page and wait until the loading skeleton is gone. */
async function renderAndWait() {
  const utils = render(<ProductsPage />);
  // The page sets aria-busy on the skeleton grid; wait for it to disappear.
  await waitFor(() =>
    expect(utils.container.querySelector("[aria-busy]")).not.toBeInTheDocument(),
  );
  return utils;
}

/** Fill the required fields in the open CreateProductModal. */
async function fillModal(
  user: ReturnType<typeof userEvent.setup>,
  {
    name = "USB-C Hub",
    price = "39.99",
    stock = "20",
    category = "Accessories",
  }: { name?: string; price?: string; stock?: string; category?: string } = {},
) {
  await user.clear(screen.getByLabelText(/name/i));
  await user.type(screen.getByLabelText(/name/i), name);

  await user.clear(screen.getByLabelText(/price/i));
  await user.type(screen.getByLabelText(/price/i), price);

  await user.clear(screen.getByLabelText(/stock/i));
  await user.type(screen.getByLabelText(/stock/i), stock);

  await user.clear(screen.getByLabelText(/category/i));
  await user.type(screen.getByLabelText(/category/i), category);
}

// ---------------------------------------------------------------------------
// Global mock hygiene
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.enableMocks();
});

// ===========================================================================
// 1. "Create Item" button is present in the rendered page
// ===========================================================================
describe('"Create Item" button', () => {
  it("is present in the rendered page", async () => {
    setupFetchMock();
    await renderAndWait();

    expect(
      screen.getByRole("button", { name: /create a new product/i }),
    ).toBeInTheDocument();
  });

  it('has the visible label "Create Item"', async () => {
    setupFetchMock();
    await renderAndWait();

    expect(
      screen.getByRole("button", { name: /create a new product/i }),
    ).toHaveTextContent("Create Item");
  });
});

// ===========================================================================
// 2. Clicking "Create Item" opens the CreateProductModal
// ===========================================================================
describe("clicking Create Item opens the modal", () => {
  it("shows the modal after clicking the Create Item button", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    // Modal must not exist before the click
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));

    expect(screen.getByRole("dialog", { name: /new product/i })).toBeInTheDocument();
  });

  it('renders the "New Product" heading inside the modal', async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));

    expect(
      screen.getByRole("heading", { name: /new product/i }),
    ).toBeInTheDocument();
  });

  it("renders the modal form fields after opening", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/stock/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  });
});

// ===========================================================================
// 3. Submitting valid data triggers a POST /products API call
// ===========================================================================
describe("submitting valid modal data triggers POST /products", () => {
  it("issues a POST to /products when the form is submitted", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // Wait until the POST has been made
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/products") &&
          (init as RequestInit)?.method === "POST",
      );
      expect(postCalls).toHaveLength(1);
    });
  });

  it("sends the correct JSON payload in the POST body", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user, {
      name: "USB-C Hub",
      price: "39.99",
      stock: "20",
      category: "Accessories",
    });
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          typeof url === "string" &&
          url.endsWith("/products") &&
          (init as RequestInit)?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        name: "USB-C Hub",
        price: 39.99,
        stock: 20,
        category: "Accessories",
        currency: "USD",
      });
    });
  });
});

// ===========================================================================
// 4. After successful creation, the modal closes
// ===========================================================================
describe("modal closes after successful creation", () => {
  it("removes the modal from the DOM after a successful POST", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it('shows the "Create Item" button again once the modal is closed', async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // After close the button must be focusable / visible again
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /create a new product/i }),
      ).toBeInTheDocument(),
    );
  });
});

// ===========================================================================
// 5. After successful creation the product list re-fetches and the new product
//    appears in the grid
// ===========================================================================
describe("product list re-fetches after successful creation", () => {
  it("issues a second GET /products after the modal is submitted", async () => {
    const { getGetCount } = setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    // One GET /products has been made for the initial load
    expect(getGetCount()).toBe(1);

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // Wait until the re-fetch has happened
    await waitFor(() => expect(getGetCount()).toBe(2));
  });

  it("displays the newly created product in the grid after re-fetch", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    // The new product must not exist yet
    expect(screen.queryByText("USB-C Hub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // After re-fetch the refreshed list (includes CREATED_PRODUCT) should render
    await waitFor(() =>
      expect(screen.getByText("USB-C Hub")).toBeInTheDocument(),
    );
  });

  it("updates the item count badge to reflect the new total", async () => {
    setupFetchMock({
      initialList: [PRODUCT_1, PRODUCT_2],
      refreshedList: [PRODUCT_1, PRODUCT_2, CREATED_PRODUCT],
    });
    const user = userEvent.setup();
    await renderAndWait();

    // Before: 2 items
    expect(screen.getByText("2 items")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    // After re-fetch: 3 items
    await waitFor(() =>
      expect(screen.getByText("3 items")).toBeInTheDocument(),
    );
  });

  it("shows all pre-existing products alongside the new one", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByText("USB-C Hub")).toBeInTheDocument(),
    );

    // Pre-existing products should still be in the grid
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
    expect(screen.getByText("Mechanical Keyboard")).toBeInTheDocument();
  });
});

// ===========================================================================
// 6. Cancelling the modal closes it without triggering a list re-fetch
// ===========================================================================
describe("cancelling the modal", () => {
  it("removes the modal from the DOM when Cancel is clicked", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does NOT issue a second GET /products when Cancel is clicked", async () => {
    const { getGetCount } = setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    expect(getGetCount()).toBe(1);

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Give any stray async work a chance to settle
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Still only the initial fetch — no re-fetch triggered
    expect(getGetCount()).toBe(1);
  });

  it("does NOT issue a POST /products when Cancel is clicked", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    // Fill the form but then cancel instead of saving
    await fillModal(user);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        typeof url === "string" &&
        url.endsWith("/products") &&
        (init as RequestInit)?.method === "POST",
    );
    expect(postCalls).toHaveLength(0);
  });

  it("does NOT issue a second GET /products when the ✕ close button is clicked", async () => {
    const { getGetCount } = setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await user.click(screen.getByRole("button", { name: /close modal/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(getGetCount()).toBe(1);
  });

  it("does NOT issue a second GET /products when the backdrop is clicked", async () => {
    const { getGetCount } = setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    // Click the backdrop (the dialog element itself, outside the panel)
    await user.click(screen.getByRole("dialog"));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(getGetCount()).toBe(1);
  });

  it("preserves the existing product list after cancelling", async () => {
    setupFetchMock();
    const user = userEvent.setup();
    await renderAndWait();

    // Both products should already be displayed
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
    expect(screen.getByText("Mechanical Keyboard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create a new product/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // The grid should still show the same products
    expect(screen.getByText("Wireless Headphones")).toBeInTheDocument();
    expect(screen.getByText("Mechanical Keyboard")).toBeInTheDocument();
    // The unsubmitted product must not appear
    expect(screen.queryByText("USB-C Hub")).not.toBeInTheDocument();
  });
});
