---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-9
type: convention
title: assistantApi.sendChatMessage takes an optional second argument { signal } so callers can…
tags: [convention]
created: 2026-08-20
resource: lib/api.ts.
---
assistantApi.sendChatMessage takes an optional second argument { signal } so callers can pass an AbortSignal to cancel an in-flight chat request.

## Why
lets chat UI cancel a pending completion (e.g. user navigates away or sends a new message) without leaving a dangling fetch.

## Where
lib/api.ts.
