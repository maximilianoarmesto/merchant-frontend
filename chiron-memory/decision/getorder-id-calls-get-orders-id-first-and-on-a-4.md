---
id: 84894289-bf70-419a-888e-f9b64449c98f-7
type: decision
title: getOrder(id) calls GET /orders/{id} first, and on a 404/405 response falls back to…
tags: [decision]
created: 2026-08-13
resource: lib/server/commerce-repository.ts
---
getOrder(id) calls GET /orders/{id} first, and on a 404/405 response falls back to fetching the merchant's GET /orders list and selecting the matching order client-side

## Why
The checkout FastAPI service's routes aren't in this repo, so whether a dedicated order-detail endpoint exists was unconfirmed at implementation time; the fallback keeps getOrder working either way while staying read-only and merchant-scoped

## Learned
If the checkout service's real routes become known, this fallback should be removed and the call pinned to the actual endpoint.

## Where
lib/server/commerce-repository.ts
