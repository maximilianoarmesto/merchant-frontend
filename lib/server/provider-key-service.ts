import "server-only";

import { getCurrentMerchantId } from "@/lib/config/server";
import type { ModelSummary } from "@/lib/dto/list-models";
import {
  validatingKeyState,
  type KeyValidationState,
  type SettledKeyValidationState,
} from "@/lib/dto/validate-key";
import {
  DEFAULT_PROVIDER,
  toPublicProviderConfig,
  type Provider,
  type PublicProviderConfig,
} from "@/lib/models/provider-config";
import {
  describeOpenAIError,
  fetchModelSummaries,
  filterChatModels,
  isChatModel,
  validateApiKey,
} from "@/lib/server/openai";
import {
  getProviderConfig,
  updateProviderConfig,
  upsertProviderConfig,
} from "@/lib/server/provider-config-repository";

/**
 * Business logic for the provider-key lifecycle: validate a key on demand,
 * persist it once the provider has accepted it, then let the merchant pick one
 * of the chat-capable models that key can reach.
 *
 * Two rules shape this module:
 *
 * - **Validation is explicit.** A key is checked only when a caller asks for a
 *   check. Nothing here schedules a re-validation, and reading a stored config
 *   never calls OpenAI — a key that OpenAI later revokes stays on file until
 *   the merchant revalidates it.
 * - **Nothing is written until the provider says yes.** Every persisting entry
 *   point validates first and returns a failure result — not a partial write —
 *   when the key is rejected.
 */

/** Failure branch shared by every result in this module. */
interface ProviderKeyFailure {
  ok: false;
  provider: Provider;
  /** Why the operation failed, phrased for the merchant to read. */
  reason: string;
}

export type SaveProviderKeyResult =
  | {
      ok: true;
      config: PublicProviderConfig;
      /** Chat-capable models the just-saved key can reach. */
      models: ModelSummary[];
    }
  | ProviderKeyFailure;

export type SaveSelectedModelResult =
  | { ok: true; config: PublicProviderConfig }
  | ProviderKeyFailure;

export type ListChatModelsResult =
  | { ok: true; provider: Provider; models: ModelSummary[] }
  | ProviderKeyFailure;

export interface ValidateProviderKeyOptions {
  provider?: Provider;
  /**
   * Called with `{ status: "validating" }` immediately before the provider call
   * goes out, and again with the settled state, so a route handler or server
   * action can publish progress without inventing its own status literals.
   */
  onState?: (state: KeyValidationState) => void;
}

function noKeyConfigured(provider: Provider): ProviderKeyFailure {
  return {
    ok: false,
    provider,
    reason: `No ${provider} API key is configured for this merchant`,
  };
}

/**
 * Validates a key against the provider and reports the outcome as
 * `validating` → `valid` | `invalid`. Nothing is persisted: this is the probe
 * the settings screen runs before the merchant commits to saving.
 */
export async function validateProviderKey(
  apiKey: string,
  options: ValidateProviderKeyOptions = {},
): Promise<SettledKeyValidationState> {
  const provider = options.provider ?? DEFAULT_PROVIDER;

  options.onState?.(validatingKeyState(provider));
  const state = await validateApiKey(apiKey, provider);
  options.onState?.(state);

  return state;
}

/**
 * Lists the chat-capable models a key can reach — embedding, audio, image and
 * moderation models are filtered out, since only chat models are selectable.
 *
 * Pass `apiKey` to probe a key the merchant just typed; omit it to use the key
 * already stored for the merchant.
 */
export async function listChatModels(
  input: { merchantId?: string; provider?: Provider; apiKey?: string } = {},
): Promise<ListChatModelsResult> {
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const merchantId = input.merchantId ?? getCurrentMerchantId();
  const apiKey = input.apiKey ?? getProviderConfig(merchantId, provider)?.apiKey;

  if (!apiKey) return noKeyConfigured(provider);

  try {
    return { ok: true, provider, models: filterChatModels(await fetchModelSummaries(apiKey)) };
  } catch (error) {
    return { ok: false, provider, reason: describeOpenAIError(error) };
  }
}

/**
 * Validates a key and, only if the provider accepts it, stores it for the
 * merchant. An optional `selectedModel` is saved in the same write, and is
 * required to be one of the chat-capable models the key can actually reach —
 * so a config can never end up pointing at a model the key cannot use. When no
 * choice is supplied and the stored one is out of reach of the new key, it is
 * cleared rather than left to fail at chat time; the returned config shows it.
 *
 * A rejected key (or an unusable model choice) leaves storage untouched.
 */
export async function validateAndSaveProviderKey(
  input: {
    apiKey: string;
    merchantId?: string;
    provider?: Provider;
    selectedModel?: string | null;
  },
  options: Omit<ValidateProviderKeyOptions, "provider"> = {},
): Promise<SaveProviderKeyResult> {
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const merchantId = input.merchantId ?? getCurrentMerchantId();

  const state = await validateProviderKey(input.apiKey, { ...options, provider });
  if (state.status === "invalid") {
    return { ok: false, provider, reason: state.reason };
  }

  const reaches = (model: string) => state.models.some((listed) => listed.id === model);

  let selectedModel = input.selectedModel;
  if (selectedModel !== undefined && selectedModel !== null && !reaches(selectedModel)) {
    return {
      ok: false,
      provider,
      reason: `"${selectedModel}" is not a chat-capable model available to this key`,
    };
  }

  if (selectedModel === undefined) {
    const stored = getProviderConfig(merchantId, provider)?.selectedModel;
    if (stored !== undefined && stored !== null && !reaches(stored)) selectedModel = null;
  }

  const config = upsertProviderConfig({
    merchantId,
    provider,
    apiKey: input.apiKey,
    selectedModel,
  });

  return { ok: true, config: toPublicProviderConfig(config), models: state.models };
}

/**
 * Saves the merchant's model choice against their already-stored key. Pass
 * `null` to clear the choice and fall back to the configured default model.
 *
 * The id is checked against the chat-capability rules; set `verify` to also
 * confirm the stored key can still reach it, at the cost of a provider call.
 */
export async function saveSelectedModel(input: {
  model: string | null;
  merchantId?: string;
  provider?: Provider;
  verify?: boolean;
}): Promise<SaveSelectedModelResult> {
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const merchantId = input.merchantId ?? getCurrentMerchantId();

  const stored = getProviderConfig(merchantId, provider);
  if (!stored) return noKeyConfigured(provider);

  if (input.model !== null) {
    if (!isChatModel(input.model)) {
      return { ok: false, provider, reason: `"${input.model}" is not a chat-capable model` };
    }

    if (input.verify) {
      const listed = await listChatModels({ merchantId, provider, apiKey: stored.apiKey });
      if (!listed.ok) return listed;
      if (!listed.models.some((model) => model.id === input.model)) {
        return {
          ok: false,
          provider,
          reason: `"${input.model}" is not available to the stored key`,
        };
      }
    }
  }

  const config = updateProviderConfig(merchantId, { selectedModel: input.model }, provider);
  return { ok: true, config: toPublicProviderConfig(config) };
}

export const providerKeyService = {
  validate: validateProviderKey,
  listChatModels,
  saveValidatedKey: validateAndSaveProviderKey,
  saveSelectedModel,
} as const;
