---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-10
type: convention
title: PROVIDER_CONFIG_ENCRYPTION_KEY accepts three input formats
tags: [convention]
created: 2026-08-07
resource: lib/server/crypto.ts
---
PROVIDER_CONFIG_ENCRYPTION_KEY accepts three input formats — hex, base64, or a raw passphrase string — and lib/server/crypto.ts normalizes any of them into the AES-256-GCM key material.

## Why
Lets operators supply the key in whatever format their secrets manager produces without a conversion step.

## Where
lib/server/crypto.ts
