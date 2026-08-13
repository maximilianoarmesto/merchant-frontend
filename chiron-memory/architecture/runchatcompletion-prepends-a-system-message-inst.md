---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-13
type: architecture
title: `runChatCompletion` prepends a system message instructing the model that all commerce…
tags: [architecture]
created: 2026-08-13
resource: lib/server/chat-service.ts.
---
`runChatCompletion` prepends a system message instructing the model that all commerce tools are read-only, on top of the structural tool-surface restrictions.

## Why
defense-in-depth — guides model behavior even though the closed dispatch map already makes mutation structurally impossible.

## Where
lib/server/chat-service.ts.
