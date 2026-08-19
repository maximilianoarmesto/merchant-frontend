import "server-only";

import type { ApiError, FieldError } from "@/lib/dto/validation";
import { getCommerceAuthContext, type CommerceAuthContext } from "@/lib/server/commerce-client";

/**
 * Plumbing shared by the route handlers under `app/api/`.
 *
 * Two things every handler needs and neither should re-invent:
 *
 * 1. **Who is calling.** `getMerchantSession()` is the single place a route
 *    resolves the current merchant, and it goes through the platform's existing
 *    auth/session plumbing (`getCommerceAuthContext`) rather than reading a
 *    merchant id out of the request payload. A body or query string that names
 *    a `merchantId` is therefore never authoritative — see the handlers, which
 *    overwrite it with the session value before calling a service.
 * 2. **How a failure looks.** Every error body is the app's shared
 *    `ApiError` shape (`lib/dto/validation.ts`), so the frontend has one error
 *    path across all routes. The one exception is `POST /api/chat`, which
 *    returns the richer `ChatError` (`error` plus `code`/`action`) — a superset
 *    of `ApiError`, so a client reading `error` still works.
 */

/**
 * The caller's identity for one API request. Same context the server-side
 * commerce reads use, so a route can hand it straight to a service and have the
 * upstream services see the merchant who is actually signed in.
 */
export type MerchantSession = CommerceAuthContext;

/**
 * Resolves the merchant the current request acts on from the platform's
 * auth/session headers, falling back to the configured merchant while real
 * merchant authentication does not exist yet (see `getCurrentMerchantId`).
 */
export function getMerchantSession(): MerchantSession {
  return getCommerceAuthContext();
}

/** An `ApiError` response with the given status. */
export function jsonError(status: number, message: string, errors?: FieldError[]): Response {
  return Response.json({ error: message, ...(errors ? { errors } : {}) } satisfies ApiError, {
    status,
  });
}

/** 400 for a malformed body or query string, listing the offending fields. */
export function invalidRequest(errors: FieldError[]): Response {
  return jsonError(400, "The request payload is invalid", errors);
}

/**
 * 500 for a failure that is ours, not the merchant's or the provider's — a
 * database or encryption error, say. The cause is logged rather than returned:
 * it can carry internals (file paths, key material handling) that must not
 * reach the browser.
 */
export function unexpectedError(context: string, error: unknown): Response {
  console.error(`[api] ${context}`, error);
  return jsonError(500, "Something went wrong handling the request");
}
