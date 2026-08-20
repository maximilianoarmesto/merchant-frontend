---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-11
type: architecture
title: `lib/server/commerce-tools.ts` only defines read-capable tool schemas for the model to…
tags: [architecture]
created: 2026-08-20
resource: lib/server/commerce-tools.ts.
---
`lib/server/commerce-tools.ts` only defines read-capable tool schemas for the model to call; there is no tool definition through which the model could invoke a mutating catalog/checkout operation, and named mutating operations are rejected before any commerce HTTP call is issued.

## Why
Read-only enforcement is structural (the tool catalog itself has no write capability), not just a runtime check on the commerce client.

## Where
lib/server/commerce-tools.ts.
