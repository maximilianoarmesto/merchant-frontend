---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-2
type: gotcha
title: Test environment/config setup (pointing app config at stub servers) cannot live in a test…
tags: [gotcha]
created: 2026-08-20
resource: tests/support/env.ts, tests/support/register.mjs.
---
Test environment/config setup (pointing app config at stub servers) cannot live in a test file's own import graph, even behind top-level await.

## Why
A synchronous sibling import in the same module evaluates without waiting for an async sibling's top-level await to resolve, so `lib/config/server.ts` would freeze production defaults before the test env was applied.

## Learned
Env setup must happen inside the `--import` preload module, which Node fully awaits before running the test entry point.

## Where
tests/support/env.ts, tests/support/register.mjs.
