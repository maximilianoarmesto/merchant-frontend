---
id: 84894289-bf70-419a-888e-f9b64449c98f-0
type: decision
title: The read-only commerce data-access layer is split into four files
tags: [decision]
created: 2026-08-13
resource: lib/models/commerce.ts, lib/dto/commerce.ts, lib/server/commerce-client.ts, lib/server/commerce-repository.ts
---
The read-only commerce data-access layer is split into four files — lib/models/commerce.ts (domain types), lib/dto/commerce.ts (zod schemas + mappers), lib/server/commerce-client.ts (GET-only HTTP layer with auth forwarding), lib/server/commerce-repository.ts (typed listProducts/getProduct/listOrders/getOrder functions)

## Why
Mirrors the existing provider-config pattern (repository + dto + server client) already used elsewhere in the codebase, keeping server-only commerce access architecturally consistent

## Where
lib/models/commerce.ts, lib/dto/commerce.ts, lib/server/commerce-client.ts, lib/server/commerce-repository.ts
