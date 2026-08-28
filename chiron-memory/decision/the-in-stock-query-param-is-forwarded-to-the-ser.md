---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-5
type: decision
title: The `in_stock` query param is forwarded to the service as `bool(in_stock)` rather than…
tags: [decision]
created: 2026-08-28
resource: `list_products()` in `app/api/products.py`.
---
The `in_stock` query param is forwarded to the service as `bool(in_stock)` rather than passing `None` through when unset.

## Why
unset and `false` are treated as equivalent for this filter, collapsing to the service's existing `False` default and preserving prior behavior.

## Where
`list_products()` in `app/api/products.py`.
