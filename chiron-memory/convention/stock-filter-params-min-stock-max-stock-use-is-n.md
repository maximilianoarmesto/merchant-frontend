---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-3
type: convention
title: Stock filter params (min_stock, max_stock) use `is not None` checks rather than…
tags: [convention]
created: 2026-08-28
resource: app/services/product_service.py
---
Stock filter params (min_stock, max_stock) use `is not None` checks rather than truthiness, so a value of 0 is treated as a real bound and still emits its predicate

## Why
truthiness checks would silently drop a min_stock=0 or max_stock=0 filter

## Learned
always test boundary value 0 explicitly when adding numeric optional filters in this service.

## Where
app/services/product_service.py
