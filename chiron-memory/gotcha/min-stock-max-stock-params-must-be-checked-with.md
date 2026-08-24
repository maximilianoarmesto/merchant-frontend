---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-2
type: gotcha
title: min_stock/max_stock params must be checked with `is not None`, not truthiness, when…
tags: [gotcha]
created: 2026-08-24
resource: merchant-catalog/app/services/product_service.py list_products().
---
min_stock/max_stock params must be checked with `is not None`, not truthiness, when deciding whether to add a `.where()` clause.

## Why
0 is a valid, meaningful bound (e.g. max_stock=0 means "only out-of-stock products") and a truthy check would silently drop that filter.

## Learned
any future optional-int-filter param in this codebase needs the same `is not None` guard.

## Where
merchant-catalog/app/services/product_service.py list_products().
