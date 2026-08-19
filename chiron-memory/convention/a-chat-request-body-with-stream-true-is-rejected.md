---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-6
type: convention
title: A chat request body with stream:true is rejected with 400
tags: [convention]
created: 2026-08-19
resource: app/api/chat/route.ts
---
A chat request body with stream:true is rejected with 400

## Why
the underlying chat service (runChatCompletion) is non-streaming only, so streaming requests can't be honored

## Where
app/api/chat/route.ts
