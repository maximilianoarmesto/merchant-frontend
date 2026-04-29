/**
 * E2E tests – ChatWidget floating assistant on every page
 *
 * Scenarios covered
 * -----------------
 * 1. Widget presence — the FAB is rendered on every main page
 * 2. Expand / collapse — clicking the FAB opens and closes the panel
 * 3. Panel content — input, send button, and header are visible when open
 * 4. Toggle via close button — the ✕ button inside the panel collapses it
 * 5. Layout coexistence — the ChatWidget does not obscure main-page content
 *    (Create Item button remains clickable when widget is open)
 * 6. no_config flow — the panel shows an AI configuration error when no key
 *    is saved (mocked API response)
 * 7. Send message — the user sends a message and receives a mocked reply
 *
 * Backend mocking
 * ---------------
 * The catalog API is mocked via Playwright route interception.
 * The internal Next.js API routes (/api/ai/chat, /api/ai/config) are also
 * mocked so no real OpenAI calls are made.
 *
 * Environment
 * -----------
 * NEXT_PUBLIC_CATALOG_API_URL  (default: http://localhost:8001)
 * PLAYWRIGHT_BASE_URL          (default: http://localhost:3000)
 */

import { test, expect, type Page, type Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOG_API =
  process.env["NEXT_PUBLIC_CATALOG_API_URL"] ?? "http://localhost:8001";

// ---------------------------------------------------------------------------
// Fixture data
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

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Intercept GET /products so the page renders without a live catalog API. */
async function mockCatalogProducts(page: Page, products = [PRODUCT_1]) {
  await page.route(`${CATALOG_API}/products`, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(products),
      });
    } else {
      await route.abort("failed");
    }
  });
}

/**
 * Mock the /api/ai/chat internal route.
 *
 * @param page      Playwright page
 * @param response  The JSON body the server should return
 * @param status    HTTP status (default: 200)
 */
