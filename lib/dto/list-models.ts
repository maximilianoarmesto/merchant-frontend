import { z } from "zod";

import { apiKeySchema, merchantIdSchema, optionalProviderSchema } from "@/lib/dto/provider";

/**
 * A model-listing request as the service layer takes it: either supply a key to
 * probe, or omit it and the merchant's stored key is used.
 *
 * `GET /api/provider/models` exposes only the stored-key half — a key never
 * travels in a query string, and probing one the merchant just typed already
 * comes back with its models from `POST /api/provider/validate-key`.
 */
export const listModelsRequestSchema = z.object({
  provider: optionalProviderSchema,
  apiKey: apiKeySchema.optional(),
  merchantId: merchantIdSchema.optional(),
  /** Drop embedding/audio/image models and keep only chat-capable ones. */
  chatOnly: z.boolean().default(true),
});

export type ListModelsRequest = z.infer<typeof listModelsRequestSchema>;

export const modelSummarySchema = z.object({
  id: z.string(),
  ownedBy: z.string().nullable().default(null),
  /** Unix seconds, as reported by the provider. */
  created: z.number().int().nullable().default(null),
});

export type ModelSummary = z.infer<typeof modelSummarySchema>;

export const listModelsResponseSchema = z.object({
  provider: optionalProviderSchema,
  models: z.array(modelSummarySchema),
});

export type ListModelsResponse = z.infer<typeof listModelsResponseSchema>;
