---
id: 84894289-bf70-419a-888e-f9b64449c98f-8
type: decision
title: getProduct(id) and getOrder(id) return null (not throw) when the upstream service…
tags: [decision]
created: 2026-08-13
resource: lib/server/commerce-repository.ts
---
getProduct(id) and getOrder(id) return null (not throw) when the upstream service responds 404

## Why
Lets callers treat "not found" as a normal case rather than an exception path

## Where
lib/server/commerce-repository.ts
