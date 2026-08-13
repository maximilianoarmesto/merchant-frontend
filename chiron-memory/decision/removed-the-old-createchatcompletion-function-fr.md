---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-10
type: decision
title: Removed the old `createChatCompletion` function from `lib/server/openai.ts` and replaced…
tags: [decision]
created: 2026-08-13
resource: lib/server/openai.ts.
---
Removed the old `createChatCompletion` function from `lib/server/openai.ts` and replaced it with the new tool-aware `chat-service.ts`.

## Why
the old function exposed no tools and produced no structured key error, and nothing in the codebase called it. Added `openAIErrorStatus` to openai.ts instead, so the service layer can distinguish a rejected key from a transport failure.

## Where
lib/server/openai.ts.
