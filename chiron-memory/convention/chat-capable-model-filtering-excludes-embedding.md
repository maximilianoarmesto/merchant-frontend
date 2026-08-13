---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-1
type: convention
title: Chat-capable model filtering excludes embedding, audio, image, moderation, instruct, and…
tags: [convention]
created: 2026-08-13
resource: lib/server/openai.ts (filterChatModels), used by lib/server/provider-key-service.ts
---
Chat-capable model filtering excludes embedding, audio, image, moderation, instruct, and realtime model families — only standard chat models are surfaced.

## Where
lib/server/openai.ts (filterChatModels), used by lib/server/provider-key-service.ts
