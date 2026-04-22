# merchant-frontend

Next.js 14 (App Router) + TypeScript merchant-facing UI for the Merchant MVP.

## Pages
- `/` — redirects to `/products`
- `/products` — product list
- `/products/[id]` — product detail
- `/checkout` — create a checkout session and simulate payment
- `/orders` — list created orders
- `/settings` — placeholder for future AI merchant assistant config

The UI uses a minimal black-and-white style (pure CSS, no framework) so the
focus stays on the cross-repo data flow.

## Tech
- Next.js 14 (App Router) in standalone output mode
- TypeScript, React 18
- `fetch` against the catalog and checkout/payment services

## Local development

### With Docker Compose (preferred, from repo root)
```bash
docker compose up --build merchant-frontend
```

### Standalone
```bash
npm install
cp .env.example .env.local
npm run dev
```
Then open http://localhost:3000 (standalone dev mode).
Under `docker compose up`, the frontend is published on **http://localhost:3010**.

## Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_CATALOG_API_URL` | `http://localhost:8001` | Catalog service URL |
| `NEXT_PUBLIC_CHECKOUT_API_URL` | `http://localhost:8002` | Checkout/payment service URL |

Note: `NEXT_PUBLIC_*` vars are evaluated in the browser, so under Docker
Compose they must point at URLs reachable from your host (e.g. `localhost:8001`),
not at the compose service names.
