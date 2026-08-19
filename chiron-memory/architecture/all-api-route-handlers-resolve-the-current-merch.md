---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-1
type: architecture
title: All API route handlers resolve the current merchant exclusively through…
tags: [architecture]
created: 2026-08-19
resource: lib/server/api-route.ts
---
All API route handlers resolve the current merchant exclusively through lib/server/api-route.ts's getMerchantSession(), which wraps the platform's existing getCommerceAuthContext()

## Why
keeps merchant/session resolution logic in one place instead of duplicating auth lookups per route

## Where
lib/server/api-route.ts
