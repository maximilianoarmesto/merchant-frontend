---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-1
type: gotcha
title: `--conditions=react-server` silences the `server-only` import guard but also swaps in a…
tags: [gotcha]
created: 2026-08-20
resource: tests/support/register.mjs.
---
`--conditions=react-server` silences the `server-only` import guard but also swaps in a React subset build that refuses to load outside Next.js, so it conflicts with modules importing `next/headers`.

## Why
`next/headers` and a `server-only` marker can't both be satisfied via the react-server condition in a Node test runner context.

## Learned
Redirect the `server-only` package to its own empty.js stub instead of using the react-server condition.

## Where
tests/support/register.mjs.
