---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-5
type: decision
title: Key validation happens only on explicit user/API request
tags: [decision]
created: 2026-08-13
resource: lib/server/provider-key-service.ts
---
Key validation happens only on explicit user/API request — there is no periodic or background re-validation of stored OpenAI keys.

## Where
lib/server/provider-key-service.ts
