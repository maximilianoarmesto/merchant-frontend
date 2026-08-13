---
id: 84894289-bf70-419a-888e-f9b64449c98f-6
type: config
title: A new COMMERCE_API_TIMEOUT_MS env var controls serverConfig.commerceTimeoutMs, the…
tags: [config]
created: 2026-08-13
resource: lib/config/server.ts, .env.example, README.md
---
A new COMMERCE_API_TIMEOUT_MS env var controls serverConfig.commerceTimeoutMs, the timeout used for upstream catalog/checkout requests

## Why
Base URLs (NEXT_PUBLIC_CATALOG_API_URL, NEXT_PUBLIC_CHECKOUT_API_URL) already existed in serverConfig; only the timeout knob was new

## Where
lib/config/server.ts, .env.example, README.md
