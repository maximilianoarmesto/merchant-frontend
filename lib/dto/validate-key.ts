import { z } from "zod";

import { modelSummarySchema } from "@/lib/dto/list-models";
import { apiKeySchema, optionalProviderSchema, providerSchema } from "@/lib/dto/provider";
import { DEFAULT_PROVIDER, type Provider } from "@/lib/models/provider-config";

/**
 * `POST /api/provider/validate-key`
 *
 * The key travels in the request body (never a query string, which would land
 * in access logs) and is checked against the provider without being stored —
 * saving is a separate call (see `saveProviderConfigRequestSchema`). Validation
 * only ever happens because a caller asked for it; nothing re-checks a stored
 * key on a timer.
 */
export const validateKeyRequestSchema = z.object({
  provider: optionalProviderSchema,
  apiKey: apiKeySchema,
});

export type ValidateKeyRequest = z.infer<typeof validateKeyRequestSchema>;

/**
 * The three states a key check can be in. `validating` is the in-flight state
 * the UI renders while the provider call is outstanding; `valid` and `invalid`
 * are the settled outcomes.
 */
export const KEY_VALIDATION_STATUSES = ["validating", "valid", "invalid"] as const;

export const keyValidationStatusSchema = z.enum(KEY_VALIDATION_STATUSES);

export type KeyValidationStatus = z.infer<typeof keyValidationStatusSchema>;

export const keyValidationStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("validating"),
    provider: providerSchema,
  }),
  z.object({
    status: z.literal("valid"),
    provider: providerSchema,
    /** How many models the key can reach in total — a capability signal. */
    modelCount: z.number().int().nonnegative(),
    /** The subset the merchant may pick from: chat-capable models only. */
    models: z.array(modelSummarySchema),
  }),
  z.object({
    status: z.literal("invalid"),
    provider: providerSchema,
    /** Provider-reported reason, safe to show to the merchant. */
    reason: z.string(),
  }),
]);

export type KeyValidationState = z.infer<typeof keyValidationStateSchema>;

/** A finished check: what an awaited validation call resolves to. */
export type SettledKeyValidationState = Extract<
  KeyValidationState,
  { status: "valid" | "invalid" }
>;

/** The state to publish while a validation call is in flight. */
export function validatingKeyState(
  provider: Provider = DEFAULT_PROVIDER,
): Extract<KeyValidationState, { status: "validating" }> {
  return { status: "validating", provider };
}

export const validateKeyResponseSchema = keyValidationStateSchema;

export type ValidateKeyResponse = KeyValidationState;
