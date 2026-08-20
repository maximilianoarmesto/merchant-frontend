---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-6
type: convention
title: All commerce read requests set `cache
tags: [convention]
created: 2026-08-20
resource: lib/server/commerce-client.ts.
---
All commerce read requests set `cache: "no-store"`.

## Why
Prevents stale or cross-merchant cached responses from being served for scoped commerce data.

## Where
lib/server/commerce-client.ts.
