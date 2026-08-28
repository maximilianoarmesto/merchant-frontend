---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-9
type: gotcha
title: merchant-catalog's pinned dependency `pydantic==2.9.2` (pulling in pydantic-core) fails…
tags: [gotcha]
created: 2026-08-28
resource: `requirements.txt` in merchant-catalog.
---
merchant-catalog's pinned dependency `pydantic==2.9.2` (pulling in pydantic-core) fails to build wheels under Python 3.14.

## Learned
when building a throwaway venv to test route changes, use Python 3.12, not the system default `python3` (3.14), or the pip install of requirements.txt fails.

## Where
`requirements.txt` in merchant-catalog.
