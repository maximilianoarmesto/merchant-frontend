---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-10
type: gotcha
title: Any new test file that imports @/lib/... modules must run through npm test's `node…
tags: [gotcha]
created: 2026-08-20
resource: tests/support/register.mjs, tests/support/env.ts.
---
Any new test file that imports @/lib/... modules must run through npm test's `node --import tests/support/register.mjs` hook, which performs module-resolution registration and env-var setup (e.g. CATALOG_API_URL/CHECKOUT_API_URL, TEST_API_KEY) in that order before the test file itself loads.

## Why
lib modules read config from env at import time, so importing them outside this hook order yields undefined/incorrect config instead of the test fixtures.

## Where
tests/support/register.mjs, tests/support/env.ts.
