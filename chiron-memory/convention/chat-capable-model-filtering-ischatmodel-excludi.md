---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-14
type: convention
title: Chat-capable model filtering (`isChatModel` excluding embeddings/audio models) is…
tags: [convention]
created: 2026-08-20
resource: lib/server/openai.ts, lib/dto/list-models.ts, app/api/provider/models/route.ts.
---
Chat-capable model filtering (`isChatModel` excluding embeddings/audio models) is re-applied redundantly at multiple layers — `filterChatModels`, `listModels`, key-validation state, the chat service, and the `GET /api/provider/models` route — rather than filtered once at a single boundary.

## Where
lib/server/openai.ts, lib/dto/list-models.ts, app/api/provider/models/route.ts.
