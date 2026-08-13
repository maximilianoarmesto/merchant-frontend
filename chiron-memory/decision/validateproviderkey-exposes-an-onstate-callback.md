---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-8
type: decision
title: `validateProviderKey` exposes an `onState` callback that fires with `{ status
tags: [decision]
created: 2026-08-13
resource: lib/server/provider-key-service.ts
---
`validateProviderKey` exposes an `onState` callback that fires with `{ status: "validating" }` before the OpenAI call and with the settled `valid`/`invalid` state after, so callers can surface all three DTO statuses without hardcoding status literals themselves.

## Where
lib/server/provider-key-service.ts
