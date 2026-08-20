---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-7
type: convention
title: Frontend API client tests (tests/assistant-api-client.test.ts) patch global fetch…
tags: [convention]
created: 2026-08-20
resource: tests/assistant-api-client.test.ts, contrast with tests/support/http-stub.ts used by other server-side tests.
---
Frontend API client tests (tests/assistant-api-client.test.ts) patch global fetch directly instead of using the stub HTTP servers used elsewhere in the test suite.

## Why
the routes under test are relative paths on this app's own origin, so there's no separate server for a stub to bind to — the relative-path behavior itself is what's being verified.

## Where
tests/assistant-api-client.test.ts, contrast with tests/support/http-stub.ts used by other server-side tests.
