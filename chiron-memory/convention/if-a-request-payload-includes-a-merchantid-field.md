---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-2
type: convention
title: If a request payload includes a merchantId field, route handlers overwrite it with the…
tags: [convention]
created: 2026-08-19
resource: lib/server/api-route.ts and app/api/* routes
---
If a request payload includes a merchantId field, route handlers overwrite it with the session-derived merchant id rather than trusting the client-supplied value

## Why
prevents a caller from spoofing another merchant's id via the request body

## Where
lib/server/api-route.ts and app/api/* routes
