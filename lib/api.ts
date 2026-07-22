export type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CheckoutSession = {
  id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: "created" | "paid" | "cancelled";
  created_at: string;
};

export type Order = {
  id: number;
  checkout_session_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  total_amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  created_at: string;
};

const CATALOG_API_URL =
  process.env.NEXT_PUBLIC_CATALOG_API_URL || "http://localhost:8001";
const CHECKOUT_API_URL =
  process.env.NEXT_PUBLIC_CHECKOUT_API_URL || "http://localhost:8002";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (hasBody && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* body wasn't JSON */
    }
    throw new Error(`${res.status} ${detail}`);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export type ProductFilters = {
  name?: string;
  min_price?: number;
  max_price?: number;
  category?: string;
};

export const catalogApi = {
  listProducts: (filters?: ProductFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined) {
          params.append(key, String(value));
        }
      }
    }
    const query = params.toString();
    return request<Product[]>(
      `${CATALOG_API_URL}/products${query ? `?${query}` : ""}`
    );
  },
  getProduct: (id: number | string) =>
    request<Product>(`${CATALOG_API_URL}/products/${id}`),
};

export const checkoutApi = {
  createSession: (productId: number, quantity: number) =>
    request<CheckoutSession>(`${CHECKOUT_API_URL}/checkout/session`, {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    }),
  getSession: (sessionId: string) =>
    request<CheckoutSession>(`${CHECKOUT_API_URL}/checkout/session/${sessionId}`),
  paySession: (sessionId: string) =>
    request<Order>(`${CHECKOUT_API_URL}/checkout/session/${sessionId}/pay`, {
      method: "POST",
    }),
  listOrders: () => request<Order[]>(`${CHECKOUT_API_URL}/orders`),
};

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
