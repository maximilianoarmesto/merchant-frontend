---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-8
type: convention
title: The chat service is non-streaming only
tags: [convention]
created: 2026-08-20
resource: app/api/chat/route.ts, lib/dto/chat.ts.
---
The chat service is non-streaming only; a request with `stream: true` is rejected with HTTP 400.

## Where
app/api/chat/route.ts, lib/dto/chat.ts.
