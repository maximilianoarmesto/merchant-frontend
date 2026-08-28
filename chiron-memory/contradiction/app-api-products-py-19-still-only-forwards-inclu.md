---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-4
type: contradiction
title: app/api/products.py:19 still only forwards include_inactive to…
tags: [contradiction]
created: 2026-08-28
---
app/api/products.py:19 still only forwards include_inactive to product_service.list_products() — the new in_stock/min_stock/max_stock params exist in the service layer but are unreachable over HTTP until the route is updated separately

## Why
this task was scoped to the service layer only, so route wiring is a distinct follow-up task

## Learned
don't assume service-layer param support means the feature is end-to-end usable; check the API route layer too.
