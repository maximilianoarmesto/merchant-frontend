---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-2
type: decision
title: `validateAndSaveProviderKey` persists the key/model only when validation succeeds
tags: [decision]
created: 2026-08-13
resource: lib/server/provider-key-service.ts
---
`validateAndSaveProviderKey` persists the key/model only when validation succeeds; a rejected key or a `selectedModel` the key can't reach returns `{ ok: false, reason }` with no write to the repository.

## Why
Prevents storing unusable credentials or a model choice the key can never serve.

## Where
lib/server/provider-key-service.ts
