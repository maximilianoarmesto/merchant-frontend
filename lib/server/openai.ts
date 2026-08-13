import "server-only";

import OpenAI from "openai";

import { serverConfig, getCurrentMerchantId } from "@/lib/config/server";
import { DEFAULT_PROVIDER, type Provider } from "@/lib/models/provider-config";
import {
  getProviderConfig,
  ProviderConfigNotFoundError,
} from "@/lib/server/provider-config-repository";
import type { ListModelsResponse, ModelSummary } from "@/lib/dto/list-models";
import type { SettledKeyValidationState } from "@/lib/dto/validate-key";

/**
 * Server-side OpenAI integration.
 *
 * `dangerouslyAllowBrowser` is intentionally never set: combined with the
 * `server-only` import, an accidental client import fails the build rather
 * than shipping a merchant's key to the browser.
 */

/** Builds a client from an explicitly passed key. */
export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: serverConfig.openaiBaseUrl,
    timeout: serverConfig.openaiTimeoutMs,
    maxRetries: 2,
  });
}

/** Builds a client from the merchant's stored key. */
export function createOpenAIClientForMerchant(
  merchantId: string = getCurrentMerchantId(),
  provider: Provider = DEFAULT_PROVIDER,
): OpenAI {
  const config = getProviderConfig(merchantId, provider);
  if (!config) throw new ProviderConfigNotFoundError(merchantId, provider);
  return createOpenAIClient(config.apiKey);
}

/** Model families that serve `chat.completions`. */
const CHAT_MODEL_PATTERN = /^(gpt-|chatgpt-|o[1-9])/i;

/** Non-chat variants that slip past the family prefixes above. */
const NON_CHAT_MODEL_PATTERN =
  /(embedding|whisper|tts|dall-e|moderation|audio|image|transcribe|realtime|search|instruct)/i;

export function isChatModel(modelId: string): boolean {
  return CHAT_MODEL_PATTERN.test(modelId) && !NON_CHAT_MODEL_PATTERN.test(modelId);
}

function toModelSummary(model: { id: string; owned_by?: string; created?: number }): ModelSummary {
  return {
    id: model.id,
    ownedBy: model.owned_by ?? null,
    created: model.created ?? null,
  };
}

/**
 * HTTP status behind a failed provider call, or `undefined` when the failure
 * never reached OpenAI (timeout, DNS, aborted request). Callers use it to tell
 * a rejected key (401/403) apart from a transport problem.
 */
export function openAIErrorStatus(error: unknown): number | undefined {
  return error instanceof OpenAI.APIError ? error.status : undefined;
}

/** Human-readable reason for a failed provider call. */
export function describeOpenAIError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return "The API key was rejected by OpenAI";
    if (error.status === 403) return "This API key is not permitted to perform that request";
    if (error.status === 429) return "OpenAI rate limit reached — try again shortly";
    if (error.status && error.status >= 500) return "OpenAI is currently unavailable";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error contacting OpenAI";
}

/**
 * One `models.list` call, mapped and sorted newest-first. The chat filter is
 * left to the caller: validation reports the total reachable count, while the
 * model picker only ever shows chat-capable models.
 */
export async function fetchModelSummaries(apiKey: string): Promise<ModelSummary[]> {
  const page = await createOpenAIClient(apiKey).models.list();

  return page.data
    .map(toModelSummary)
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id));
}

/** Keeps only the models that can serve `chat.completions`. */
export function filterChatModels(models: ModelSummary[]): ModelSummary[] {
  return models.filter((model) => isChatModel(model.id));
}

/**
 * Checks a key by listing models — the cheapest authenticated call OpenAI
 * offers, and it doubles as the model list, so a validate-then-list flow costs
 * a single round trip. The key is not persisted by this function.
 */
export async function validateApiKey(
  apiKey: string,
  provider: Provider = DEFAULT_PROVIDER,
): Promise<SettledKeyValidationState> {
  try {
    const models = await fetchModelSummaries(apiKey);
    return {
      status: "valid",
      provider,
      modelCount: models.length,
      models: filterChatModels(models),
    };
  } catch (error) {
    return { status: "invalid", provider, reason: describeOpenAIError(error) };
  }
}

/** Lists the models a key can reach, newest first. */
export async function listModels(
  apiKey: string,
  options: { chatOnly?: boolean } = {},
): Promise<ListModelsResponse> {
  const { chatOnly = true } = options;
  const models = await fetchModelSummaries(apiKey);

  return {
    provider: DEFAULT_PROVIDER,
    models: chatOnly ? filterChatModels(models) : models,
  };
}

/**
 * Resolves which model to use: the request's explicit choice, then the
 * merchant's saved selection, then the configured default.
 */
export function resolveModel(
  requested: string | undefined,
  selectedModel: string | null,
): string {
  return requested ?? selectedModel ?? serverConfig.openaiDefaultModel;
}

// Running a chat turn lives in `lib/server/chat-service.ts`: it needs the
// commerce tool loop and the structured "re-validate your key" error, neither
// of which belongs in this low-level provider layer.
