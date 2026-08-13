---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-4
type: convention
title: `executeCommerceTool` never throws
tags: [convention]
created: 2026-08-13
resource: lib/server/commerce-tools.ts.
---
`executeCommerceTool` never throws — unknown tool names, invalid arguments, and upstream commerce-repository failures all resolve to a `{ error }` payload that gets relayed back to the model as the tool result.

## Why
keeps the tool loop resilient to a hallucinated or malformed tool call instead of crashing the chat.

## Where
lib/server/commerce-tools.ts.
