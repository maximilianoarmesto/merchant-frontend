---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-6
type: gotcha
title: better-sqlite3's native module needs to be added to next.config.js…
tags: [gotcha]
created: 2026-08-07
resource: next.config.js, Dockerfile (data volume + DB path).
---
better-sqlite3's native module needs to be added to next.config.js externals/serverExternalPackages for the standalone Next.js build to load it correctly at runtime.

## Where
next.config.js, Dockerfile (data volume + DB path).
