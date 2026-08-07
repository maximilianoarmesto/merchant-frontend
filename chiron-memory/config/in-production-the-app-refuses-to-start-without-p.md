---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-7
type: config
title: In production, the app refuses to start without PROVIDER_CONFIG_ENCRYPTION_KEY set…
tags: [config]
created: 2026-08-07
resource: lib/server/crypto.ts
---
In production, the app refuses to start without PROVIDER_CONFIG_ENCRYPTION_KEY set (throws); in development it falls back to a generated key with a console warning that stored keys are not durable.

## Why
Prevents silently running production with an ephemeral/insecure encryption key.

## Where
lib/server/crypto.ts
