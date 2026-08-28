---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-2
type: architecture
title: `product_service.list_products()` already builds SQLAlchemy WHERE conditions for…
tags: [architecture]
created: 2026-08-28
resource: `app/services/product_service.py` in merchant-catalog.
---
`product_service.list_products()` already builds SQLAlchemy WHERE conditions for `in_stock`, `min_stock`, and `max_stock` filters in the query layer (added by a prior commit "Build SQLAlchemy stock WHERE conditions in the query layer").

## Why
the API layer only needs to validate and forward these params — the filtering logic already exists in the service.

## Where
`app/services/product_service.py` in merchant-catalog.
