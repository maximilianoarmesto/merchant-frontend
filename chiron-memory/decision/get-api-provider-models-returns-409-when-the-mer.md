---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-3
type: decision
title: GET /api/provider/models returns 409 when the merchant has no stored key, and 502 when…
tags: [decision]
created: 2026-08-19
resource: app/api/provider/models/route.ts
---
GET /api/provider/models returns 409 when the merchant has no stored key, and 502 when the provider rejects the key or is unreachable

## Why
lets the settings UI distinguish "no key configured yet" from "key exists but the provider call failed"

## Where
app/api/provider/models/route.ts
