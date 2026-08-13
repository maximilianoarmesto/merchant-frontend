---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-6
type: convention
title: Chat error codes map as
tags: [convention]
created: 2026-08-13
resource: lib/dto/chat.ts.
---
Chat error codes map as: 401/403 mid-chat → `key_rejected`/`revalidate_key`; no stored key → `key_missing`/`configure_key`; 404 → `model_unavailable`; 429 → `provider_rate_limited`; 5xx/network → `provider_unavailable`. A `requiresKeyRevalidation()` helper exposes the revalidate case to the UI.

## Where
lib/dto/chat.ts.
