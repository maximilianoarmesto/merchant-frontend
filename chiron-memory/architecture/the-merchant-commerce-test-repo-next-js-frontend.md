---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-1
type: architecture
title: The `merchant-commerce-test` repo (Next.js frontend) contains no Python and is not where…
tags: [architecture]
created: 2026-08-28
resource: catalog service work happens in the separate `merchant-catalog` checkout(s) outside this repo.
---
The `merchant-commerce-test` repo (Next.js frontend) contains no Python and is not where the merchant-catalog FastAPI service lives.

## Learned
Python/FastAPI tasks referencing product endpoints must be located and edited in the merchant-catalog checkout, not this frontend repo.

## Where
catalog service work happens in the separate `merchant-catalog` checkout(s) outside this repo.
