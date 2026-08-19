---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-11
type: convention
title: When a chat request fails because the merchant's key is…
tags: [convention]
created: 2026-08-19
resource: app/api/chat/route.ts, lib/server/chat-service.ts (ChatError type)
---
When a chat request fails because the merchant's key is missing/rejected/model-unavailable, /api/chat returns the ChatError body verbatim including an `action: "revalidate_key"` field so the frontend knows to prompt the user to re-validate

## Where
app/api/chat/route.ts, lib/server/chat-service.ts (ChatError type)
