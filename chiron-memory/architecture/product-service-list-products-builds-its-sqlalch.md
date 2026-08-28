---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-2
type: architecture
title: product_service.list_products() builds its SQLAlchemy query by starting from the existing…
tags: [architecture]
created: 2026-08-28
resource: app/services/product_service.py in the merchant-catalog service
---
product_service.list_products() builds its SQLAlchemy query by starting from the existing select(Product) and chaining one additional .where() clause per active filter (include_inactive, in_stock, min_stock, max_stock)

## Why
keeps the no-filters SQL string-identical to the pre-change implementation, satisfying the backward-compatibility requirement

## Learned
new optional filters should be implemented as conditionally-appended .where() clauses, not by rewriting the base query.

## Where
app/services/product_service.py in the merchant-catalog service
