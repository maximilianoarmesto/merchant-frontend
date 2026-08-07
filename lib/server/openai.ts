import "server-only";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { serverConfig, getCurrentMerchantId } from "@/lib/config/server";
import { DEFAULT_PROVIDER, type Provider } from "@/lib/models/provider-config";
import {
  getProviderConfig,
  ProviderConfigNotFoundError,
} from "@/lib/server/provider-config-repository";
import type { ChatRequest, ChatResponse } from "@/lib/dto/chat";
import type { ListModelsResponse, ModelSummary } from "@/lib/dto/list-models";
import type { ValidateKeyResponse } from "@/lib/dto/validate-key";

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
 * Checks a key by listing models — the cheapest authenticated call OpenAI
 * offers. The key is not persisted by this function.
 */
export async function validateApiKey(apiKey: string): Promise<ValidateKeyResponse> {
  try {
    const page = await createOpenAIClient(apiKey).models.list();
    return { valid: true, modelCount: page.data.length };
  } catch (error) {
    return { valid: false, reason: describeOpenAIError(error) };
  }
}

/** Lists the models a key can reach, newest first. */
export async function listModels(
  apiKey: string,
  options: { chatOnly?: boolean } = {},
): Promise<ListModelsResponse> {
  const { chatOnly = true } = options;
  const page = await createOpenAIClient(apiKey).models.list();

  const models = page.data
    .filter((model) => !chatOnly || isChatModel(model.id))
    .map(toModelSummary)
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id));

  return { provider: DEFAULT_PROVIDER, models };
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

/**
 * Runs a chat completion with the merchant's stored key.
 * Streaming is handled by the route layer, not here.
 */
export async function createChatCompletion(
  request: ChatRequest,
  merchantId: string = getCurrentMerchantId(),
): Promise<ChatResponse> {
  const provider = request.provider ?? DEFAULT_PROVIDER;
  const config = getProviderConfig(merchantId, provider);
  if (!config) throw new ProviderConfigNotFoundError(merchantId, provider);

  const model = resolveModel(request.model, config.selectedModel);
  const messages: ChatCompletionMessageParam[] = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const completion = await createOpenAIClient(config.apiKey).chat.completions.create({
    model,
    messages,
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(request.maxTokens !== undefined ? { max_completion_tokens: request.maxTokens } : {}),
    stream: false,
  });

  const choice = completion.choices[0];
  if (!choice) throw new Error("OpenAI returned no completion choices");

  return {
    message: { role: "assistant", content: choice.message.content ?? "" },
    model: completion.model,
    finishReason: choice.finish_reason ?? null,
    usage: completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : null,
  };
}
