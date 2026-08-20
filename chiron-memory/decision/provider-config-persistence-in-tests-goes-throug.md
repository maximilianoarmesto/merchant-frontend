---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-4
type: decision
title: Provider-config persistence in tests goes through the real repository into a throwaway…
tags: [decision]
created: 2026-08-20
resource: tests/support/harness.ts, lib/server/provider-config-repository.ts.
---
Provider-config persistence in tests goes through the real repository into a throwaway SQLite file rather than mocking the repository layer.

## Why
Exercises the actual encryption/storage path (crypto.ts, db.ts) so persistence behavior is verified for real, not assumed.

## Where
tests/support/harness.ts, lib/server/provider-config-repository.ts.
