import { z } from "zod";

import { modelSummarySchema } from "@/lib/dto/list-models";
import {
  apiKeySchema,
  merchantIdSchema,
  modelIdSchema,
  optionalProviderSchema,
  providerSchema,
} from "@/lib/dto/provider";

/**
 * `PUT /api/provider/config`
 *
 * Saving a config from the settings screen. `apiKey` is optional on update so
 * a merchant can switch models without re-typing their key.
 */
export const saveProviderConfigRequestSchema = z
  .object({
    provider: optionalProviderSchema,
    merchantId: merchantIdSchema.optional(),
    apiKey: apiKeySchema.optional(),
    selectedModel: modelIdSchema.nullable().optional(),
  })
  .refine(
    (input) => input.apiKey !== undefined || input.selectedModel !== undefined,
    { message: "Provide an apiKey, a selectedModel, or both" },
  );

export type SaveProviderConfigRequest = z.infer<typeof saveProviderConfigRequestSchema>;

/**
 * Response shape for every provider-config read/write. Note the absence of an
 * `apiKey` field: the stored key never leaves the server, only the masked hint
 * does.
 */
export const publicProviderConfigSchema = z.object({
  merchantId: z.string(),
  provider: providerSchema,
  selectedModel: z.string().nullable(),
  hasApiKey: z.boolean(),
  apiKeyHint: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PublicProviderConfigDto = z.infer<typeof publicProviderConfigSchema>;

/**
 * Result of a save. A save that supplies a key validates it first, so the
 * failure branch is the provider rejecting the key (or the model choice) —
 * in which case nothing was written.
 */
export const saveProviderConfigResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    config: publicProviderConfigSchema,
    /** Chat-capable models the saved key can reach; empty when no key was sent. */
    models: z.array(modelSummarySchema),
  }),
  z.object({
    ok: z.literal(false),
    provider: providerSchema,
    /** Why nothing was persisted, safe to show to the merchant. */
    reason: z.string(),
  }),
]);

export type SaveProviderConfigResponse = z.infer<typeof saveProviderConfigResponseSchema>;

/** `GET /api/provider/config` — `null` when the merchant has not set one up. */
export const getProviderConfigResponseSchema = z.object({
  config: publicProviderConfigSchema.nullable(),
});

export type GetProviderConfigResponse = z.infer<typeof getProviderConfigResponseSchema>;
