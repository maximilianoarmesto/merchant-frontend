---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-1
type: architecture
title: `list_products()` in app/services/product_service.py (merchant-catalog repo) builds one…
tags: [architecture]
created: 2026-08-24
resource: merchant-catalog/app/services/product_service.py.
---
`list_products()` in app/services/product_service.py (merchant-catalog repo) builds one SQLAlchemy `select(Product)` statement and chains `.where()` calls per active filter (include_inactive, in_stock, min_stock, max_stock) so all filtering happens server-side as SQL predicates.

## Learned
this is the pattern to follow for adding further product filters — extend the same chained `.where()` composition rather than post-filtering in Python.

## Where
merchant-catalog/app/services/product_service.py.
