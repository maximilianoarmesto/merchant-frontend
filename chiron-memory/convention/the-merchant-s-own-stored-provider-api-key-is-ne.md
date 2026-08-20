---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-13
type: convention
title: The merchant's own stored provider API key is never exposed to the model
tags: [convention]
created: 2026-08-20
resource: lib/server/commerce-tools.ts, lib/server/chat-service.ts.
---
The merchant's own stored provider API key is never exposed to the model — no commerce tool or chat response surfaces it.

## Why
Prevents the assistant from leaking or acting on the merchant's own credential during a chat turn.

## Where
lib/server/commerce-tools.ts, lib/server/chat-service.ts.
