---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-13
type: convention
title: PublicProviderConfig's masked API key hint is formatted as bullet characters followed by…
tags: [convention]
created: 2026-08-07
resource: lib/models/provider-config.ts
---
PublicProviderConfig's masked API key hint is formatted as bullet characters followed by the last 4 characters of the real key (e.g. "••••abcd").

## Why
Lets the UI show merchants enough to recognize which key is stored without ever exposing the full value.

## Where
lib/models/provider-config.ts
