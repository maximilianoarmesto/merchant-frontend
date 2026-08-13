---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-9
type: convention
title: The tool-calling loop is bounded by `maxToolRounds` (default 4)
tags: [convention]
created: 2026-08-13
resource: lib/server/chat-service.ts.
---
The tool-calling loop is bounded by `maxToolRounds` (default 4); on the final round tools are withdrawn via `tool_choice: "none"` so the model is forced to produce a final answer instead of looping forever.

## Why
guarantees termination even if the model keeps requesting tool calls.

## Where
lib/server/chat-service.ts.
