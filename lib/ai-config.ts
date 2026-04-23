/**
 * lib/ai-config.ts
 *
 * Server-side only module that persists the OpenAI configuration to a local
 * JSON file.  The file lives outside the Next.js build output so it survives
 * `next build` in development and the standalone container.
 *
 * Stored schema (ai-config.json):
 *   { "apiKey": string, "model": string }
 *
 * This module must NEVER be imported by client components — it uses Node.js
 * `fs` APIs which are not available in the browser bundle.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiConfig = {
  apiKey: string;
  model: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.resolve(process.cwd(), "ai-config.json");

function readRaw(): Partial<AiConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Partial<AiConfig>;
  } catch {
    // File does not exist or is not valid JSON — return empty config.
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the persisted AI configuration.
 * Returns `null` for each field that has not been set yet.
 */
export function readConfig(): { apiKey: string | null; model: string | null } {
  const raw = readRaw();
  return {
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.length > 0 ? raw.apiKey : null,
    model: typeof raw.model === "string" && raw.model.length > 0 ? raw.model : null,
  };
}

/**
 * Persist the AI configuration.
 * Merges the supplied fields on top of any existing config so that a partial
 * write (e.g. updating only the model) does not erase the stored API key.
 */
export function writeConfig(config: AiConfig): void {
  const existing = readRaw();
  const merged: AiConfig = { ...existing, ...config } as AiConfig;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}
