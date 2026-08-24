---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-7
type: config
title: The merchant-commerce-test frontend needs `npm install` (node_modules isn't committed)…
tags: [config]
created: 2026-08-24
---
The merchant-commerce-test frontend needs `npm install` (node_modules isn't committed) but requires no `.env` file to run — every value read in lib/config/server.ts and lib/config/public.ts has a dev-safe default.

## Why
verified by reading both config files before starting the dev server; it started cleanly on first try with zero env setup. · How to apply: when asked to run this frontend locally, `npm install` then `next dev -p <port>` is sufficient — don't spend time hunting for required env vars first.
