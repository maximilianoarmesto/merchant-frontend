---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-4
type: architecture
title: Client-side errors surface as thrown AssistantApiError (status, fieldErrors, cause
tags: [architecture]
created: 2026-08-20
resource: lib/api.ts.
---
Client-side errors surface as thrown AssistantApiError (status, fieldErrors, cause; status 0 signals an unreachable server) and ChatApiError (code, action, provider, precomputed requiresKeyRevalidation), with isAssistantApiError/isKeyRevalidationError guards exported for the UI to react to.

## Why
acceptance criteria required the re-validate-key signal be visible to callers and errors not be swallowed.

## Where
lib/api.ts.
