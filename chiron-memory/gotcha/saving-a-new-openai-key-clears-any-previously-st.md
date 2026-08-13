---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-3
type: gotcha
title: Saving a new OpenAI key clears any previously stored model selection if the new key can't…
tags: [gotcha]
created: 2026-08-13
resource: lib/server/provider-key-service.ts (validateAndSaveProviderKey)
---
Saving a new OpenAI key clears any previously stored model selection if the new key can't reach that model, falling back to the configured default rather than leaving a stale, unreachable selection on file.

## Why
A stale model selection surviving a key change would break chat at request time.

## Where
lib/server/provider-key-service.ts (validateAndSaveProviderKey)
