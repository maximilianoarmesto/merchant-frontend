---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-6
type: convention
title: assistantApi responses are parsed/validated against the same DTO zod schemas the server…
tags: [convention]
created: 2026-08-20
resource: lib/api.ts, lib/dto/*.
---
assistantApi responses are parsed/validated against the same DTO zod schemas the server routes serialize from (validateKeyResponseSchema, listModelsResponseSchema, chatResponseSchema); a mismatched body raises instead of being cast through unchecked.

## Why
keeps client-side types honest against the actual route contract instead of trusting an `as` cast.

## Where
lib/api.ts, lib/dto/*.
