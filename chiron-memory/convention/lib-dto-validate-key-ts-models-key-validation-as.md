---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-4
type: convention
title: `lib/dto/validate-key.ts` models key validation as a discriminated union `status
tags: [convention]
created: 2026-08-13
resource: lib/dto/validate-key.ts
---
`lib/dto/validate-key.ts` models key validation as a discriminated union `status: "validating" | "valid" | "invalid"` (via a `validatingKeyState()` helper) instead of a plain `valid: boolean`, so the client-safe DTO can drive an in-flight UI state.

## Where
lib/dto/validate-key.ts
