---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-7
type: architecture
title: /api/chat forwards the request's own auth context (caller's Cookie/Authorization) into…
tags: [architecture]
created: 2026-08-19
resource: app/api/chat/route.ts, lib/server/commerce-client.ts
---
/api/chat forwards the request's own auth context (caller's Cookie/Authorization) into runChatCompletion so the assistant's own commerce-service reads (orders, catalog) during the tool-calling loop use the end-user's identity, not a service credential

## Why
keeps per-merchant/per-user authorization scoping intact all the way through tool calls

## Where
app/api/chat/route.ts, lib/server/commerce-client.ts
