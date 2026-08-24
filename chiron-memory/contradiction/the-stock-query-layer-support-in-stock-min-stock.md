---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-3
type: contradiction
title: The stock query-layer support (in_stock/min_stock/max_stock) added to list_products() is…
tags: [contradiction]
created: 2026-08-24
resource: merchant-catalog/app/api/products.py; lib/server/commerce-repository.ts (frontend).
---
The stock query-layer support (in_stock/min_stock/max_stock) added to list_products() is not yet reachable end-to-end: app/api/products.py's `GET /products` route only accepts `include_inactive`, and the frontend's listProducts passthrough doesn't forward these params either.

## Why
task's acceptance criteria were scoped to the query builder only, so router/frontend wiring was deliberately left out.

## Learned
before assuming the stock filter feature is usable via HTTP or UI, check whether the router/frontend passthrough has since been added — as of this session it had not.

## Where
merchant-catalog/app/api/products.py; lib/server/commerce-repository.ts (frontend).
