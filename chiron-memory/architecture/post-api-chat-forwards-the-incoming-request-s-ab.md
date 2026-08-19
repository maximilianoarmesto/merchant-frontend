---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-13
type: architecture
title: POST /api/chat forwards the incoming request's AbortSignal into runChatCompletion so a…
tags: [architecture]
created: 2026-08-19
resource: app/api/chat/route.ts
---
POST /api/chat forwards the incoming request's AbortSignal into runChatCompletion so a client disconnect cancels the in-flight provider call

## Where
app/api/chat/route.ts
