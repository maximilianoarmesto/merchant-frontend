---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-12
type: convention
title: The list-models flow filters OpenAI's full model list down to chat-capable models only…
tags: [convention]
created: 2026-08-07
resource: lib/server/openai.ts
---
The list-models flow filters OpenAI's full model list down to chat-capable models only before returning them to the client.

## Why
Avoids surfacing embedding/image/whisper models as selectable chat models in the merchant UI.

## Where
lib/server/openai.ts
