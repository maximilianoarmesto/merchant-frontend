---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-15
type: convention
title: In the `merchant-catalog` repo, feature work (e.g. the stock-filtering changes to…
tags: [convention]
created: 2026-08-28
---
In the `merchant-catalog` repo, feature work (e.g. the stock-filtering changes to `product_service.py`/`products.py`) is done as uncommitted edits directly on `main`, not on a feature branch.

## Why
Observed when auditing the repo — `git status --branch` showed `main...origin/main` with modified files, no feature branch in use.

## Learned
When committing/pushing changes in this repo, default to committing on `main` unless the user asks otherwise.
