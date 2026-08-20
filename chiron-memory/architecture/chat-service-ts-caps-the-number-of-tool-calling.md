---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-12
type: architecture
title: `chat-service.ts` caps the number of tool-calling rounds per chat turn via…
tags: [architecture]
created: 2026-08-20
resource: lib/server/chat-service.ts.
---
`chat-service.ts` caps the number of tool-calling rounds per chat turn via `DEFAULT_MAX_TOOL_ROUNDS`; once the cap is reached, tool definitions are withdrawn from subsequent calls to the model for that turn.

## Why
Bounds how long a single chat turn can loop on tool calls.

## Where
lib/server/chat-service.ts.
