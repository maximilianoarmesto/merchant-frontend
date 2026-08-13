---
id: 84894289-bf70-419a-888e-f9b64449c98f-3
type: architecture
title: commerce-client.ts scopes every upstream request to the current merchant by forwarding…
tags: [architecture]
created: 2026-08-13
resource: lib/server/commerce-client.ts (getCommerceAuthContext)
---
commerce-client.ts scopes every upstream request to the current merchant by forwarding the inbound Cookie, Authorization and X-Request-Id headers verbatim, plus an X-Merchant-Id header (taken from the inbound request header, else falling back to getCurrentMerchantId())

## Why
Satisfies the requirement that catalog/checkout queries stay scoped to the current merchant without creating new auth logic

## Where
lib/server/commerce-client.ts (getCommerceAuthContext)
