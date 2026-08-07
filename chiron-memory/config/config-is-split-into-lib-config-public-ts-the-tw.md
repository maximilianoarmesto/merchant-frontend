---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-4
type: config
title: Config is split into lib/config/public.ts (the two NEXT_PUBLIC_* URLs, consumed by…
tags: [config]
created: 2026-08-07
resource: lib/config/public.ts, lib/config/server.ts
---
Config is split into lib/config/public.ts (the two NEXT_PUBLIC_* URLs, consumed by lib/api.ts and the settings page) and lib/config/server.ts (secrets, DB path, OpenAI settings), with server.ts importing the `server-only` package.

## Why
Guarantees at build time (not just by convention) that secrets can't be pulled into a client bundle.

## Where
lib/config/public.ts, lib/config/server.ts
