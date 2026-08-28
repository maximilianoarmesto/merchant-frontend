---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-8
type: config
title: `DATABASE_URL` defaults to…
tags: [config]
created: 2026-08-28
resource: `app/config.py` in merchant-catalog.
---
`DATABASE_URL` defaults to `postgresql+psycopg2://merchant:merchant@postgres:5432/catalog_db` and `APP_ENV` defaults to `development`, both overridable via env vars.

## Where
`app/config.py` in merchant-catalog.
