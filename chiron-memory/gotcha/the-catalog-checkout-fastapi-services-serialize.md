---
id: 84894289-bf70-419a-888e-f9b64449c98f-2
type: gotcha
title: The catalog/checkout FastAPI services serialize Pydantic Decimal fields (e.g.…
tags: [gotcha]
created: 2026-08-13
resource: lib/dto/commerce.ts
---
The catalog/checkout FastAPI services serialize Pydantic Decimal fields (e.g. price/amount) as JSON strings, not numbers

## Why
zod schemas for these payloads must use z.coerce.number() rather than z.number(), matching how the existing lib/api.ts pages already did Number(product.price)

## Learned
A plain z.number() would fail validation on real upstream responses.

## Where
lib/dto/commerce.ts
