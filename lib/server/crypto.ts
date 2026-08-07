import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { serverConfig } from "@/lib/config/server";

/**
 * Envelope encryption for stored provider secrets.
 *
 * Format: `v1.<iv>.<authTag>.<ciphertext>`, each part base64url. The version
 * prefix leaves room to rotate the algorithm without a migration that has to
 * guess at what old rows contain.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12; // 96-bit nonce, the size GCM is specified for
const KEY_LENGTH = 32;

/** Fixed salt: the input is already a high-entropy secret, not a password. */
const KEY_SALT = "merchant-frontend/provider-config/v1";

const DEV_FALLBACK_SECRET = "insecure-development-key-do-not-use-in-production";

let cachedKey: Buffer | null = null;
let warnedAboutDevKey = false;

function decodeConfiguredKey(raw: string): Buffer {
  // A 32-byte key supplied as hex or base64 is used directly; anything else is
  // treated as a passphrase and stretched.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const base64 = Buffer.from(raw, "base64");
  if (base64.length === KEY_LENGTH && base64.toString("base64").replace(/=+$/, "") === raw.replace(/=+$/, "")) {
    return base64;
  }
  return scryptSync(raw, KEY_SALT, KEY_LENGTH);
}

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = serverConfig.encryptionKey;
  if (configured) {
    cachedKey = decodeConfiguredKey(configured);
    return cachedKey;
  }

  if (serverConfig.isProduction) {
    throw new Error(
      "PROVIDER_CONFIG_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -base64 32",
    );
  }

  if (!warnedAboutDevKey) {
    warnedAboutDevKey = true;
    console.warn(
      "[crypto] PROVIDER_CONFIG_ENCRYPTION_KEY is unset — falling back to a development key. Stored API keys are NOT protected.",
    );
  }
  cachedKey = scryptSync(DEV_FALLBACK_SECRET, KEY_SALT, KEY_LENGTH);
  return cachedKey;
}

/** Test seam: forces the next call to re-read the environment. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}

/** Encrypts a secret for storage. Returns an opaque, versioned string. */
export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export class DecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DecryptionError";
  }
}

/** Reverses `encryptSecret`. Throws `DecryptionError` on tampering or key mismatch. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new DecryptionError("Stored secret is not in the expected v1 envelope format");
  }

  const [, ivPart, tagPart, ciphertextPart] = parts;
  const key = resolveKey();
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");

  if (iv.length !== IV_LENGTH) {
    throw new DecryptionError("Stored secret has a malformed nonce");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (cause) {
    throw new DecryptionError(
      "Failed to decrypt stored secret — the encryption key may have changed",
      { cause },
    );
  }
}

/** Constant-time comparison, for anywhere a secret is checked for equality. */
export function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
