---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-14
type: convention
title: `ChatResponse` includes a `toolCalls` field listing the tool invocations made during the…
tags: [convention]
created: 2026-08-13
resource: lib/dto/chat.ts.
---
`ChatResponse` includes a `toolCalls` field listing the tool invocations made during the chat turn.

## Why
lets the chat UI show its work (which commerce tools were called) rather than only the final assistant message.

## Where
lib/dto/chat.ts.
