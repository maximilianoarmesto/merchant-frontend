---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-2
type: decision
title: A rejected/invalid API key from validateKey resolves as a typed { status
tags: [decision]
created: 2026-08-20
resource: lib/api.ts (SettledKeyValidationState).
---
A rejected/invalid API key from validateKey resolves as a typed { status: "invalid", reason } value rather than throwing.

## Why
an invalid key is a normal answer to "is this key good?" and matches the server route's 200 response for that case; throwing is reserved for actual transport/schema failures.

## Where
lib/api.ts (SettledKeyValidationState).
