---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-0
type: gotcha
title: Two separate local checkouts of merchant-catalog exist on disk.
tags: [gotcha]
created: 2026-08-28
resource: `~/Merchant - New Features/merchant-catalog` (the active working copy with in-progress edits) vs `~/Merchant Workspace/merchant-catalog` (clean/untouched).
---
Two separate local checkouts of merchant-catalog exist on disk.

## Learned
always verify which checkout has the prior session's edits before making further changes — editing the wrong one silently loses continuity.

## Where
`~/Merchant - New Features/merchant-catalog` (the active working copy with in-progress edits) vs `~/Merchant Workspace/merchant-catalog` (clean/untouched).
