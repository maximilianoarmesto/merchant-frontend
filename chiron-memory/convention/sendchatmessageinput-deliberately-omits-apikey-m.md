---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-3
type: convention
title: SendChatMessageInput deliberately omits apiKey, merchantId, and stream fields.
tags: [convention]
created: 2026-08-20
resource: lib/api.ts.
---
SendChatMessageInput deliberately omits apiKey, merchantId, and stream fields.

## Why
those are server-side/session concerns resolved by the route handler, not something the client should pass through.

## Where
lib/api.ts.
