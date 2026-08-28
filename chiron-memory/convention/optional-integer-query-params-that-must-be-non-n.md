---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-3
type: convention
title: Optional integer query params that must be non-negative are declared with…
tags: [convention]
created: 2026-08-28
resource: `app/api/products.py` in merchant-catalog.
---
Optional integer query params that must be non-negative are declared with `Query(default=None, ge=0)` in FastAPI routes.

## Why
FastAPI/Pydantic automatically returns 422 for values below the `ge` bound, avoiding manual range checks.

## Where
`app/api/products.py` in merchant-catalog.
