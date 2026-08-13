---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-11
type: gotcha
title: Modules marked `import "server-only"` (e.g. chat-service.ts, commerce-tools.ts) throw at…
tags: [gotcha]
created: 2026-08-13
resource: lib/server/*.ts.
---
Modules marked `import "server-only"` (e.g. chat-service.ts, commerce-tools.ts) throw at import time if pulled into a client bundle — verifying them requires a server-side/Node harness, not a browser-facing test.

## Where
lib/server/*.ts.
