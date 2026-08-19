---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-5
type: decision
title: POST /api/chat maps ChatError.code to HTTP status
tags: [decision]
created: 2026-08-19
resource: app/api/chat/route.ts
---
POST /api/chat maps ChatError.code to HTTP status — key_missing/key_rejected/model_unavailable → 409, rate_limit → 429, unavailable → 503, anything else → 502

## Why
gives the frontend a consistent way to detect the re-validate-key case (409) versus transient provider failures

## Where
app/api/chat/route.ts
