/**
 * Per-merchant AI provider configuration.
 *
 * Three views of the same record exist, and keeping them distinct is what
 * prevents the API key from leaking:
 *
 * - `ProviderConfigRecord` — exactly what the database holds. `apiKey` is
 *   ciphertext.
 * - `ProviderConfig` — the decrypted, server-side view. Never serialize it.
 * - `PublicProviderConfig` — the browser-safe projection: no key, just whether
 *   one is set plus a masked hint.
 */

export const PROVIDERS = ["openai"] as const;

export type Provider = (typeof PROVIDERS)[number];

export const DEFAULT_PROVIDER: Provider = "openai";

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

/** A row of the `provider_configs` table. `apiKey` holds ciphertext. */
export interface ProviderConfigRecord {
  id: number;
  merchantId: string;
  provider: Provider;
  /** AES-256-GCM ciphertext — see `lib/server/crypto.ts`. */
  apiKey: string;
  selectedModel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Server-side view with the key decrypted. Must never cross to the browser. */
export interface ProviderConfig extends Omit<ProviderConfigRecord, "apiKey"> {
  /** Plaintext API key. */
  apiKey: string;
}

/** What a browser is allowed to see about a merchant's provider config. */
export interface PublicProviderConfig {
  merchantId: string;
  provider: Provider;
  selectedModel: string | null;
  hasApiKey: boolean;
  /** Last four characters of the key, e.g. `••••abcd`. `null` when unset. */
  apiKeyHint: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when creating a config. */
export interface CreateProviderConfigInput {
  merchantId: string;
  provider?: Provider;
  /** Plaintext key; the repository encrypts it before writing. */
  apiKey: string;
  selectedModel?: string | null;
}

/** Fields accepted when updating a config. Omitted fields are left untouched. */
export interface UpdateProviderConfigInput {
  /** Plaintext key; the repository encrypts it before writing. */
  apiKey?: string;
  selectedModel?: string | null;
}

/** Masks a plaintext key down to a hint that is safe to render. */
export function maskApiKey(apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (trimmed === "") return null;
  return `••••${trimmed.slice(-4)}`;
}

/** Projects a server-side config onto the browser-safe shape. */
export function toPublicProviderConfig(config: ProviderConfig): PublicProviderConfig {
  return {
    merchantId: config.merchantId,
    provider: config.provider,
    selectedModel: config.selectedModel,
    hasApiKey: config.apiKey.trim() !== "",
    apiKeyHint: maskApiKey(config.apiKey),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}
