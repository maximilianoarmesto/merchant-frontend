---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-0
type: architecture
title: `lib/server/chat-service.ts` exposes `runChatCompletion(request, options)` which…
tags: [architecture]
created: 2026-08-13
resource: lib/server/chat-service.ts.
---
`lib/server/chat-service.ts` exposes `runChatCompletion(request, options)` which orchestrates the whole chat flow: loads the merchant's stored key/model, runs a bounded tool-calling loop against OpenAI, and returns structured results.

## Why
centralizes chat orchestration server-side so the key and tool execution never reach the client.

## Where
lib/server/chat-service.ts.
