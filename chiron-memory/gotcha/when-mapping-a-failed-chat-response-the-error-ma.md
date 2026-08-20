---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-5
type: gotcha
title: When mapping a failed chat response, the error mapper must try chatErrorSchema before the…
tags: [gotcha]
created: 2026-08-20
resource: lib/api.ts.
---
When mapping a failed chat response, the error mapper must try chatErrorSchema before the plain shared ApiError schema, not the reverse.

## Why
chatErrorSchema is a superset of the plain ApiError shape — parsing a chat error against the plain shape first would silently drop the requiresKeyRevalidation/re-validate signal.

## Where
lib/api.ts.
