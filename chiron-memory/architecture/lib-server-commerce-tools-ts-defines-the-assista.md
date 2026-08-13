---
id: 91aeed54-6e36-42cd-9fbd-f3b43bba6cf7-1
type: architecture
title: `lib/server/commerce-tools.ts` defines the assistant's entire tool surface as a closed…
tags: [architecture]
created: 2026-08-13
resource: lib/server/commerce-tools.ts.
---
`lib/server/commerce-tools.ts` defines the assistant's entire tool surface as a closed dispatch map of four tools (list_products, get_product, list_orders, get_order), each backed by a zod schema and wired to `commerce-repository.ts`.

## Why
a closed map with exact-name lookup (vs. a generic "call this URL" tool) makes it structurally impossible to expose or hallucinate a mutating tool.

## Where
lib/server/commerce-tools.ts.
