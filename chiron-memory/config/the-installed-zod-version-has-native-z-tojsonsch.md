---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-15
type: config
title: The installed zod version has native `z.toJSONSchema()` support, so no separate…
tags: [config]
created: 2026-08-13
resource: lib/server/commerce-tools.ts, package.json (zod dependency).
---
The installed zod version has native `z.toJSONSchema()` support, so no separate json-schema conversion library is needed to generate tool schemas for OpenAI.

## Where
lib/server/commerce-tools.ts, package.json (zod dependency).
