import { z } from "zod";

import { PROVIDERS, DEFAULT_PROVIDER } from "@/lib/models/provider-config";

/** Provider discriminator, shared by every provider-scoped DTO. */
export const providerSchema = z.enum(PROVIDERS);

/** Optional in request payloads — there is only one provider today. */
export const optionalProviderSchema = providerSchema.default(DEFAULT_PROVIDER);

/**
 * An OpenAI secret key. The length floor is deliberately loose: OpenAI has
 * shipped several key formats (`sk-`, `sk-proj-`, `sk-svcacct-`) and a strict
 * pattern would reject valid keys. Real verification is a live call to the
 * provider — see `validateApiKey` in `lib/server/openai.ts`.
 */
export const apiKeySchema = z
  .string()
  .trim()
  .min(20, "API key looks too short")
  .max(512, "API key looks too long")
  .refine((key) => !/\s/.test(key), "API key must not contain whitespace");

/** Merchant identifier used to scope every stored config. */
export const merchantIdSchema = z
  .string()
  .trim()
  .min(1, "merchantId is required")
  .max(128);

/** A model id such as `gpt-4o-mini`. */
export const modelIdSchema = z.string().trim().min(1, "Model id is required").max(128);
