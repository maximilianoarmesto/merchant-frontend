---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-5
type: gotcha
title: The catalog/checkout services used by the frontend during local testing run as long-lived…
tags: [gotcha]
created: 2026-08-24
---
The catalog/checkout services used by the frontend during local testing run as long-lived Docker containers (merchant-catalog, merchant-checkout-payment, merchant-postgres) that are NOT rebuilt automatically when the catalog source is edited.

## Why
after patching product_service.py, hitting the running catalog at its container port still showed old behavior (in_stock/min_stock params silently ignored) since the container still ran the pre-edit code.

## Learned
after changing merchant-catalog source, the container must be rebuilt/restarted before the change is observable through the frontend UI or via curl against the running service.
