---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-3
type: decision
title: Tests hit real loopback HTTP stub servers for OpenAI, catalog, and checkout instead of…
tags: [decision]
created: 2026-08-20
resource: tests/support/http-stub.ts, tests/support/harness.ts.
---
Tests hit real loopback HTTP stub servers for OpenAI, catalog, and checkout instead of mocking `fetch` or the modules.

## Why
Asserts header forwarding, the GET-only read contract, and the OpenAI SDK's own error classification against what a server actually receives, rather than trusting a mock's shape.

## Where
tests/support/http-stub.ts, tests/support/harness.ts.
