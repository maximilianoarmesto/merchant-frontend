---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-10
type: architecture
title: The repo `merchant-commerce-test` (chiron task workspace) contains no Python source code
tags: [architecture]
created: 2026-08-28
resource: `~/chiron/maxi-fullstack-LW3iugyW/merchant-commerce-test`
---
The repo `merchant-commerce-test` (chiron task workspace) contains no Python source code — it's a memory/artifacts-only repo.

## Why
Commits there (e.g. `bdf3f8e`, `6fe6f59`) turned out to be Playwright logs, a screenshot, and a `chiron-memory/gotcha/...` note, not implementation code.

## Learned
When checking whether a feature's code was pushed, don't trust commits in this repo as evidence of implementation — the real backend code lives in the separate `merchant-catalog` repo (`app/services/product_service.py`, `app/api/products.py`) under `~/Merchant - New Features/merchant-catalog`.

## Where
`~/chiron/maxi-fullstack-LW3iugyW/merchant-commerce-test`
