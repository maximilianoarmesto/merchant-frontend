---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-7
type: architecture
title: The service layer exposes four functions covering the full key lifecycle
tags: [architecture]
created: 2026-08-13
resource: lib/server/provider-key-service.ts
---
The service layer exposes four functions covering the full key lifecycle: `validateProviderKey` (probe only, no persistence, reports validating→valid/invalid via an `onState` callback), `listChatModels` (uses a passed-in key or falls back to the merchant's stored key), `validateAndSaveProviderKey` (validate-then-persist), and `saveSelectedModel` (persist a model choice against an already-stored key, with an optional `verify` step).

## Where
lib/server/provider-key-service.ts
