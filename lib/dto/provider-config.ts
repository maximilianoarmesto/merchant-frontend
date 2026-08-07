import { z } from "zod";

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

/** `GET /api/provider/config` — `null` when the merchant has not set one up. */
export const getProviderConfigResponseSchema = z.object({
  config: publicProviderConfigSchema.nullable(),
});

export type GetProviderConfigResponse = z.infer<typeof getProviderConfigResponseSchema>;
