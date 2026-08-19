---
id: 63c8ed55-67fb-4158-bb23-f26e218d1d28-10
type: gotcha
title: `npm run lint` hangs in this repo because ESLint has never been configured, so Next.js's…
tags: [gotcha]
created: 2026-08-19
resource: package.json lint script (next lint)
---
`npm run lint` hangs in this repo because ESLint has never been configured, so Next.js's CLI prompts interactively for a config choice and stalls in a non-interactive shell

## Why
worth knowing before relying on lint in an automated/headless session

## Where
package.json lint script (next lint)
