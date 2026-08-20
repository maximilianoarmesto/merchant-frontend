---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-10
type: convention
title: `GET /api/provider/models` returns HTTP 409 rather than 200 with an empty list when the…
tags: [convention]
created: 2026-08-20
resource: app/api/provider/models/route.ts, README.md.
---
`GET /api/provider/models` returns HTTP 409 rather than 200 with an empty list when the merchant has no provider key stored.

## Why
Lets the settings screen distinguish "no key configured" from "provider returned zero models" instead of treating both as an empty list.

## Where
app/api/provider/models/route.ts, README.md.
