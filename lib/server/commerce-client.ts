import "server-only";

import { headers } from "next/headers";
import type { z } from "zod";

import { getCurrentMerchantId, serverConfig } from "@/lib/config/server";

/**
 * Read-only HTTP access to the catalog and checkout services.
 *
 * Two properties this module exists to guarantee:
 *
 * 1. **Read-only.** `getJson` hardcodes `method: "GET"` and takes no body and
 *    no method parameter, so nothing built on top of it can create, update or
 *    delete upstream state. Writes (checkout sessions, payments) stay in the
 *    browser-side `lib/api.ts`.
 * 2. **Merchant-scoped.** Every request carries the inbound request's own
 *    auth/session headers, so the upstream services scope the answer to the
 *    merchant who is actually signed in rather than to the frontend's own
 *    identity.
 *
 * Base URLs come from `serverConfig` (`NEXT_PUBLIC_CATALOG_API_URL` /
 * `NEXT_PUBLIC_CHECKOUT_API_URL`) — never hardcoded here.
 */

export type CommerceService = "catalog" | "checkout";

/** Header the services read to scope a query to one merchant. */
export const MERCHANT_ID_HEADER = "x-merchant-id";

/**
 * Inbound headers forwarded verbatim upstream. `cookie` covers session-cookie
 * platforms, `authorization` covers bearer tokens; whichever the platform
 * ends up using, the upstream service sees the caller's real credentials.
 */
const FORWARDED_HEADERS = [
  "cookie",
  "authorization",
  "x-request-id",
] as const;

/**
 * The caller's identity for one commerce read. Resolved from the inbound
 * request by default; pass one explicitly when reading outside a request
 * (a background job, a test).
 */
export interface CommerceAuthContext {
  merchantId: string;
  /** Inbound headers to replay upstream, lowercased keys. */
  forwardedHeaders: Readonly<Record<string, string>>;
}

/** Raised when an upstream service answers with a non-2xx status. */
export class CommerceApiError extends Error {
  constructor(
    readonly service: CommerceService,
    readonly status: number,
    readonly url: string,
    detail: string,
  ) {
    super(`${service} service responded ${status}: ${detail}`);
    this.name = "CommerceApiError";
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 401/403 — the forwarded session was rejected or lacks access. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Raised when an upstream payload does not match the expected schema. */
export class CommerceResponseError extends Error {
  constructor(
    readonly service: CommerceService,
    readonly url: string,
    readonly issues: string[],
  ) {
    super(`${service} service returned an unexpected payload: ${issues.join("; ")}`);
    this.name = "CommerceResponseError";
  }
}

function baseUrl(service: CommerceService): string {
  return service === "catalog"
    ? serverConfig.catalogApiUrl
    : serverConfig.checkoutApiUrl;
}

/**
 * Reads the current request's auth/session headers.
 *
 * `headers()` throws outside a request scope (e.g. during a static build), in
 * which case there is no session to forward and only the configured merchant
 * id goes upstream.
 */
export function getCommerceAuthContext(): CommerceAuthContext {
  let inbound: { get(name: string): string | null } | null = null;
  try {
    inbound = headers();
  } catch {
    inbound = null;
  }

  const forwardedHeaders: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = inbound?.get(name);
    if (value) forwardedHeaders[name] = value;
  }

  // Until the platform has real merchant authentication, the inbound header
  // (if any) wins over the configured placeholder — see `getCurrentMerchantId`.
  const merchantId = inbound?.get(MERCHANT_ID_HEADER) || getCurrentMerchantId();

  return { merchantId, forwardedHeaders };
}

function buildRequestHeaders(auth: CommerceAuthContext): Record<string, string> {
  return {
    Accept: "application/json",
    ...auth.forwardedHeaders,
    [MERCHANT_ID_HEADER]: auth.merchantId,
  };
}

function timeoutSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(serverConfig.commerceTimeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.message === "string") return body.message;
  } catch {
    /* body wasn't JSON */
  }
  return response.statusText || "no detail";
}

export interface CommerceRequestOptions {
  /** Defaults to the inbound request's session. */
  auth?: CommerceAuthContext;
  signal?: AbortSignal;
  /** Query string parameters; `undefined` values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Performs one GET against a commerce service and validates the payload.
 *
 * This is the only outbound call in this layer, and it is a GET by
 * construction — there is deliberately no way to pass a method or a body.
 */
export async function getJson<S extends z.ZodType>(
  service: CommerceService,
  path: string,
  schema: S,
  options: CommerceRequestOptions = {},
): Promise<z.output<S>> {
  const auth = options.auth ?? getCommerceAuthContext();
  const url = new URL(`${baseUrl(service)}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: buildRequestHeaders(auth),
    signal: timeoutSignal(options.signal),
    // Merchant-scoped data must never be shared between requests.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new CommerceApiError(
      service,
      response.status,
      url.toString(),
      await readErrorDetail(response),
    );
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CommerceResponseError(
      service,
      url.toString(),
      parsed.error.issues.map(
        (issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}

/** Same as `getJson`, but a 404 becomes `null` instead of an error. */
export async function getJsonOrNull<S extends z.ZodType>(
  service: CommerceService,
  path: string,
  schema: S,
  options: CommerceRequestOptions = {},
): Promise<z.output<S> | null> {
  try {
    return await getJson(service, path, schema, options);
  } catch (error) {
    if (error instanceof CommerceApiError && error.isNotFound) return null;
    throw error;
  }
}
