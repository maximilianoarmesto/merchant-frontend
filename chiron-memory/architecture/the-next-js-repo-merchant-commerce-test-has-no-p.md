---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-0
type: architecture
title: The Next.js repo `merchant-commerce-test` has no Python/SQLAlchemy/PostgreSQL
tags: [architecture]
created: 2026-08-24
resource: lib/server/commerce-client.ts, lib/server/commerce-repository.ts (frontend); merchant-catalog repo (backend).
---
The Next.js repo `merchant-commerce-test` has no Python/SQLAlchemy/PostgreSQL — it is a read-only HTTP client of the catalog and checkout services; all product/stock persistence and query logic lives in the separate `merchant-catalog` FastAPI+SQLAlchemy service.

## Why
confirmed by exhaustive repo search (no .py files ever tracked in this repo's git history) and by lib/server/commerce-client.ts docstring ("Read-only HTTP access to the catalog and checkout services").

## Learned
tasks that say "work in the current repository" but describe SQLAlchemy/Postgres behavior actually target the external merchant-catalog service — confirm with the user before assuming scope.

## Where
lib/server/commerce-client.ts, lib/server/commerce-repository.ts (frontend); merchant-catalog repo (backend).
