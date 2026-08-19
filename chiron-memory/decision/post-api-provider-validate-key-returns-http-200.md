---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-0
type: decision
title: POST /api/provider/validate-key returns HTTP 200 with body {status:"valid"|"invalid",…
tags: [decision]
created: 2026-08-19
resource: app/api/provider/validate-key/route.ts
---
POST /api/provider/validate-key returns HTTP 200 with body {status:"valid"|"invalid", reason} for both accepted and rejected keys, never a 4xx for a rejected key

## Why
"this key is rejected, because…" is a successful answer to a validation request, not a failure of the request itself

## Where
app/api/provider/validate-key/route.ts
