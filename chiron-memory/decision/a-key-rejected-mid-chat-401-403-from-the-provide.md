---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-7
type: decision
title: A key rejected mid-chat (401/403 from the provider) produces a chat error shaped `{code
tags: [decision]
created: 2026-08-20
resource: lib/server/chat-service.ts, app/api/chat/route.ts, lib/dto/chat.ts.
---
A key rejected mid-chat (401/403 from the provider) produces a chat error shaped `{code: "key_rejected", action: "revalidate_key"}`, validated against `chatErrorSchema`, and `POST /api/chat` returns HTTP 409 with that body verbatim; the stored key itself is left untouched.

## Why
Lets the client distinguish a stale/revoked key from other chat failures and prompt re-validation without silently deleting the merchant's stored credential.

## Where
lib/server/chat-service.ts, app/api/chat/route.ts, lib/dto/chat.ts.
