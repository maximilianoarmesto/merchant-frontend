---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-11
type: convention
title: DTO validation is centralized in a validate()/validateRequestBody() helper…
tags: [convention]
created: 2026-08-07
resource: lib/dto/validation.ts
---
DTO validation is centralized in a validate()/validateRequestBody() helper (lib/dto/validation.ts) that flattens zod's ZodError into a flat array of {path, message} pairs.

## Why
Gives every DTO (validate-key, list-models, chat, provider-config) a consistent, API-friendly error shape instead of raw zod errors.

## Where
lib/dto/validation.ts
