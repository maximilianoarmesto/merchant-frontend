---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-7
type: decision
title: The chat service never rewrites or auto-revalidates the merchant's stored API key on…
tags: [decision]
created: 2026-08-13
resource: lib/server/chat-service.ts, lib/server/provider-key-service.ts.
---
The chat service never rewrites or auto-revalidates the merchant's stored API key on failure; revalidation stays an explicit user-triggered action in `provider-key-service.ts`.

## Why
keeps key lifecycle management (validate/store) separate from chat orchestration — chat only reports that revalidation is needed.

## Where
lib/server/chat-service.ts, lib/server/provider-key-service.ts.
