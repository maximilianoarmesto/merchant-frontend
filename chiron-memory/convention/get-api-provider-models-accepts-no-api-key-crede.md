---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-12
type: convention
title: GET /api/provider/models accepts no API-key credential of any kind (only an optional…
tags: [convention]
created: 2026-08-19
resource: app/api/provider/models/route.ts
---
GET /api/provider/models accepts no API-key credential of any kind (only an optional `provider` query param, schema-validated)

## Why
a key placed in a query string would end up recorded in access/server logs

## Where
app/api/provider/models/route.ts
