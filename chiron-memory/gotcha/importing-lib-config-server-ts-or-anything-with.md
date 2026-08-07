---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-5
type: gotcha
title: Importing lib/config/server.ts (or anything with `server-only`) from a "use client"…
tags: [gotcha]
created: 2026-08-07
---
Importing lib/config/server.ts (or anything with `server-only`) from a "use client" component makes `next build` fail hard rather than silently bundling the secret.

## Why
Verified empirically with a throwaway client component during this task — the guard is load-bearing, not decorative.

## Learned
Trust this as a real safety net for reviewing future PRs that touch server config.
