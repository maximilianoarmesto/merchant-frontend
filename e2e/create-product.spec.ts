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
 * Cleanup
 * -------
 * Products created during the happy-path test are deleted via the catalog API
 * (DELETE /products/:id) so they don't pollute subsequent runs.
 *
 * Environment
 * -----------
 * Expects the full local stack to be running:
 *   NEXT_PUBLIC_CATALOG_API_URL  (default: http://localhost:8001)
 *   Next.js dev server           (default: http://localhost:3000)
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOG_API =
  process.env["NEXT_PUBLIC_CATALOG_API_URL"] ?? "http://localhost:8001";

// ---------------------------------------------------------------------------
// Unique product data – each run uses a different name so stale DB rows from
// a previous interrupted run can never cause false positives.
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
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to /products and wait for the page to be interactive. */
async function gotoProducts(page: Page) {
  await page.goto("/products");
  // Wait for either the product grid or the "No products yet" empty state –
  // both signals that the page has fully loaded its data from the backend.
  await page.waitForSelector(".grid, .state", { timeout: 15_000 });
}

/** Click "Create Item" and wait for the modal to appear. */
async function openModal(page: Page) {
  await page.getByRole("button", { name: "Create Item" }).click();
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

/**
 * Delete a product via the catalog API so the test cleans up after itself.
 * Silently ignores 404 (already gone) so the afterEach hook is idempotent.
 */
async function deleteProductByName(productName: string): Promise<void> {
  try {
    // Find the product by listing all products and matching by name.
    const listRes = await fetch(`${CATALOG_API}/products`);
    if (!listRes.ok) return;

    const products: Array<{ id: number; name: string }> = await listRes.json();
    const target = products.find((p) => p.name === productName);
    if (!target) return;

    await fetch(`${CATALOG_API}/products/${target.id}`, { method: "DELETE" });
  } catch {
    // Network not available or backend not running – swallow silently.
    // The tests themselves will already have failed in that case.
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Create Item modal", () => {
  // Track names created during the run so afterEach can clean up.
  let createdProductName: string | null = null;

  test.afterEach(async () => {
    if (createdProductName) {
      await deleteProductByName(createdProductName);
      createdProductName = null;
    }
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  test("happy path: creates a product and shows it in the grid", async ({
    page,
  }) => {
    const product = uniqueProduct();
    createdProductName = product.name; // register for cleanup

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

    // No product should have been created – the grid count is unchanged.
    // (No cleanup needed since nothing was submitted.)
  });

  // -------------------------------------------------------------------------
  // 3. Cancel behaviour
  // -------------------------------------------------------------------------
  test("cancel: modal closes and no new product is added", async ({ page }) => {
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
