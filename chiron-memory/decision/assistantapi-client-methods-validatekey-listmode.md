---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-0
type: decision
title: assistantApi client methods (validateKey, listModels, sendChatMessage) call relative…
tags: [decision]
created: 2026-08-20
resource: lib/api.ts (ASSISTANT_ROUTES).
---
assistantApi client methods (validateKey, listModels, sendChatMessage) call relative Next.js route paths (/api/provider/validate-key, /api/provider/models, /api/chat) with no provider base URL configured.

## Why
the browser must only ever call this app's own origin so session headers travel with the request and the provider API key never leaves the server.

## Where
lib/api.ts (ASSISTANT_ROUTES).
