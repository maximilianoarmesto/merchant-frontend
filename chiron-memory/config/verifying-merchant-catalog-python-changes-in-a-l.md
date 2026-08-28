---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-1
type: config
title: Verifying merchant-catalog Python changes in a local throwaway venv fails
tags: [config]
created: 2026-08-28
resource: chiron-memory/gotcha/the-merchant-catalog-repo-has-no-tests-directory.md (updated)
---
Verifying merchant-catalog Python changes in a local throwaway venv fails — pydantic==2.9.2 cannot build pydantic-core wheels on this machine

## Why
superseded a prior memory that recommended venv-based verification

## Learned
verify service-layer changes instead by running scripts inside the running 'merchant-catalog' Docker container with PYTHONPATH=/app, e.g. `docker exec -w /app -e PYTHONPATH=/app merchant-catalog python /tmp/verify_script.py`.

## Where
chiron-memory/gotcha/the-merchant-catalog-repo-has-no-tests-directory.md (updated)
