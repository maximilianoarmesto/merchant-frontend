import { z } from "zod";

import { merchantIdSchema, modelIdSchema, optionalProviderSchema } from "@/lib/dto/provider";

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

export const chatResponseSchema = z.object({
  message: chatMessageSchema.extend({ role: z.literal("assistant") }),
  model: z.string(),
  finishReason: z.string().nullable().default(null),
  usage: chatUsageSchema.nullable().default(null),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
