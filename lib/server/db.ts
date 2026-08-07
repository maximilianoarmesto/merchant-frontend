import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

import { serverConfig } from "@/lib/config/server";

/**
 * SQLite connection used for merchant-owned settings that belong to this
 * frontend rather than to the catalog or checkout services.
 *
 * The connection is cached on `globalThis` so Next.js hot reloads in dev reuse
 * one handle instead of leaking a file descriptor per recompile.
 */

const globalForDb = globalThis as typeof globalThis & {
  __merchantDb?: Database.Database;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS provider_configs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id    TEXT NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'openai',
  -- AES-256-GCM ciphertext, never a plaintext key. See lib/server/crypto.ts.
  api_key        TEXT NOT NULL,
  selected_model TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- One config per provider per merchant; this is what makes upserts safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_configs_merchant_provider
  ON provider_configs (merchant_id, provider);
`;

function openDatabase(): Database.Database {
  const path = resolve(process.cwd(), serverConfig.databasePath);
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/** Returns the shared connection, opening and migrating it on first use. */
export function getDb(): Database.Database {
  if (!globalForDb.__merchantDb) {
    globalForDb.__merchantDb = openDatabase();
  }
  return globalForDb.__merchantDb;
}

/** Closes the shared connection. Intended for tests and graceful shutdown. */
export function closeDb(): void {
  globalForDb.__merchantDb?.close();
  globalForDb.__merchantDb = undefined;
}

/** ISO-8601 UTC timestamp, the format every `*_at` column stores. */
export function nowIso(): string {
  return new Date().toISOString();
}
