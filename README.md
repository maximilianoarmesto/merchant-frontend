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
| `lib/server/openai.ts` | Client factory, key validation, model listing |
| `lib/server/provider-key-service.ts` | Validate a key → persist it → pick a model |
| `lib/server/commerce-tools.ts` | The read-only tools the assistant may call |
| `lib/server/chat-service.ts` | Runs a chat turn: stored key + model + tool loop |
| `lib/models/commerce.ts` | `Product` / `Order` domain models |
| `lib/dto/commerce.ts` | zod schemas for the catalog/checkout payloads + mappers |
| `lib/server/commerce-client.ts` | GET-only HTTP client with session forwarding |
| `lib/server/commerce-repository.ts` | `listProducts` / `getProduct` / `listOrders` / `getOrder` |
| `lib/server/api-route.ts` | Session lookup and error bodies shared by the API routes |
| `app/api/provider/validate-key/route.ts` | `POST` — validate a key, store it when accepted |
| `app/api/provider/models/route.ts` | `GET` — chat-capable models for the stored key |
| `app/api/chat/route.ts` | `POST` — one assistant turn |

## Provider key validation and model selection

`lib/server/provider-key-service.ts` owns the key lifecycle. Routes and server
actions go through it rather than talking to OpenAI and the repository
themselves:

```ts
import { providerKeyService } from "@/lib/server/provider-key-service";

// Probe only — reports "validating" via onState, then "valid" | "invalid".
const state = await providerKeyService.validate(apiKey, { onState: publish });

// Validate, then persist for the merchant only if OpenAI accepted the key.
const saved = await providerKeyService.saveValidatedKey({ apiKey, selectedModel });
if (!saved.ok) return { error: saved.reason }; // nothing was written

// Chat-capable models only — embeddings, audio, image and moderation filtered out.
const models = await providerKeyService.listChatModels();
await providerKeyService.saveSelectedModel({ model: "gpt-4o-mini" });
```

Three rules hold:

- **Validation is explicit.** A key is checked only when a caller asks. Nothing
  re-validates on a timer, and reading a stored config never calls OpenAI, so a
  key OpenAI later revokes stays on file until the merchant revalidates.
- **No write before the provider says yes.** A rejected key — or a model the key
  cannot reach — returns `{ ok: false, reason }` and leaves storage untouched.
- **The stored model stays usable.** A model can only be saved if it is
  chat-capable, and re-saving a key clears a selection the new key cannot reach
  instead of letting it fail at chat time.

## Server-side commerce reads

Server code (the AI assistant, the API route handlers) reads products and orders
through `lib/server/commerce-repository.ts` rather than calling the services
directly:

```ts
import { commerceRepository } from "@/lib/server/commerce-repository";

const products = await commerceRepository.listProducts();
const order = await commerceRepository.getOrder(42); // null when not found
```

Two invariants hold by construction:

- **Read-only.** `getJson` in `commerce-client.ts` hardcodes `method: "GET"`
  and accepts neither a method nor a body, so nothing in this layer can create,
  update or delete upstream state. Writes (checkout sessions, payments) remain
  in the browser-side `lib/api.ts`.
- **Merchant-scoped.** Every call replays the inbound request's `Cookie` and
  `Authorization` headers upstream and sets `X-Merchant-Id`, so the services
  answer for the merchant who is signed in. Reads outside a request (jobs,
  tests) must pass an explicit `auth` context.

Base URLs come from `serverConfig.catalogApiUrl` / `serverConfig.checkoutApiUrl`
— the same `NEXT_PUBLIC_*` values the browser uses. `GET /orders/{id}` is
attempted first for order detail; a 404/405 falls back to selecting the order
out of the merchant's own `GET /orders`.

## The AI assistant (chat)

`lib/server/chat-service.ts` runs one chat turn. It loads the merchant's key and
model server-side, hands OpenAI the read-only commerce tools, and loops until
the model stops asking for data and answers:

```ts
import { runChatCompletion } from "@/lib/server/chat-service";
import { requiresKeyRevalidation } from "@/lib/dto/chat";

const result = await runChatCompletion(request); // request carries no API key

if (!result.ok) {
  // { error, code, action, provider } — e.g. code "key_rejected",
  // action "revalidate_key" when the stored key stopped working mid-chat.
  // `POST /api/chat` returns this body verbatim, with a status per `code`.
  requiresKeyRevalidation(result.error); // → send the merchant to Settings
  return result.error;
}
result.response.message.content; // the answer
result.response.toolCalls;       // the reads it made, for "show your work"
```

