---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-4
type: gotcha
title: Route handlers that call getMerchantSession() must set `export const dynamic =…
tags: [gotcha]
created: 2026-08-19
resource: app/api/provider/models/route.ts and other route.ts files using getMerchantSession
---
Route handlers that call getMerchantSession() must set `export const dynamic = "force-dynamic"` and `export const runtime = "nodejs"`

## Why
the session lookup swallows Next's dynamic-rendering detection throw, so without the explicit opt-out a GET route gets statically prerendered using the build-time merchant's data instead of the caller's

## Where
app/api/provider/models/route.ts and other route.ts files using getMerchantSession
