---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-12
type: convention
title: In this chiron multi-repo task setup, local task branches (named like…
tags: [convention]
created: 2026-08-28
---
In this chiron multi-repo task setup, local task branches (named like `LW3iugyWn6L49sBcVqGU/...__task_...`) track a differently-named remote branch (e.g. `origin/jan-hamdan-test`).

## Why
This mismatch between local branch name and remote tracking branch name can look suspicious (as if it belongs to someone else) but is expected in this workflow.

## Learned
When auditing push status across repos, check the actual upstream tracking ref (`@{u}`) rather than assuming the remote branch name matches the local branch name.
