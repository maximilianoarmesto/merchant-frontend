---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-0
type: config
title: This project uses Node's built-in test runner (`node --test`) via a custom loader preload…
tags: [config]
created: 2026-08-20
resource: tests/support/register.mjs, package.json `test`/`test:watch` scripts.
---
This project uses Node's built-in test runner (`node --test`) via a custom loader preload rather than adding Jest/Vitest.

## Why
Avoids a new dependency; the app's TS sources can be made runnable outside the Next.js bundler with a small preload script.

## Where
tests/support/register.mjs, package.json `test`/`test:watch` scripts.
