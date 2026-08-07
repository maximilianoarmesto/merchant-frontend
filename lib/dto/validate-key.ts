import { z } from "zod";

import { apiKeySchema, optionalProviderSchema } from "@/lib/dto/provider";

/**
 * `POST /api/provider/validate-key`
 *
 * The key travels in the request body (never a query string, which would land
 * in access logs) and is checked against the provider without being stored.
 */
export const validateKeyRequestSchema = z.object({
  provider: optionalProviderSchema,
  apiKey: apiKeySchema,
});

export type ValidateKeyRequest = z.infer<typeof validateKeyRequestSchema>;

export const validateKeyResponseSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    /** How many models the key can reach — a cheap capability signal. */
    modelCount: z.number().int().nonnegative(),
  }),
  z.object({
    valid: z.literal(false),
    /** Provider-reported reason, safe to show to the merchant. */
    reason: z.string(),
  }),
]);

export type ValidateKeyResponse = z.infer<typeof validateKeyResponseSchema>;
