---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-4
type: decision
title: When both `min_stock` and `max_stock` are provided and `min_stock > max_stock`, the route…
tags: [decision]
created: 2026-08-28
resource: `list_products()` in `app/api/products.py`.
---
When both `min_stock` and `max_stock` are provided and `min_stock > max_stock`, the route raises `HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ...)` explicitly and does not call `product_service.list_products()`.

## Why
cross-field validation isn't expressible via FastAPI's per-parameter `Query(...)` constraints, so it's checked manually before delegating to the service.

## Where
`list_products()` in `app/api/products.py`.
