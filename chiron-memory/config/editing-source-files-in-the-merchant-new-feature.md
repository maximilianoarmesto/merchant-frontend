---
id: 9f3a7506-36d1-422c-8412-bcfaaeb7b925-6
type: config
title: Editing source files in the 'Merchant - New Features/merchant-catalog' checkout does not…
tags: [config]
created: 2026-08-28
---
Editing source files in the 'Merchant - New Features/merchant-catalog' checkout does not automatically propagate into the running merchant-catalog Docker container

## Why
the container was built from a prior image/copy and is not volume-mounted or auto-rebuilt from the host checkout

## Learned
to verify service-layer changes reflect in the running container, manually copy the edited file into the container (e.g. `docker cp`) before running verification scripts inside it.
