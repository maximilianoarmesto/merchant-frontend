---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-6
type: gotcha
title: The merchant-catalog repo has no test suite.
tags: [gotcha]
created: 2026-08-28
---
The merchant-catalog repo has no test suite.

## Learned
verifying route/handler changes requires manually building a throwaway Python venv with the service's pinned deps (fastapi, sqlalchemy, pydantic, etc. from requirements.txt) and driving the router with `TestClient`, mocking `product_service` and overriding `get_db`.
