---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-9
type: decision
title: `saveSelectedModel` rejects a model id that isn't chat-capable even when saving against…
tags: [decision]
created: 2026-08-13
resource: lib/server/provider-key-service.ts
---
`saveSelectedModel` rejects a model id that isn't chat-capable even when saving against an already-stored (previously validated) key, and supports an optional `verify: true` flag to also confirm the stored key can still reach that model before persisting.

## Where
lib/server/provider-key-service.ts
