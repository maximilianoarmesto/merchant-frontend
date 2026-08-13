---
id: 84894289-bf70-419a-888e-f9b64449c98f-5
type: decision
title: The shared getJson helper in commerce-client.ts hardcodes method
tags: [decision]
created: 2026-08-13
resource: lib/server/commerce-client.ts
---
The shared getJson helper in commerce-client.ts hardcodes method: "GET" and its signature accepts neither a method nor a body parameter

## Why
Enforces the read-only/no-mutation requirement at the type level so nothing built on top of the commerce client can accidentally perform a write

## Where
lib/server/commerce-client.ts
