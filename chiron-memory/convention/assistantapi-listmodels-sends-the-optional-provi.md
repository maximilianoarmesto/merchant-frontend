---
id: 4f5f7f50-2dd6-48d2-b6fc-089e3c5e35bc-8
type: convention
title: assistantApi.listModels sends the optional provider selector as a query-string parameter…
tags: [convention]
created: 2026-08-20
resource: lib/api.ts.
---
assistantApi.listModels sends the optional provider selector as a query-string parameter on the GET /api/provider/models request, unlike validateKey which sends the key in the POST body.

## Why
models listing is a plain GET with no sensitive payload, so the provider hint can safely ride the URL.

## Where
lib/api.ts.
