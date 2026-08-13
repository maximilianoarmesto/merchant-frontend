---
id: 84894289-bf70-419a-888e-f9b64449c98f-1
type: convention
title: Commerce data has two parallel type systems
tags: [convention]
created: 2026-08-13
resource: lib/api.ts vs lib/models/commerce.ts, lib/dto/commerce.ts
---
Commerce data has two parallel type systems — lib/api.ts keeps snake_case types for existing browser-side pages, while the new server-only commerce module uses camelCase domain models (lib/models/commerce.ts) hydrated via zod schemas (lib/dto/commerce.ts)

## Why
Avoids touching/breaking existing client-side pages while giving the new server-only repository stronger validation and idiomatic naming

## Where
lib/api.ts vs lib/models/commerce.ts, lib/dto/commerce.ts
