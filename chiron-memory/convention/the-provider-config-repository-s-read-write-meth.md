---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-2
type: convention
title: The provider-config repository's read/write methods are all scoped by an explicit…
tags: [convention]
created: 2026-08-07
resource: lib/server/provider-config-repository.ts
---
The provider-config repository's read/write methods are all scoped by an explicit merchantId parameter, with no fetch-by-id-alone entry point.

## Why
Ensures one merchant's stored credentials can never be reached through another merchant's request context.

## Where
lib/server/provider-config-repository.ts
