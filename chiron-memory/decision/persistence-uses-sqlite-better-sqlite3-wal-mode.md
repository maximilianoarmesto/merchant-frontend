---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-8
type: decision
title: Persistence uses SQLite (better-sqlite3, WAL mode) with a `provider_configs` table…
tags: [decision]
created: 2026-08-07
resource: lib/server/db.ts, lib/server/provider-config-repository.ts
---
Persistence uses SQLite (better-sqlite3, WAL mode) with a `provider_configs` table (unique index on merchant_id+provider), and merchant identity is currently a DEFAULT_MERCHANT_ID placeholder since there's no auth/session system yet.

## Why
No database or auth existed in the repo; SQLite was the lightest option that still supports real persistence and per-merchant scoping via an explicit merchantId param on every repository call, so swapping the placeholder for real session lookup later only touches callers, not the data layer.

## Where
lib/server/db.ts, lib/server/provider-config-repository.ts
