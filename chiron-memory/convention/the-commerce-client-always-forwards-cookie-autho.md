---
id: 4eb04a7e-9d21-4366-9d77-dfc1eeb883c3-5
type: convention
title: The commerce client always forwards `cookie`, `authorization`, and `x-request-id` headers…
tags: [convention]
created: 2026-08-20
resource: lib/server/commerce-client.ts.
---
The commerce client always forwards `cookie`, `authorization`, and `x-request-id` headers verbatim on outbound reads, and sets `x-merchant-id` from the server-side session rather than from any client-supplied value.

## Why
Merchant scoping must be enforced server-side; a client-supplied `merchantId` (header or body) must not be authoritative, to prevent cross-merchant data access.

## Where
lib/server/commerce-client.ts.
