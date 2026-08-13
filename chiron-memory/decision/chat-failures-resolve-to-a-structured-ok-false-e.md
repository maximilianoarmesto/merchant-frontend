---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-5
type: decision
title: Chat failures resolve to a structured `{ ok
tags: [decision]
created: 2026-08-13
resource: lib/dto/chat.ts, lib/server/chat-service.ts.
---
Chat failures resolve to a structured `{ ok: false, error: { error, code, action, provider } }` object rather than throwing.

## Why
lets the chat UI distinguish a rejected/revoked key from a rate limit or outage and react accordingly (e.g. prompt re-validation) instead of showing a generic failure.

## Where
lib/dto/chat.ts, lib/server/chat-service.ts.