async function mockAiChat(
  page: Page,
  response: Record<string, unknown>,
  status = 200,
) {
  await page.route("**/api/ai/chat", async (route: Route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

/**
 * Mock GET /api/ai/config so the settings page renders without touching the
 * config file.
 */
async function mockAiConfig(
  page: Page,
  config: { hasApiKey: boolean; model: string | null } = {
    hasApiKey: false,
    model: null,
  },
) {
  await page.route("**/api/ai/config", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config),
      });
    } else {
      // Let POST pass through for the settings save tests
      await route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** Navigate to /products and wait for the page to fully load. */
async function gotoProducts(page: Page) {
  await page.goto("/products");
  await page.waitForSelector(".grid, .state", { timeout: 15_000 });
}

/** Open the chat panel and wait for it to be interactive. */
async function openChatPanel(page: Page) {
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("ChatWidget", () => {
  // -------------------------------------------------------------------------
  // 1. Widget presence on each main page
  // -------------------------------------------------------------------------
  test.describe("widget is present on main pages", () => {
    test("FAB is visible on /products", async ({ page }) => {
      await mockCatalogProducts(page);
      await gotoProducts(page);

      await expect(page.getByTestId("chat-toggle")).toBeVisible();
    });

    test("FAB is visible on /settings", async ({ page }) => {
      await mockAiConfig(page);
      await page.goto("/settings");
      await page.waitForSelector("h1", { timeout: 10_000 });

      await expect(page.getByTestId("chat-toggle")).toBeVisible();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Panel collapsed by default
  // -------------------------------------------------------------------------
  test("panel is hidden by default (collapsed)", async ({ page }) => {
    await mockCatalogProducts(page);
    await gotoProducts(page);

    await expect(page.getByTestId("chat-panel")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 3. Expand via FAB click
  // -------------------------------------------------------------------------
  test("clicking the FAB opens the chat panel", async ({ page }) => {
    await mockCatalogProducts(page);
    await gotoProducts(page);

    await page.getByTestId("chat-toggle").click();

    await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 4. Collapse via second FAB click
  // -------------------------------------------------------------------------
  test("clicking the FAB again closes the chat panel", async ({ page }) => {
    await mockCatalogProducts(page);
    await gotoProducts(page);

    await page.getByTestId("chat-toggle").click(); // open
    await expect(page.getByTestId("chat-panel")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("chat-toggle").click(); // close
    await expect(page.getByTestId("chat-panel")).not.toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 5. Collapse via close button inside panel
  // -------------------------------------------------------------------------
  test("clicking the ✕ close button collapses the panel", async ({ page }) => {
    await mockCatalogProducts(page);
    await gotoProducts(page);

    await openChatPanel(page);

    await page.getByTestId("chat-close").click();

    await expect(page.getByTestId("chat-panel")).not.toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 6. Layout coexistence — "Create Item" button remains accessible when the
  //    chat panel is open (z-index must not block main-page interactions)
  // -------------------------------------------------------------------------
  test("Create Item button is still clickable when chat panel is open", async ({
    page,
  }) => {
    await mockCatalogProducts(page);
    await gotoProducts(page);

    // Open the chat widget
    await openChatPanel(page);

    // The Create Item button must still be focusable and clickable.
    // We only verify it is not obstructed by the widget overlay.
    const createBtn = page.getByRole("button", { name: /create a new product/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // The CreateProductModal must open successfully — confirming no z-index
    // conflict between the chat panel and the modal.
    // Use the dialog's accessible name to distinguish it from the chat panel
    // (which also has role="dialog" when open).
    await expect(
      page.getByRole("dialog", { name: /new product/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Clean up — close the modal
    await page.keyboard.press("Escape");
  });

  // -------------------------------------------------------------------------
  // 7. no_config error flow — shows a helpful message when AI is unconfigured
  // -------------------------------------------------------------------------
  test("shows a configuration error when no OpenAI key is saved", async ({
    page,
  }) => {
    await mockCatalogProducts(page);
    // Chat endpoint returns the no_config error
    await mockAiChat(page, { error: "no_config" }, 400);
    await gotoProducts(page);

    await openChatPanel(page);

    await page.getByTestId("chat-input").fill("Hello!");
    await page.getByTestId("chat-send").click();

    // The widget should display a human-readable message that mentions Settings
    await expect(
      page.getByTestId("chat-messages").getByText(/settings/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 8. Happy-path send / receive
  // -------------------------------------------------------------------------
  test("sends a message and displays the assistant reply", async ({ page }) => {
    await mockCatalogProducts(page);
    await mockAiChat(page, { reply: "You have 1 product in stock." });
    await gotoProducts(page);

    await openChatPanel(page);

    await page.getByTestId("chat-input").fill("How many products do I have?");
    await page.getByTestId("chat-send").click();

    // The user message must appear immediately
    await expect(
      page.getByTestId("chat-messages").getByText("How many products do I have?"),
    ).toBeVisible({ timeout: 5_000 });

    // The assistant reply must appear after the response
    await expect(
      page.getByTestId("chat-messages").getByText("You have 1 product in stock."),
    ).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 9. Typing indicator appears while waiting for a reply
  // -------------------------------------------------------------------------
  test("shows a typing indicator while the reply is loading", async ({
    page,
  }) => {
    await mockCatalogProducts(page);
    // Delay the response long enough to observe the typing indicator
    await page.route("**/api/ai/chat", async (route: Route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ reply: "OK" }),
      });
    });
    await gotoProducts(page);

    await openChatPanel(page);

    await page.getByTestId("chat-input").fill("test");
    await page.getByTestId("chat-send").click();

    // Typing indicator must be briefly visible
    await expect(page.getByTestId("chat-typing")).toBeVisible({ timeout: 3_000 });

    // Then it must disappear once the reply arrives
    await expect(page.getByTestId("chat-typing")).not.toBeVisible({ timeout: 5_000 });
  });
});
