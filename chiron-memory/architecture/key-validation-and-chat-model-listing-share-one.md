---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-0
type: architecture
title: Key validation and chat-model listing share one OpenAI `models.list` round trip via…
tags: [architecture]
created: 2026-08-13
resource: lib/server/openai.ts
---
Key validation and chat-model listing share one OpenAI `models.list` round trip via extracted `fetchModelSummaries`/`filterChatModels` helpers in `lib/server/openai.ts`, and `validateApiKey` returns the chat-model list alongside the valid/invalid status.

## Why
Avoids a second API call when a caller needs both the validation result and the model list in the same flow.

## Where
lib/server/openai.ts
