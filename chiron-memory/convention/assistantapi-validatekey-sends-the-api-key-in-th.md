---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-1
type: convention
title: assistantApi.validateKey sends the API key in the POST request body, never as a query…
tags: [convention]
created: 2026-08-20
resource: lib/api.ts.
---
assistantApi.validateKey sends the API key in the POST request body, never as a query string.

## Why
avoids leaking the key via URL/logs.

## Where
lib/api.ts.
