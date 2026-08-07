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
- SQLite (`better-sqlite3`) for merchant-owned settings
- `zod` for request/response DTO validation
- `openai` SDK, server-side only

## AI assistant configuration

Each merchant supplies their own OpenAI API key. The layout:

| Path | Role |
|------|------|
| `lib/config/public.ts` | `NEXT_PUBLIC_*` URLs — safe in the browser |
| `lib/config/server.ts` | Secrets and server settings; guarded by `server-only` |
| `lib/models/provider-config.ts` | `ProviderConfig` and its browser-safe projection |
| `lib/dto/` | zod schemas for validate-key, list-models, chat, and config save |
| `lib/server/crypto.ts` | AES-256-GCM envelope encryption for stored keys |
| `lib/server/db.ts` | SQLite connection and `provider_configs` schema |
| `lib/server/provider-config-repository.ts` | Per-merchant create/update/fetch/delete |
| `lib/server/openai.ts` | Client factory, key validation, model listing, chat |

**The API key never reaches the browser.** It is encrypted at rest, decrypted
only inside `lib/server/`, and the only shape a route may return is
`PublicProviderConfig`, which carries a masked hint (`••••abcd`) instead of the
key. Every module under `lib/server/` and `lib/config/server.ts` imports
`server-only`, so an accidental client import fails the build rather than
leaking a secret.

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

Public — baked into the client bundle at build time:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_CATALOG_API_URL` | `http://localhost:8001` | Catalog service URL |
| `NEXT_PUBLIC_CHECKOUT_API_URL` | `http://localhost:8002` | Checkout/payment service URL |

Note: `NEXT_PUBLIC_*` vars are evaluated in the browser, so under Docker
Compose they must point at URLs reachable from your host (e.g. `localhost:8001`),
not at the compose service names.

Server-only — never sent to the browser:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_CONFIG_DB_PATH` | `./data/merchant.db` | SQLite file holding provider configs |
| `PROVIDER_CONFIG_ENCRYPTION_KEY` | — | AES-256-GCM key for stored API keys. **Required in production** |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Override for OpenAI-compatible gateways |
| `OPENAI_DEFAULT_MODEL` | `gpt-4o-mini` | Fallback when a merchant has selected no model |
| `OPENAI_TIMEOUT_MS` | `30000` | Per-request timeout |
| `DEFAULT_MERCHANT_ID` | `merchant-local` | Placeholder tenant until auth exists |

Generate an encryption key with `openssl rand -base64 32`. Hex, base64, and
plain passphrases are all accepted. Without one, development falls back to a
well-known key and logs a warning; production refuses to start the first
encrypt/decrypt. Rotating the key makes existing stored keys undecryptable —
merchants must re-enter them.

Under Docker the database lives at `/app/data/merchant.db`; mount a volume on
`/app/data` to keep configs across restarts.
