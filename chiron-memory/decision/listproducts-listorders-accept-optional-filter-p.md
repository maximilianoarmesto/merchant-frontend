---
id: 84894289-bf70-419a-888e-f9b64449c98f-13
type: decision
title: listProducts/listOrders accept optional filter params (category, is_active, status,…
tags: [decision]
created: 2026-08-13
resource: lib/server/commerce-repository.ts
---
listProducts/listOrders accept optional filter params (category, is_active, status, limit, offset) forwarded as query-string params to the upstream service

## Why
Supports filtering if the upstream FastAPI service implements it, while degrading harmlessly (params simply ignored) if it doesn't, since the actual checkout/catalog routes aren't in this repo to confirm support

## Where
lib/server/commerce-repository.ts
