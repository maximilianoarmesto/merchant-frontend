---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-0
type: architecture
title: The provider-config model is split into three distinct types
tags: [architecture]
created: 2026-08-07
resource: lib/models/provider-config.ts
---
The provider-config model is split into three distinct types — ProviderConfigRecord (as persisted, key is ciphertext), ProviderConfig (decrypted, server-side only), and PublicProviderConfig (browser-safe, no key — just hasApiKey + masked hint).

## Why
Prevents accidental leakage of the raw or encrypted key to the browser by making the safe-to-serialize shape a distinct type from the internal ones.

## Where
lib/models/provider-config.ts
