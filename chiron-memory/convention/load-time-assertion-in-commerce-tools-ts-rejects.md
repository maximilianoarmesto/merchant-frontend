---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-3
type: convention
title: Load-time assertion in commerce-tools.ts rejects any tool name that isn't prefixed…
tags: [convention]
created: 2026-08-13
resource: lib/server/commerce-tools.ts.
---
Load-time assertion in commerce-tools.ts rejects any tool name that isn't prefixed `list_*` or `get_*`.

## Why
extra structural guarantee against ever wiring a mutating tool by accident, beyond the closed dispatch map itself.

## Where
lib/server/commerce-tools.ts.
