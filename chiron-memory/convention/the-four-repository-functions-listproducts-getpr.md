---
id: 84894289-bf70-419a-888e-f9b64449c98f-12
type: convention
title: The four repository functions (listProducts, getProduct, listOrders, getOrder) are…
tags: [convention]
created: 2026-08-13
resource: lib/server/commerce-repository.ts
---
The four repository functions (listProducts, getProduct, listOrders, getOrder) are exported individually and also bundled together as a single commerceRepository object

## Why
Gives callers the choice of importing individual functions or the whole repository as one unit

## Where
lib/server/commerce-repository.ts
