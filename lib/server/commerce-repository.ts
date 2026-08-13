import "server-only";

import {
  orderListPayloadSchema,
  orderPayloadSchema,
  productListPayloadSchema,
  productPayloadSchema,
  toOrder,
  toProduct,
} from "@/lib/dto/commerce";
import type { Order, OrderId, Product, ProductId } from "@/lib/models/commerce";
import {
  CommerceApiError,
  getCommerceAuthContext,
  getJson,
  getJsonOrNull,
  type CommerceAuthContext,
} from "@/lib/server/commerce-client";

/**
 * Server-side data access for commerce data.
 *
 * Four reads, no writes: products and orders come from the catalog and
 * checkout services that already own them, and nothing here creates a
 * checkout session or pays for one. The AI assistant and any future route
 * handler go through these functions rather than talking to the services
 * directly, so scoping and payload validation happen in exactly one place.
 *
 * Every call forwards the current merchant's session (see
 * `lib/server/commerce-client.ts`); pass `options.auth` only when reading
 * outside an inbound request.
 */

export interface CommerceReadOptions {
  /** Defaults to the inbound request's session. */
  auth?: CommerceAuthContext;
  signal?: AbortSignal;
}

/** Filters accepted by the catalog when listing products. */
export interface ListProductsOptions extends CommerceReadOptions {
  category?: string;
  /** Restrict to active/inactive products; omit for whatever upstream returns. */
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/** Filters accepted by the checkout service when listing orders. */
export interface ListOrdersOptions extends CommerceReadOptions {
  /** e.g. `paid`, `pending` — passed through verbatim. */
  status?: string;
  limit?: number;
  offset?: number;
}

function pathId(id: ProductId | OrderId | string): string {
  return encodeURIComponent(String(id));
}

/** Lists the merchant's catalog products. */
export async function listProducts(
  options: ListProductsOptions = {},
): Promise<Product[]> {
  const { auth, signal, category, isActive, limit, offset } = options;
  const payload = await getJson("catalog", "/products", productListPayloadSchema, {
    auth,
    signal,
    query: { category, is_active: isActive, limit, offset },
  });
  return payload.map(toProduct);
}

/** Fetches one product. Returns `null` when the merchant has no such product. */
export async function getProduct(
  productId: ProductId | string,
  options: CommerceReadOptions = {},
): Promise<Product | null> {
  const payload = await getJsonOrNull(
    "catalog",
    `/products/${pathId(productId)}`,
    productPayloadSchema,
    options,
  );
  return payload ? toProduct(payload) : null;
}

/** Lists the merchant's orders. */
export async function listOrders(options: ListOrdersOptions = {}): Promise<Order[]> {
  const { auth, signal, status, limit, offset } = options;
  const payload = await getJson("checkout", "/orders", orderListPayloadSchema, {
    auth,
    signal,
    query: { status, limit, offset },
  });
  return payload.map(toOrder);
}

/**
 * Fetches one order. Returns `null` when the merchant has no such order.
 *
 * The checkout service exposes the order list for certain; the per-order
 * detail route is the conventional REST counterpart but is not guaranteed to
 * exist on every deployment, so a 404/405 falls back to picking the order out
 * of the merchant's own list. Both paths stay read-only and merchant-scoped.
 */
export async function getOrder(
  orderId: OrderId | string,
  options: CommerceReadOptions = {},
): Promise<Order | null> {
  try {
    const payload = await getJson(
      "checkout",
      `/orders/${pathId(orderId)}`,
      orderPayloadSchema,
      options,
    );
    return toOrder(payload);
  } catch (error) {
    if (!(error instanceof CommerceApiError)) throw error;
    if (error.status === 404) return findOrderInList(orderId, options);
    if (error.status === 405 || error.status === 501) {
      return findOrderInList(orderId, options);
    }
    throw error;
  }
}

async function findOrderInList(
  orderId: OrderId | string,
  options: CommerceReadOptions,
): Promise<Order | null> {
  const wanted = String(orderId);
  const orders = await listOrders(options);
  return orders.find((order) => String(order.id) === wanted) ?? null;
}

/** Convenience wrapper: the whole read surface behind one object. */
export const commerceRepository = {
  listProducts,
  getProduct,
  listOrders,
  getOrder,
} as const;

export { getCommerceAuthContext };
export type { CommerceAuthContext };
