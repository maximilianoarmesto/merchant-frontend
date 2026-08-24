---
id: a8807a6d-0a17-4eba-81ab-cce95c7eeb71-4
type: gotcha
title: The merchant-catalog repo has no tests directory or test framework configured.
tags: [gotcha]
created: 2026-08-24
---
The merchant-catalog repo has no tests directory or test framework configured.

## Why
confirmed by `ls tests` returning nothing.

## Learned
verify SQLAlchemy query changes there by compiling statements to real SQL in a throwaway venv (pip install requirements.txt) and asserting on the WHERE clause text, rather than expecting a pytest suite to exist.
