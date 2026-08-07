---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-3
type: convention
title: API keys are encrypted at rest with AES-256-GCM in a versioned envelope format…
tags: [convention]
created: 2026-08-07
resource: lib/server/crypto.ts
---
API keys are encrypted at rest with AES-256-GCM in a versioned envelope format `v1.<iv>.<tag>.<ciphertext>`.

## Why
Versioning the envelope allows swapping the encryption scheme later without breaking decryption of already-stored records.

## Where
lib/server/crypto.ts
