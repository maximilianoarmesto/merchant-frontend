import "server-only";

/**
 * Server-only configuration.
 *
 * Importing this module from a client component is a build error (see the
 * `server-only` import above), which is what keeps the provider API key and
 * the encryption key out of the browser bundle.
 */

import { CATALOG_API_URL, CHECKOUT_API_URL } from "@/lib/config/public";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_OPENAI_TIMEOUT_MS = 30_000;
export const DEFAULT_COMMERCE_TIMEOUT_MS = 10_000;
export const DEFAULT_DB_PATH = "./data/merchant.db";

/**
 * Placeholder tenant used until real merchant authentication exists. Every
 * repository call takes an explicit `merchantId`, so swapping this for a
 * session lookup later touches only the callers.
 */
export const DEFAULT_MERCHANT_ID = "merchant-local";

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function intEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return parsed;
}

export const serverConfig = {
  /** Upstream base URLs, re-exported so server code has a single import. */
  catalogApiUrl: CATALOG_API_URL,
  checkoutApiUrl: CHECKOUT_API_URL,

  /** Per-request timeout for reads against catalog/checkout. */
  commerceTimeoutMs: intEnv("COMMERCE_API_TIMEOUT_MS", DEFAULT_COMMERCE_TIMEOUT_MS),

  /** Where the SQLite file holding provider configs lives. */
  databasePath: optionalEnv("PROVIDER_CONFIG_DB_PATH") ?? DEFAULT_DB_PATH,

  /**
   * Secret used to encrypt stored API keys. Required in production; in
   * development a fixed development key is derived instead (see
   * `lib/server/crypto.ts`).
   */
  encryptionKey: optionalEnv("PROVIDER_CONFIG_ENCRYPTION_KEY"),

  /** Overridable for OpenAI-compatible gateways and for tests. */
  openaiBaseUrl: optionalEnv("OPENAI_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL,
  openaiTimeoutMs: intEnv("OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS),
  openaiDefaultModel: optionalEnv("OPENAI_DEFAULT_MODEL") ?? DEFAULT_OPENAI_MODEL,

  defaultMerchantId: optionalEnv("DEFAULT_MERCHANT_ID") ?? DEFAULT_MERCHANT_ID,

  isProduction: process.env.NODE_ENV === "production",
} as const;

export type ServerConfig = typeof serverConfig;

/** Resolves the merchant the current request acts on. */
export function getCurrentMerchantId(): string {
  return serverConfig.defaultMerchantId;
}
