---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-5
type: gotcha
title: Multiple merchant-catalog checkouts exist on disk ("/Users/maxiarmesto/Merchant…
tags: [gotcha]
created: 2026-08-28
---
Multiple merchant-catalog checkouts exist on disk ("/Users/maxiarmesto/Merchant Workspace/merchant-catalog" and "/Users/maxiarmesto/Merchant - New Features/merchant-catalog") — only the 'Merchant - New Features' one is live/active

## Why
the Workspace copy is stale, stuck at its initial commit with no uncommitted edits, while the New Features copy has the actual pending product_service.py changes and backs the running merchant-catalog Docker container

## Learned
when multiple candidate merchant-catalog directories exist, verify via `git status`/`git log` which one has recent uncommitted work before editing — don't assume the first one found is correct.
