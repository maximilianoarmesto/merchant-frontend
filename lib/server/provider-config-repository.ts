import "server-only";

import { getDb, nowIso } from "@/lib/server/db";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import {
  DEFAULT_PROVIDER,
  isProvider,
  toPublicProviderConfig,
  type CreateProviderConfigInput,
  type Provider,
  type ProviderConfig,
  type ProviderConfigRecord,
  type PublicProviderConfig,
  type UpdateProviderConfigInput,
} from "@/lib/models/provider-config";

/**
 * Data access for per-merchant provider configuration.
 *
 * Every read/write is scoped by `merchantId` — there is deliberately no
 * "fetch by id alone" entry point, so a caller cannot accidentally hand one
 * merchant another merchant's credentials. Encryption and decryption happen
 * here, which keeps ciphertext from escaping into the rest of the app.
 */

export class ProviderConfigNotFoundError extends Error {
  constructor(merchantId: string, provider: Provider) {
    super(`No ${provider} config found for merchant "${merchantId}"`);
    this.name = "ProviderConfigNotFoundError";
  }
}

export class ProviderConfigConflictError extends Error {
  constructor(merchantId: string, provider: Provider) {
    super(`A ${provider} config already exists for merchant "${merchantId}"`);
    this.name = "ProviderConfigConflictError";
  }
}

interface ProviderConfigRow {
  id: number;
  merchant_id: string;
  provider: string;
  api_key: string;
  selected_model: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: ProviderConfigRow): ProviderConfigRecord {
  if (!isProvider(row.provider)) {
    throw new Error(
      `Stored config ${row.id} has unknown provider "${row.provider}"`,
    );
  }
  return {
    id: row.id,
    merchantId: row.merchant_id,
    provider: row.provider,
    apiKey: row.api_key,
    selectedModel: row.selected_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDecrypted(record: ProviderConfigRecord): ProviderConfig {
  return { ...record, apiKey: decryptSecret(record.apiKey) };
}

function selectRow(merchantId: string, provider: Provider): ProviderConfigRow | undefined {
  return getDb()
    .prepare<[string, string]>(
      `SELECT id, merchant_id, provider, api_key, selected_model, created_at, updated_at
         FROM provider_configs
        WHERE merchant_id = ? AND provider = ?`,
    )
    .get(merchantId, provider) as ProviderConfigRow | undefined;
}

/** Raw record with the key still encrypted. Prefer `getProviderConfig`. */
export function getProviderConfigRecord(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): ProviderConfigRecord | null {
  const row = selectRow(merchantId, provider);
  return row ? toRecord(row) : null;
}

/**
 * Fetches a merchant's config with the API key decrypted.
 * Server-side only — never return this from a route handler as-is.
 */
export function getProviderConfig(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): ProviderConfig | null {
  const record = getProviderConfigRecord(merchantId, provider);
  return record ? toDecrypted(record) : null;
}

/** Browser-safe projection: no key, just a masked hint. */
export function getPublicProviderConfig(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): PublicProviderConfig | null {
  const config = getProviderConfig(merchantId, provider);
  return config ? toPublicProviderConfig(config) : null;
}

/** Whether the merchant has a usable key on file. */
export function hasProviderConfig(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): boolean {
  return getProviderConfigRecord(merchantId, provider) !== null;
}

/**
 * Decrypted API key for outbound provider calls.
 * Throws when the merchant has not configured one.
 */
export function getProviderApiKey(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): string {
  const config = getProviderConfig(merchantId, provider);
  if (!config) throw new ProviderConfigNotFoundError(merchantId, provider);
  return config.apiKey;
}

/** Creates a config. Throws `ProviderConfigConflictError` if one exists. */
export function createProviderConfig(input: CreateProviderConfigInput): ProviderConfig {
  const provider = input.provider ?? DEFAULT_PROVIDER;
  const merchantId = input.merchantId;

  if (hasProviderConfig(merchantId, provider)) {
    throw new ProviderConfigConflictError(merchantId, provider);
  }

  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO provider_configs
         (merchant_id, provider, api_key, selected_model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      merchantId,
      provider,
      encryptSecret(input.apiKey),
      input.selectedModel ?? null,
      timestamp,
      timestamp,
    );

  const created = getProviderConfig(merchantId, provider);
  if (!created) throw new Error("Provider config vanished immediately after insert");
  return created;
}

/**
 * Updates an existing config. Omitted fields keep their current value;
 * passing `selectedModel: null` explicitly clears the model.
 */
export function updateProviderConfig(
  merchantId: string,
  input: UpdateProviderConfigInput,
  provider: Provider = DEFAULT_PROVIDER,
): ProviderConfig {
  const existing = getProviderConfigRecord(merchantId, provider);
  if (!existing) throw new ProviderConfigNotFoundError(merchantId, provider);

  const apiKey =
    input.apiKey !== undefined ? encryptSecret(input.apiKey) : existing.apiKey;
  const selectedModel =
    input.selectedModel !== undefined ? input.selectedModel : existing.selectedModel;

  getDb()
    .prepare(
      `UPDATE provider_configs
          SET api_key = ?, selected_model = ?, updated_at = ?
        WHERE merchant_id = ? AND provider = ?`,
    )
    .run(apiKey, selectedModel, nowIso(), merchantId, provider);

  const updated = getProviderConfig(merchantId, provider);
  if (!updated) throw new ProviderConfigNotFoundError(merchantId, provider);
  return updated;
}

/**
 * Creates or updates in one call — what the settings screen saves through.
 * On create, `apiKey` is required; on update it is optional, so a merchant can
 * change models without re-entering their key.
 */
export function upsertProviderConfig(input: {
  merchantId: string;
  provider?: Provider;
  apiKey?: string;
  selectedModel?: string | null;
}): ProviderConfig {
  const provider = input.provider ?? DEFAULT_PROVIDER;

  if (hasProviderConfig(input.merchantId, provider)) {
    return updateProviderConfig(
      input.merchantId,
      { apiKey: input.apiKey, selectedModel: input.selectedModel },
      provider,
    );
  }

  if (input.apiKey === undefined) {
    throw new ProviderConfigNotFoundError(input.merchantId, provider);
  }

  return createProviderConfig({
    merchantId: input.merchantId,
    provider,
    apiKey: input.apiKey,
    selectedModel: input.selectedModel ?? null,
  });
}

/** Deletes a merchant's config. Returns whether a row was removed. */
export function deleteProviderConfig(
  merchantId: string,
  provider: Provider = DEFAULT_PROVIDER,
): boolean {
  const result = getDb()
    .prepare(`DELETE FROM provider_configs WHERE merchant_id = ? AND provider = ?`)
    .run(merchantId, provider);
  return result.changes > 0;
}

export const providerConfigRepository = {
  get: getProviderConfig,
  getRecord: getProviderConfigRecord,
  getPublic: getPublicProviderConfig,
  getApiKey: getProviderApiKey,
  has: hasProviderConfig,
  create: createProviderConfig,
  update: updateProviderConfig,
  upsert: upsertProviderConfig,
  remove: deleteProviderConfig,
} as const;
