---
id: 84894289-bf70-419a-888e-f9b64449c98f-4
type: gotcha
title: next/headers' headers() throws when called outside an active request scope (e.g.…
tags: [gotcha]
created: 2026-08-13
resource: lib/server/commerce-client.ts
---
next/headers' headers() throws when called outside an active request scope (e.g. background jobs, scripts)

## Why
getCommerceAuthContext() in commerce-client.ts must catch this and degrade gracefully to the configured default merchant id instead of throwing

## Where
lib/server/commerce-client.ts
