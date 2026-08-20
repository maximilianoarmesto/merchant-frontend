import type { z } from "zod";

import { CATALOG_API_URL, CHECKOUT_API_URL } from "@/lib/config/public";
import {
  chatErrorSchema,
  chatResponseSchema,
  requiresKeyRevalidation,
  type ChatError,
  type ChatErrorAction,
  type ChatErrorCode,
  type ChatMessage,
  type ChatResponse,
} from "@/lib/dto/chat";
import { listModelsResponseSchema, type ListModelsResponse } from "@/lib/dto/list-models";
import {
  validateKeyResponseSchema,
  type SettledKeyValidationState,
} from "@/lib/dto/validate-key";
import { apiErrorSchema, validate, type FieldError } from "@/lib/dto/validation";
import type { Provider } from "@/lib/models/provider-config";

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

export const catalogApi = {
  listProducts: () => request<Product[]>(`${CATALOG_API_URL}/products`),
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

/**
 * The merchant assistant's routes, all served by this Next.js app.
 *
 * Relative paths on purpose: unlike the catalog and checkout services, these
 * handlers are part of the frontend deployment, and the browser must call them
 * on its own origin so the session headers travel with the request. The OpenAI
 * base URL is deliberately absent from this module — the browser holds no key
 * and never talks to a provider directly (see `app/api/chat/route.ts`).
 */
export const ASSISTANT_ROUTES = {
  validateKey: "/api/provider/validate-key",
  models: "/api/provider/models",
  chat: "/api/chat",
} as const;

/**
 * A failed call to an assistant route. Every failure — a 4xx/5xx body, an
 * unreachable server, a response that does not match its schema — arrives as
 * one of these, so a caller has a single `catch` to write. `status` is 0 when
 * the request never got an HTTP answer.
 */
export class AssistantApiError extends Error {
  readonly status: number;
  /** Per-field messages from a 400, when the route reported any. */
  readonly fieldErrors: FieldError[];

  constructor(
    message: string,
    status: number,
    options?: { fieldErrors?: FieldError[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AssistantApiError";
    this.status = status;
    this.fieldErrors = options?.fieldErrors ?? [];
  }
}

/**
 * A chat turn that could not be produced, carrying the route's structured
 * reason. `action` is what to ask the merchant for — in particular
 * `revalidate_key` / `configure_key` when their stored key stopped working
 * mid-chat, which `requiresKeyRevalidation` surfaces without string-matching
 * the message.
 */
export class ChatApiError extends AssistantApiError {
  readonly code: ChatErrorCode;
  readonly action: ChatErrorAction;
  readonly provider: Provider;
  /** True when the fix is for the merchant to (re-)validate their key. */
  readonly requiresKeyRevalidation: boolean;

  constructor(status: number, error: ChatError) {
    super(error.error, status);
    this.name = "ChatApiError";
    this.code = error.code;
    this.action = error.action;
    this.provider = error.provider;
    this.requiresKeyRevalidation = requiresKeyRevalidation(error);
  }
}

/** Narrows a caught value to a failed assistant call. */
export function isAssistantApiError(error: unknown): error is AssistantApiError {
  return error instanceof AssistantApiError;
}

/**
 * True when a caught error is a chat failure whose fix is for the merchant to
 * (re-)validate their key — the signal that sends the UI to Settings.
 */
export function isKeyRevalidationError(error: unknown): error is ChatApiError {
  return error instanceof ChatApiError && error.requiresKeyRevalidation;
}

/** The response body as JSON, or `undefined` when it was absent or not JSON. */
async function readJsonBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Turns a non-2xx body into an error. The chat shape is tried first because it
 * is a superset of the app's shared `ApiError` — parsing it as the plain shape
 * would silently drop the `code`/`action` the chat UI reacts to.
 */
function toAssistantApiError(res: Response, body: unknown): AssistantApiError {
  const chatError = chatErrorSchema.safeParse(body);
  if (chatError.success) return new ChatApiError(res.status, chatError.data);

  const apiError = apiErrorSchema.safeParse(body);
  if (apiError.success) {
    return new AssistantApiError(apiError.data.error, res.status, {
      fieldErrors: apiError.data.errors,
    });
  }

  return new AssistantApiError(
    `${res.status} ${res.statusText || "request failed"}`,
    res.status,
  );
}

/**
 * Calls an assistant route and validates the answer against the DTO schema the
 * route serializes from, so callers get a checked value rather than a cast.
 */
async function assistantRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  let res: Response;
  try {
    res = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...((init?.headers as Record<string, string>) || {}),
      },
    });
  } catch (cause) {
    // A dropped connection or an aborted request: no status to report.
    throw new AssistantApiError(`Could not reach ${path}`, 0, { cause });
  }

  const body = await readJsonBody(res);
  if (!res.ok) throw toAssistantApiError(res, body);

  const parsed = validate(schema, body);
  if (!parsed.success) {
    throw new AssistantApiError(`${path} returned an unexpected response`, res.status, {
      fieldErrors: parsed.errors,
    });
  }
  return parsed.data;
}

