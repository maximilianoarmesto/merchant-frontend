/**
 * @module lib/ai-config
 * @server-only
 *
 * Server-side-only utility for reading and writing the OpenAI configuration.
 *
 * The configuration is persisted as a JSON file at `.ai-config.json` in the
 * project root (gitignored).  Because the file lives outside the Next.js
 * build output, it survives `next build`, hot reloads, and server restarts.
 *
 * Stored schema:
 *   { "apiKey": string, "model": string }
 *
 * PUBLIC API
 * ----------
 *   readAIConfig()  → Promise<AIConfig | null>
 *     Returns the full config object, or null if no config has been saved yet.
 *
 *   writeAIConfig() → Promise<void>
 *     Persists the config atomically via a write-then-rename pattern so that
 *     a crash mid-write never leaves a partially-written file.
 *
 * LEGACY SYNCHRONOUS HELPERS (used by Route Handlers)
 * ----------------------------------------------------
 *   readConfig()  → { apiKey: string | null; model: string | null }
 *   writeConfig() → void
 *
 * ⚠️  This module MUST NOT be imported by Client Components or any code that
 *    is bundled for the browser.  It relies on Node.js `fs` APIs and the
 *    `server-only` guard enforces this at build time.
 */

// The `server-only` import is a build-time guard: Next.js will throw a
// meaningful error if this module is accidentally included in a client bundle.
import "server-only";

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape of the persisted OpenAI configuration. */
export type AIConfig = {
  apiKey: string;
  model: string;
};

/**
 * Alias kept for backward-compatibility with existing Route Handlers that
 * were written before the canonical `AIConfig` name was established.
 */
export type AiConfig = AIConfig;

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Absolute path to the persisted config file. */
const CONFIG_PATH = path.resolve(process.cwd(), ".ai-config.json");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely read and parse the config file.
 * Returns a partial object (possibly empty) on any error so callers can
 * always spread over the result without null-checking.
 */
function readRaw(): Partial<AIConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Partial<AIConfig>;
  } catch {
    // File does not exist or contains malformed JSON — return an empty object.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Async public API (primary — satisfies acceptance criteria)
// ---------------------------------------------------------------------------

/**
 * Read the persisted AI configuration asynchronously.
 *
 * @returns The stored `AIConfig` object, or `null` if no complete config
 *          (with both `apiKey` and `model`) has been saved yet.
 */
export async function readAIConfig(): Promise<AIConfig | null> {
  let raw: string;
  try {
    raw = await fsPromises.readFile(CONFIG_PATH, "utf-8");
  } catch {
    // File does not exist yet.
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // File is present but contains malformed JSON — treat as missing.
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).apiKey !== "string" ||
    ((parsed as Record<string, unknown>).apiKey as string).length === 0 ||
    typeof (parsed as Record<string, unknown>).model !== "string" ||
    ((parsed as Record<string, unknown>).model as string).length === 0
  ) {
    return null;
  }

  return parsed as AIConfig;
}

/**
 * Persist the AI configuration asynchronously using an atomic
 * write-then-rename pattern.
 *
 * The config is first written to a temporary file in the same directory as
 * the target.  A same-filesystem rename (atomic on POSIX) then replaces the
 * target so that a crash mid-write never leaves a partially-written file.
 *
 * @param config - The complete `AIConfig` to persist.
 */
export async function writeAIConfig(config: AIConfig): Promise<void> {
  const dir = path.dirname(CONFIG_PATH);
  const tmpPath = path.join(dir, `.ai-config.${process.pid}.${Date.now()}.tmp`);

  try {
    await fsPromises.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
    await fsPromises.rename(tmpPath, CONFIG_PATH);
  } catch (err) {
    // Best-effort cleanup of the temp file; ignore secondary errors.
    await fsPromises.unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Synchronous helpers (legacy — used by Route Handlers and existing tests)
// ---------------------------------------------------------------------------

/**
 * Read the persisted AI configuration synchronously.
 *
 * Each field is returned as `null` when the stored value is absent or is an
 * empty string, so callers can distinguish "not set" from "set to empty".
 *
 * @returns An object with `apiKey` and `model`, each `string | null`.
 */
export function readConfig(): { apiKey: string | null; model: string | null } {
  const raw = readRaw();
  return {
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.length > 0 ? raw.apiKey : null,
    model: typeof raw.model === "string" && raw.model.length > 0 ? raw.model : null,
  };
}

/**
 * Persist the AI configuration synchronously.
 *
 * The supplied fields are merged on top of any existing config so that a
 * partial write (e.g. updating only the model) does not erase a stored key.
 *
 * @param config - The `AIConfig` fields to persist.
 */
export function writeConfig(config: AIConfig): void {
  const existing = readRaw();
  const merged: AIConfig = { ...existing, ...config } as AIConfig;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}
