---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-0
type: gotcha
title: The task's 'current repository' (merchant-commerce-test / a Next.js frontend) contains no…
tags: [gotcha]
created: 2026-08-28
---
The task's 'current repository' (merchant-commerce-test / a Next.js frontend) contains no Python — the actual FastAPI merchant-catalog service lives at "/Users/maxiarmesto/Merchant - New Features/merchant-catalog"

## Why
prior commits on this branch follow the same pattern — Python service edits are made in that external directory, while only memory/test artifacts get committed in the chiron working repo

## Learned
before doing Python/service-layer work here, locate and edit the real merchant-catalog checkout under 'Merchant - New Features', not any Python-looking path inside the current repo.
