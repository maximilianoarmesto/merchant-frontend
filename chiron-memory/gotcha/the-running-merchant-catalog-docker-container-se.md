---
id: c6bade42-7f7b-432f-8ec1-44630bf643ba-7
type: gotcha
title: The running merchant-catalog Docker container serves the pre-edit code and is not…
tags: [gotcha]
created: 2026-08-28
---
The running merchant-catalog Docker container serves the pre-edit code and is not auto-reloaded by local file edits.

## Learned
changes to `app/api/products.py` (or other service files) won't be visible via the frontend or curl until the container is rebuilt/restarted — must be done explicitly (and confirmed with the user first, since it's a shared/running service).
