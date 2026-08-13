import { z } from "zod";

import {
  merchantIdSchema,
  modelIdSchema,
  optionalProviderSchema,
  providerSchema,
} from "@/lib/dto/provider";

export const chatRoleSchema = z.enum(["system", "user", "assistant"]);

export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(32_000, "Message content is too long"),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * `POST /api/chat`
 *
 * The request never carries an API key: the server resolves the merchant's
 * stored key. `model` is optional and falls back to the merchant's selected
 * model, then to the configured default.
 */
export const chatRequestSchema = z.object({
  provider: optionalProviderSchema,
  merchantId: merchantIdSchema.optional(),
  messages: z
    .array(chatMessageSchema)
    .min(1, "At least one message is required")
    .max(100, "Too many messages in one request"),
  model: modelIdSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(32_000).optional(),
  stream: z.boolean().default(false),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export type ChatUsage = z.infer<typeof chatUsageSchema>;

/**
 * One read the assistant performed while answering, reported so the chat UI
 * can show its work ("looked up 12 products"). Arguments are the model's, and
 * are only present when they parsed as JSON.
 */
export const chatToolInvocationSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).nullable().default(null),
  /** False when the read failed; the assistant is told and answers around it. */
  ok: z.boolean(),
});

export type ChatToolInvocation = z.infer<typeof chatToolInvocationSchema>;

export const chatResponseSchema = z.object({
  message: chatMessageSchema.extend({
    role: z.literal("assistant"),
    // Unlike an inbound message, an assistant turn may legitimately be empty
    // (e.g. `finishReason: "length"` before any text was produced).
    content: z.string(),
  }),
  model: z.string(),
  finishReason: z.string().nullable().default(null),
  usage: chatUsageSchema.nullable().default(null),
  /** Commerce reads made while producing this answer, in call order. */
  toolCalls: z.array(chatToolInvocationSchema).default([]),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

/**
 * Why a chat turn could not be produced. `key_missing` and `key_rejected` are
 * the credential cases: the merchant's stored key is absent, or the provider
 * refused it mid-chat because it was revoked, expired or had its permissions
 * narrowed since it was validated.
 */
export const CHAT_ERROR_CODES = [
  "key_missing",
  "key_rejected",
  "model_unavailable",
  "provider_rate_limited",
  "provider_unavailable",
  "provider_error",
] as const;

export const chatErrorCodeSchema = z.enum(CHAT_ERROR_CODES);

export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

/** What the merchant has to do about it — the chat UI's call to action. */
export const CHAT_ERROR_ACTIONS = [
  "configure_key",
  "revalidate_key",
  "select_model",
  "retry",
  "none",
] as const;

export const chatErrorActionSchema = z.enum(CHAT_ERROR_ACTIONS);

export type ChatErrorAction = z.infer<typeof chatErrorActionSchema>;

/**
 * The failure body of `POST /api/chat`. `error` carries the human-readable
 * message (matching the app's shared error payload), while `code` and `action`
 * let the chat UI react without string-matching — in particular, surfacing a
 * "re-validate your key in Settings" prompt when a stored key stops working.
 */
export const chatErrorSchema = z.object({
  error: z.string(),
  code: chatErrorCodeSchema,
  action: chatErrorActionSchema,
  provider: providerSchema,
});

export type ChatError = z.infer<typeof chatErrorSchema>;

/** True when the fix is for the merchant to (re-)validate their key. */
export function requiresKeyRevalidation(error: ChatError): boolean {
  return error.action === "revalidate_key" || error.action === "configure_key";
}

/** What the chat service resolves to: an answer, or a structured failure. */
export type ChatResult =
  | { ok: true; response: ChatResponse }
  | { ok: false; error: ChatError };
