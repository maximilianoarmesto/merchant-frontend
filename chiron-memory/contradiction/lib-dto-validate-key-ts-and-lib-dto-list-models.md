---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-9
type: contradiction
title: lib/dto/validate-key.ts and lib/dto/list-models.ts previously had stale comments…
tags: [contradiction]
created: 2026-08-19
resource: lib/dto/validate-key.ts, lib/dto/list-models.ts
---
lib/dto/validate-key.ts and lib/dto/list-models.ts previously had stale comments describing validate-key as "probe only" (no storage) and list-models as a POST endpoint; both were corrected to match the implemented routes (validate-key stores the key on success, models is a GET)

## Where
lib/dto/validate-key.ts, lib/dto/list-models.ts
