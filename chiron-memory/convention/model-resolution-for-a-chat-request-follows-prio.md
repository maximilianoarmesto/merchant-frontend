---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-8
type: convention
title: Model resolution for a chat request follows priority
tags: [convention]
created: 2026-08-13
resource: lib/server/chat-service.ts (resolveModel).
---
Model resolution for a chat request follows priority: request-specified model → merchant's stored model selection → configured default.

## Where
lib/server/chat-service.ts (resolveModel).
