---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-2
type: convention
title: Each commerce tool's zod schema is the single source for both the JSON Schema sent to…
tags: [convention]
created: 2026-08-13
resource: lib/server/commerce-tools.ts.
---
Each commerce tool's zod schema is the single source for both the JSON Schema sent to OpenAI (via `z.toJSONSchema`) and runtime validation of the model's tool-call arguments.

## Why
avoids maintaining a separate hand-written JSON schema in sync with a hand-written validator.

## Where
lib/server/commerce-tools.ts.
