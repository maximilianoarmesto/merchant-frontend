---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-8
type: decision
title: The validate-key route obtains modelCount via provider-key-service's onState callback…
tags: [decision]
created: 2026-08-19
resource: lib/server/provider-key-service.ts, app/api/provider/validate-key/route.ts
---
The validate-key route obtains modelCount via provider-key-service's onState callback during the same validation call instead of issuing a separate list-models request

## Why
avoids a redundant provider round-trip when storing a key

## Where
lib/server/provider-key-service.ts, app/api/provider/validate-key/route.ts
