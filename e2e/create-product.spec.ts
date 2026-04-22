/**
 * E2E tests – "Create Item" feature on /products
 *
 * Scenarios covered
 * -----------------
 * 1. Happy path  – fill valid data → Save → modal closes → card appears in grid
 * 2. Validation  – click Save with empty fields → error messages visible, modal stays open
 * 3. Cancel      – open modal → Cancel → modal closes, no new card
 * 4. Backdrop    – open modal → click backdrop → modal closes
 *
 * Backend mocking
 * ---------------
 * All requests to the catalog API (http://localhost:8001) are intercepted via
 * Playwright's route API.  No real backend service is required.
 *
 * Environment
 * -----------
 * NEXT_PUBLIC_CATALOG_API_URL  (default: http://localhost:8001)
 * Next.js dev server is started automatically via playwright.config.ts webServer.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOG_API =
  process.env["NEXT_PUBLIC_CATALOG_API_URL"] ?? "http://localhost:8001";

// ---------------------------------------------------------------------------
// Fixture product data
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

// ---------------------------------------------------------------------------
// Unique product data – each run uses a different name so tests are independent
// ---------------------------------------------------------------------------
function uniqueProduct() {
  const ts = Date.now();
  return {
    name: `E2E Headphones ${ts}`,
    description: "Created by Playwright E2E test – safe to delete",
    price: "49.99",
    stock: "7",
    category: "E2E-Electronics",
  } as const;
}

// ---------------------------------------------------------------------------
// API route mock helpers
// ---------------------------------------------------------------------------

/**
 * Install Playwright route mocks so that all catalog API calls are handled
 * locally without a real backend.
 *
 * - GET  /products         → returns `initialProducts`
 * - POST /products         → returns the created product and queues the next
 *                            GET /products to return `initialProducts` + created
 */
async function mockCatalogApi(
  page: Page,
  initialProducts: object[],
  createdProduct?: object,
) {
  let postCount = 0;
  const productsUrl = `${CATALOG_API}/products`;

  await page.route(`${productsUrl}`, async (route: Route) => {
    const method = route.request().method().toUpperCase();

    if (method === "GET") {
      // After a successful POST, return the refreshed list that includes the
      // newly created product.
      const list =
        postCount > 0 && createdProduct
          ? [...initialProducts, createdProduct]
          : initialProducts;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(list),
      });
      return;
    }

    if (method === "POST" && createdProduct) {
      postCount += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(createdProduct),
      });
      return;
    }

    // Unexpected – abort loudly
    await route.abort("failed");
  });
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Navigate to /products and wait for the page to be interactive. */
async function gotoProducts(page: Page) {
  await page.goto("/products");
  // Wait for either the product grid or the "No products yet" empty state –
  // both signals that the page has fully loaded its data from the backend.
  await page.waitForSelector(".grid, .state", { timeout: 15_000 });
}

/** Click "Create Item" and wait for the modal to appear.
 *
 * The button carries aria-label="Create a new product"; in a real browser
 * aria-label is the accessible name and takes precedence over text content,
 * so we must match on the aria-label value, not the visible "Create Item" text.
 */
async function openModal(page: Page) {
  await page.getByRole("button", { name: /create a new product/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Fill the modal form with the given product data. */
async function fillForm(
  page: Page,
  product: ReturnType<typeof uniqueProduct>,
) {
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Name").fill(product.name);
  await dialog.getByLabel("Description").fill(product.description);
  // Price and Stock fields are type=number; .fill() works reliably.
  await dialog.getByLabel("Price").fill(product.price);
  await dialog.getByLabel("Stock").fill(product.stock);
  // Category label contains an asterisk (*) → use a partial match.
  await dialog.getByLabel("Category").fill(product.category);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Create Item modal", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  test("happy path: creates a product and shows it in the grid", async ({
    page,
  }) => {
    const product = uniqueProduct();

    const createdProduct = {
      id: 99,
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      currency: "USD",
      stock: parseInt(product.stock, 10),
      category: product.category,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await mockCatalogApi(page, [PRODUCT_1, PRODUCT_2], createdProduct);

    await gotoProducts(page);

    // Record how many cards exist before we add one.
    const initialCount = await page.locator(".card").count();

    await openModal(page);
    await fillForm(page, product);

    // Submit the form.
    await page.getByRole("button", { name: "Save" }).click();

    // Modal must close.
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // The grid must now contain a card whose heading matches our product name.
    const newCard = page
      .locator("article.card")
      .filter({ has: page.getByRole("heading", { name: product.name }) });

    await expect(newCard).toBeVisible({ timeout: 10_000 });

    // Total card count must have grown by exactly one.
    await expect(page.locator(".card")).toHaveCount(initialCount + 1, {
      timeout: 10_000,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Validation – empty required fields
  // -------------------------------------------------------------------------
  test("validation: shows errors and keeps modal open when required fields are empty", async ({
    page,
  }) => {
    await mockCatalogApi(page, [PRODUCT_1, PRODUCT_2]);

    await gotoProducts(page);
    await openModal(page);

    // Click Save without filling anything in.
    await page.getByRole("button", { name: "Save" }).click();

    const dialog = page.getByRole("dialog");

    // All four required-field errors must be visible.
    await expect(dialog.getByText("Name is required.")).toBeVisible();
    await expect(
      dialog.getByText("Price must be a number greater than 0."),
    ).toBeVisible();
    await expect(
      dialog.getByText(/stock must be a whole number/i),
    ).toBeVisible();
    await expect(dialog.getByText("Category is required.")).toBeVisible();

    // Modal must still be open.
    await expect(dialog).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Cancel behaviour
  // -------------------------------------------------------------------------
  test("cancel: modal closes and no new product is added", async ({ page }) => {
    await mockCatalogApi(page, [PRODUCT_1, PRODUCT_2]);

    await gotoProducts(page);

    const initialCount = await page.locator(".card").count();

    await openModal(page);

    // Partially fill the form to confirm that cancelling resets state.
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Should Not Appear");

    // Click Cancel.
    await page.getByRole("button", { name: "Cancel" }).click();

    // Modal must close.
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Card count must be unchanged.
    await expect(page.locator(".card")).toHaveCount(initialCount);

    // Re-open to confirm the form was reset.
    await openModal(page);
    await expect(dialog.getByLabel("Name")).toHaveValue("");

    // Close cleanly via Escape for housekeeping.
    await page.keyboard.press("Escape");
  });

  // -------------------------------------------------------------------------
  // 4. Backdrop click
  // -------------------------------------------------------------------------
  test("backdrop click: modal closes when the backdrop is clicked", async ({
    page,
  }) => {
    await mockCatalogApi(page, [PRODUCT_1, PRODUCT_2]);

    await gotoProducts(page);
    await openModal(page);

    const dialog = page.getByRole("dialog");

    // Click on the backdrop (outside the modal panel).
    // We target a corner of the dialog overlay that is guaranteed to be
    // outside the centered .modal-panel.
    await dialog.click({ position: { x: 5, y: 5 } });

    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