/**
 * One turn to send to the assistant. No `apiKey` and no `merchantId`: the route
 * resolves both from the session, and a key sent from the browser would be a
 * key the browser had to hold. `stream` is absent too — the route rejects it
 * until streaming ships.
 */
export type SendChatMessageInput = {
  /** The conversation so far, ending with the merchant's new message. */
  messages: ChatMessage[];
  /** Defaults server-side to the merchant's selected model. */
  model?: string;
  provider?: Provider;
  temperature?: number;
  maxTokens?: number;
};

/**
 * The assistant's own API, talking only to the routes under `/api` above.
 *
 * Failures throw (`AssistantApiError`, or `ChatApiError` for a chat turn) so
 * they reach the caller instead of being folded into an empty result. The one
 * failure that is *not* an error is a rejected API key: `validateKey` answers
 * with `status: "invalid"` and a reason, because "this key does not work" is
 * the successful outcome of asking whether it does.
 */
export const assistantApi = {
  /**
   * Checks `apiKey` against the provider and, if the provider accepts it,
   * stores it for the current merchant. Resolves to the settled state: `valid`
   * with the chat-capable models the key reaches, or `invalid` with the reason
   * — nothing was stored in that case.
   */
  validateKey: async (
    apiKey: string,
    provider?: Provider,
  ): Promise<SettledKeyValidationState> => {
    const state = await assistantRequest(
      ASSISTANT_ROUTES.validateKey,
      validateKeyResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({ apiKey, ...(provider ? { provider } : {}) }),
      },
    );
    if (state.status === "validating") {
      // The route only ever answers with a settled state; `validating` is the
      // client-side in-flight state (`validatingKeyState`), not a response.
      throw new AssistantApiError(
        `${ASSISTANT_ROUTES.validateKey} returned an unsettled validation state`,
        200,
      );
    }
    return state;
  },

  /**
   * The chat-capable models the merchant's stored key can reach. Throws with
   * status 409 when no key is configured yet, which is how the settings screen
   * tells that apart from a key that reaches no chat models.
   */
  listModels: (provider?: Provider): Promise<ListModelsResponse> => {
    const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    return assistantRequest(`${ASSISTANT_ROUTES.models}${query}`, listModelsResponseSchema);
  },

  /**
   * Sends one turn and resolves to the assistant's answer, including the
   * commerce reads it made. A turn that could not be produced throws a
   * `ChatApiError` carrying `code`/`action` — check `requiresKeyRevalidation`
   * (or `isKeyRevalidationError`) to prompt for a fresh key.
   */
  sendChatMessage: (
    input: SendChatMessageInput,
    options?: { signal?: AbortSignal },
  ): Promise<ChatResponse> =>
    assistantRequest(ASSISTANT_ROUTES.chat, chatResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
      signal: options?.signal,
    }),
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
