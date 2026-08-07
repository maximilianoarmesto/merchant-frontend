/**
 * Browser-safe configuration.
 *
 * Only `NEXT_PUBLIC_*` variables belong here — everything in this module is
 * inlined into the client bundle at build time. Secrets (the OpenAI API key,
 * the encryption key, the database path) live in `lib/config/server.ts`.
 *
 * The `process.env.NEXT_PUBLIC_*` reads must stay written out literally:
 * Next.js substitutes them statically and cannot resolve dynamic lookups.
 */

export const DEFAULT_CATALOG_API_URL = "http://localhost:8001";
export const DEFAULT_CHECKOUT_API_URL = "http://localhost:8002";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Base URL of the catalog service. */
export const CATALOG_API_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_CATALOG_API_URL || DEFAULT_CATALOG_API_URL,
);

/** Base URL of the checkout/payment service. */
export const CHECKOUT_API_URL = trimTrailingSlash(
  process.env.NEXT_PUBLIC_CHECKOUT_API_URL || DEFAULT_CHECKOUT_API_URL,
);

export const publicConfig = {
  catalogApiUrl: CATALOG_API_URL,
  checkoutApiUrl: CHECKOUT_API_URL,
} as const;

export type PublicConfig = typeof publicConfig;