Four read-only tools are exposed, each wired to `commerce-repository.ts`:
`list_products`, `get_product`, `list_orders`, `get_order`. **No mutating tool
exists.** The model cannot create a checkout session, pay for one, or change a
product — there is no tool for it, dispatch is by exact name against a closed
map, and a hallucinated `create_product` comes back to the model as an error
saying the assistant is read-only. `commerce-client.ts` makes that structural:
its only outbound call is a hardcoded GET.

The service never throws for a provider failure. It resolves to
`{ ok: false, error }` with a `code` and an `action` the chat UI can act on
without string-matching:

| `code` | `action` | When |
|--------|----------|------|
| `key_missing` | `configure_key` | No key stored for this merchant |
| `key_rejected` | `revalidate_key` | 401/403 — key revoked, expired or narrowed since it was validated |
| `model_unavailable` | `select_model` | 404 — the selected model is out of reach of the key |
| `provider_rate_limited` | `retry` | 429 |
| `provider_unavailable` | `retry` | 5xx, timeout, network |
| `provider_error` | `none` | Anything else |

`key_rejected` is the case worth calling out: a stored key is never
re-validated in the background (see the key-lifecycle rules above), so the
first sign it was revoked is a chat turn failing. That turn returns the
structured error above rather than an empty answer, and the UI prompts the
merchant to re-validate in Settings. Nothing about the stored config is
rewritten — re-validation stays an explicit user action.

The tool loop is bounded by `maxToolRounds` (default 4); on the final round the
tools are withdrawn, so the model always produces an answer.

**The API key never reaches the browser.** It is encrypted at rest, decrypted
only inside `lib/server/`, and the only shape a route may return is
`PublicProviderConfig`, which carries a masked hint (`••••abcd`) instead of the
key. Every module under `lib/server/` and `lib/config/server.ts` imports
`server-only`, so an accidental client import fails the build rather than
leaking a secret.

## HTTP API

Three routes, and the browser talks to nothing else — in particular it never
talks to OpenAI, and no route ever returns a stored key.

| Route | Input | Success | Failure |
|-------|-------|---------|---------|
| `POST /api/provider/validate-key` | `{ apiKey, provider? }` | `200` `{ status: "valid", provider, modelCount, models }` — accepted **and stored** | `200` `{ status: "invalid", provider, reason }`, nothing stored · `400` malformed body |
| `GET /api/provider/models` | `?provider=` (optional) | `200` `{ provider, models }` — chat-capable models the stored key reaches | `409` no key configured · `502` provider refused the key or was unreachable |
| `POST /api/chat` | `{ messages, model?, temperature?, maxTokens? }` | `200` `ChatResponse` — the answer plus the reads behind it | `ChatError` with a status per `code` (below) · `400` malformed body |

Every route resolves the merchant from the platform's existing auth/session, via
`getMerchantSession()` in `lib/server/api-route.ts` — the same
`getCommerceAuthContext()` the server-side commerce reads use, so the assistant's
own catalog/order reads carry the caller's `Cookie` and `Authorization` upstream.
A `merchantId` in a request payload is **not** authoritative: the session decides
whose key, catalog and orders a request touches.

Error bodies are the app's shared `ApiError` shape (`{ error, errors? }`).
`POST /api/chat` answers with `ChatError` — `error` plus the `code`/`action` pair
from the table in the previous section — which is a superset, so a client that
only reads `error` still works. Statuses by `code`:

| `code` | Status | |
|--------|--------|---|
| `key_missing`, `key_rejected`, `model_unavailable` | `409` | The merchant must fix their configuration; `action` says how |
| `provider_rate_limited` | `429` | |
| `provider_unavailable` | `503` | |
| `provider_error` | `502` | |

Two deliberate choices:

- **An invalid key is a `200`.** "This key was rejected, because …" is the answer
  to a validation request, not a failure of it, and the settings screen renders
  it from the `status` discriminator. Nothing was written in that case.
- **A missing key is a `409`, not an empty list**, so the settings screen can
  tell "no key configured" apart from "this key reaches no chat models".

`stream: true` is rejected with a `400` while the chat service is non-streaming.

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
| `COMMERCE_API_TIMEOUT_MS` | `10000` | Per-request timeout for server-side catalog/checkout reads |
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
