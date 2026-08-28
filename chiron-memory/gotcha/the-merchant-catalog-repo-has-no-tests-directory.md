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
verify SQLAlchemy query changes there by compiling statements to real SQL and asserting on
the WHERE clause text, rather than expecting a pytest suite to exist.

Run the check inside the already-running `merchant-catalog` container, which has the exact
pinned deps — a local throwaway venv does NOT work, because `pydantic==2.9.2` fails to build
`pydantic-core` from source on this machine:

    docker cp app/services/product_service.py merchant-catalog:/app/app/services/product_service.py
    docker cp verify.py merchant-catalog:/tmp/verify.py
    docker exec -w /app -e PYTHONPATH=/app merchant-catalog python /tmp/verify.py

`PYTHONPATH=/app` is required: Python puts the *script's* directory (/tmp) on sys.path, not
the working directory, so `import app...` fails without it. Pass a `MagicMock()` as the
`Session`, then read the statement back off `db.execute.call_args[0][0]` and render it with
`stmt.compile(compile_kwargs={"literal_binds": True})`.
