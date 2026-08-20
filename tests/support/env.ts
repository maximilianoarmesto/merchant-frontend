/**
 * Test environment: the stub servers, and the configuration pointing the app at
 * them.
 *
 * `lib/config/server.ts` reads `process.env` once, at import time, and freezes
 * the result into `serverConfig` — so the stubs have to be listening and their
 * URLs exported into the environment before the first `@/lib/...` module is
 * evaluated. That is why this module is awaited from
 * `@/tests/support/register.mjs` during Node's `--import` phase rather than
 * imported from a test file: importing it there would be too late, because a
 * synchronous sibling import is evaluated without waiting for an async one.
 *
 * Nothing here may import application code, for the same reason. Fixtures that
 * need it live in `@/tests/support/harness`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { HttpStub } from "@/tests/support/http-stub";

/** Merchant the tests act as, distinct from the app's own default. */
export const TEST_MERCHANT_ID = "merchant-under-test";

/** A second merchant, for asserting that scoping actually separates them. */
export const OTHER_MERCHANT_ID = "merchant-next-door";

/** Stands in for a real `sk-...` secret; long enough to pass `apiKeySchema`. */
export const TEST_API_KEY = "sk-test-0123456789abcdefghij";

/** Throwaway directory holding this test process's SQLite file. */
const dataDir = mkdtempSync(path.join(tmpdir(), "merchant-frontend-tests-"));

/** Stands in for `api.openai.com/v1`. */
export const openaiStub = await HttpStub.start("/v1");
/** Stands in for the catalog service. */
export const catalogStub = await HttpStub.start();
/** Stands in for the checkout service. */
export const checkoutStub = await HttpStub.start();

export const stubs = [openaiStub, catalogStub, checkoutStub] as const;

Object.assign(process.env, {
  NODE_ENV: "test",

  // Every outbound call the app makes goes to a stub above. A test that reaches
  // a real provider or a real commerce service is a bug in the test.
  OPENAI_BASE_URL: openaiStub.url,
  NEXT_PUBLIC_CATALOG_API_URL: catalogStub.url,
  NEXT_PUBLIC_CHECKOUT_API_URL: checkoutStub.url,

  // Short enough that a deliberately hanging stub fails fast.
  OPENAI_TIMEOUT_MS: "3000",
  COMMERCE_API_TIMEOUT_MS: "3000",

  PROVIDER_CONFIG_DB_PATH: path.join(dataDir, "provider-configs.db"),
  // Pinned so stored keys decrypt across a reopen, and so the crypto layer
  // never falls back to its "key is unset" development path.
  PROVIDER_CONFIG_ENCRYPTION_KEY: "0".repeat(63) + "1",

  DEFAULT_MERCHANT_ID: TEST_MERCHANT_ID,
});

/** Shuts every stub down; the harness registers this as an `after` hook. */
export async function closeStubs(): Promise<void> {
  await Promise.all(stubs.map((stub) => stub.close()));
}
