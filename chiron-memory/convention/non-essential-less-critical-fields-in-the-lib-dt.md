---
id: 84894289-bf70-419a-888e-f9b64449c98f-10
type: convention
title: Non-essential/less-critical fields in the lib/dto/commerce.ts zod schemas are marked…
tags: [convention]
created: 2026-08-13
resource: lib/dto/commerce.ts
---
Non-essential/less-critical fields in the lib/dto/commerce.ts zod schemas are marked optional rather than required

## Why
An upstream FastAPI field addition/removal shouldn't break parsing of reads that don't depend on that field

## Where
lib/dto/commerce.ts
