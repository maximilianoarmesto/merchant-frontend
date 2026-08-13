import { z } from "zod";

import type { Order, Product } from "@/lib/models/commerce";

/**
 * Wire schemas for the catalog and checkout responses.
 *
 * The services are FastAPI, so payloads arrive snake_case and monetary values
 * may be serialized as strings (Pydantic `Decimal`) — hence `z.coerce.number()`
 * on every amount. Anything the merchant UI does not depend on is treated as
 * optional so a field being added or dropped upstream cannot break a read.
 */

const moneySchema = z.coerce.number();

/** `GET /products` and `GET /products/{id}` on the catalog service. */
export const productPayloadSchema = z.object({
  id: z.coerce.number().int(),
  name: z.string(),
  description: z.string().nullish(),
  price: moneySchema,
  currency: z.string().default("USD"),
  stock: z.coerce.number().int().default(0),
  category: z.string().nullish(),
  is_active: z.boolean().default(true),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type ProductPayload = z.infer<typeof productPayloadSchema>;

export const productListPayloadSchema = z.array(productPayloadSchema);

/** `GET /orders` and `GET /orders/{id}` on the checkout service. */
export const orderPayloadSchema = z.object({
  id: z.coerce.number().int(),
  checkout_session_id: z.string().nullish(),
  product_id: z.coerce.number().int().nullish(),
  product_name: z.string().nullish(),
  quantity: z.coerce.number().int().default(1),
  total_amount: moneySchema,
  currency: z.string().default("USD"),
  payment_status: z.string().default("unknown"),
  order_status: z.string().default("unknown"),
  created_at: z.string().nullish(),
});

export type OrderPayload = z.infer<typeof orderPayloadSchema>;

export const orderListPayloadSchema = z.array(orderPayloadSchema);

export function toProduct(payload: ProductPayload): Product {
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description ?? null,
    price: payload.price,
    currency: payload.currency,
    stock: payload.stock,
    category: payload.category ?? null,
    isActive: payload.is_active,
    createdAt: payload.created_at ?? null,
    updatedAt: payload.updated_at ?? null,
  };
}

export function toOrder(payload: OrderPayload): Order {
  return {
    id: payload.id,
    checkoutSessionId: payload.checkout_session_id ?? null,
    productId: payload.product_id ?? null,
    productName: payload.product_name ?? null,
    quantity: payload.quantity,
    totalAmount: payload.total_amount,
    currency: payload.currency,
    paymentStatus: payload.payment_status,
    orderStatus: payload.order_status,
    createdAt: payload.created_at ?? null,
  };
}
