---
id: e61c95ec-fdc8-4f42-9f96-0b0edc4c96a8-6
type: decision
title: This task deliberately stops at the service layer (lib/server/provider-key-service.ts)…
tags: [decision]
created: 2026-08-13
resource: lib/dto/validate-key.ts, lib/dto/provider-config.ts
---
This task deliberately stops at the service layer (lib/server/provider-key-service.ts) and does not wire route handlers (POST /api/provider/validate-key, PUT /api/provider/config) or the settings UI — consistent with the prior task's scope decision to stop at models/DTOs/persistence.

## Why
Matches an established incremental scoping pattern in this project; DTOs name their intended endpoints in comments as a marker for the follow-up.

## Where
lib/dto/validate-key.ts, lib/dto/provider-config.ts
