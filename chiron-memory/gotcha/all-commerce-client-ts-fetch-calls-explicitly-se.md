---
id: 84894289-bf70-419a-888e-f9b64449c98f-9
type: gotcha
title: All commerce-client.ts fetch calls explicitly set cache
tags: [gotcha]
created: 2026-08-13
resource: lib/server/commerce-client.ts
---
All commerce-client.ts fetch calls explicitly set cache: "no-store"

## Why
Next.js fetch() caches by default in Server Components, which could otherwise serve stale or cross-merchant-leaked commerce data since responses are merchant-scoped via forwarded headers

## Where
lib/server/commerce-client.ts
