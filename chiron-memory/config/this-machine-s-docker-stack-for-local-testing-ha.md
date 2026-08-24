---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-6
type: config
title: This machine's Docker stack for local testing has merchant-catalog on port 8001,…
tags: [config]
created: 2026-08-24
---
This machine's Docker stack for local testing has merchant-catalog on port 8001, merchant-checkout-payment on port 8002, merchant-postgres on port 5442, and a separate merchant-frontend container on port 3010 already running the same Next.js app — all long-lived and already up (12+ days) independent of anything Claude starts.

## Why
discovered via `docker ps`/lsof while starting a fresh `next dev` server on port 3005 to test a change; real catalog data (21 products) appeared because these containers were already serving it. · How to apply: before assuming backend services need to be started for local frontend testing, check these ports first — and don't confuse the always-on 3010 container with a freshly-started dev server on another port, they're separate processes serving the same app.
