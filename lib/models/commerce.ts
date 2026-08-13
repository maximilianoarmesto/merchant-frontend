/**
 * Domain models for the commerce data owned by the catalog and checkout
 * services.
 *
 * These are read-only projections: this app never creates or mutates a product
 * or an order, it only reads what the FastAPI services already expose. The
 * upstream payloads are snake_case; these models are the camelCase shape the
 * rest of the app works with (see `lib/dto/commerce.ts` for the mapping).
 *
 * `lib/api.ts` keeps its own snake_case types for the browser-side calls the
 * existing pages make — this module is for server-side consumers.
 */

export type ProductId = number;
export type OrderId = number;

/** A catalog product, as read from `GET /products`. */
export interface Product {
  id: ProductId;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  stock: number;
  category: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** An order, as read from the checkout service's `/orders` endpoints. */
export interface Order {
  id: OrderId;
  checkoutSessionId: string | null;
  productId: ProductId | null;
  productName: string | null;
  quantity: number;
  totalAmount: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string | null;
}

/** Whether a product can currently be bought. */
export function isPurchasable(product: Product): boolean {
  return product.isActive && product.stock > 0;
}
