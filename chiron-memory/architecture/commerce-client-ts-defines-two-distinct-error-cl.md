---
id: 84894289-bf70-419a-888e-f9b64449c98f-11
type: architecture
title: commerce-client.ts defines two distinct error classes
tags: [architecture]
created: 2026-08-13
resource: lib/server/commerce-client.ts
---
commerce-client.ts defines two distinct error classes — CommerceApiError for network/timeout failures and CommerceResponseError for non-2xx HTTP responses

## Why
Lets callers distinguish transport failures from upstream-rejected requests

## Where
lib/server/commerce-client.ts
