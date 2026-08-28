---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-11
type: gotcha
title: Local remote-tracking refs (e.g. `origin/jan-hamdan-test`) can be stale and show a false…
tags: [gotcha]
created: 2026-08-28
---
Local remote-tracking refs (e.g. `origin/jan-hamdan-test`) can be stale and show a false 'ahead N' count for a task branch.

## Why
The branch appeared '2 commits ahead' before fetching, but after `git fetch origin` the remote had already moved and the branch was actually 0 ahead/0 behind — the commits were on the remote all along.

## Learned
Always run `git fetch` before concluding local commits are unpushed based on ahead/behind counts from `git status`/`git branch -vv`.
