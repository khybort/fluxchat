# AppNation AI Chat — Backend + Frontend

> **Repository:** https://github.com/khybort/fluxchat
> **Live demo:**
> - Frontend → https://fluxchat-web-ecru.vercel.app
> - Backend → https://fluxchat-api.vercel.app
> - Swagger UI → https://fluxchat-api.vercel.app/docs · OpenAPI 3.1 → https://fluxchat-api.vercel.app/docs.json
> - Liveness + flag snapshot → https://fluxchat-api.vercel.app/healthz
>
> **Evaluator quickstart:** `make install && cp .env.example .env && make db-up && make migrate ARGS="--name init" && make verify` runs the same gate the `pre-push` hook enforces (typecheck × 2, lint × 2, full vitest suite, prisma schema check). Architecture map: [`ARCHITECTURE.md`](./ARCHITECTURE.md). Deep contract: [`CLAUDE.md`](./CLAUDE.md). Production runbook: [`DEPLOYMENT.md`](./DEPLOYMENT.md).

This repo ships both halves of the case study:

- **Backend** (this directory): TypeScript + Express + Prisma + PostgreSQL with runtime feature flagging, Anthropic / Groq / OpenAI providers, JWT auth, real-time SSE streaming. Architecture, design patterns, coding standards, and the verification checklist live in [`CLAUDE.md`](./CLAUDE.md).
- **Frontend** ([`frontend/`](./frontend)): React + Vite + shadcn/ui + Phosphor (duotone) icons + framer-motion. Animated chat UI, SSE streaming, real-time `tool_execution` cards, pagination, multi-client detection, runtime feature-flag awareness. See [`frontend/README.md`](./frontend/README.md).

Run them together with the steps below — or skip straight to [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the free-tier production deploy (Neon Postgres + Vercel + GitHub Actions, triggered by every merge to `main`).

## Features

- 3 endpoints: `GET /api/chats`, `GET /api/chats/:chatId/history`, `POST /api/chats/:chatId/completion`.
- Streaming completions via Server-Sent Events. Three AI providers are supported:
  - **Prime** — Anthropic Claude Sonnet 4.6 (direct `@anthropic-ai/sdk`)
  - **Fast** — Groq `openai/gpt-oss-120b` (OpenAI-compatible API)
  - **Extra** — OpenAI (Vercel AI SDK)
  - Plus a deterministic mock fallback when no key is set.
- Composite `FallbackAiProvider` for tool-agent analysis: tries Groq first, falls back to Anthropic.
- Real-time `tool_execution` events during Anthropic streaming — tools fire on `content_block_stop`, before the follow-up text deltas, so SSE clients see the result immediately.
- Pluggable rate-limit store: in-memory by default, Redis (via `ioredis`) when `REDIS_URL` is set. Same `IRateLimitStore` interface, swap is one line.
- Feature flags drive runtime behavior with **no redeploy** — change a value, send `SIGHUP`, behavior flips.
- Five mandatory design patterns visibly applied: Singleton, Repository, Service, manual Dependency Injection, Strategy.
- Strict TypeScript, structured logging (pino), zod-validated config and request schemas.

## Quickstart

### Prerequisites

- Node.js ≥ 20.11
- pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker (for the database, dev compose profile, and shadow drift check)
- GNU make (preinstalled on macOS / Linux)

### Run it

Two supported paths. **Docker is the recommended one** — it gives you a clean, reproducible stack (db + api + web) with one command and zero host-side toolchain beyond Docker itself.

| | Recommended: Docker | Alternative: Local |
|---|---|---|
| Need on host | Docker, `make` | Docker (db only), Node 20.11+, pnpm 9+ |
| Hot reload | Yes (bind-mounted src) | Yes (native `tsx`/`vite`) |
| When to pick | Default. New machine, CI parity, "just run it". | You're iterating fast and prefer native tooling, or HMR feels sluggish under Docker. |

#### A. Docker (recommended)

```bash
cp .env.example .env                 # set JWT_SECRET, APP_CHECK_TOKEN, AI keys
cp frontend/.env.example frontend/.env

make docker-dev                      # db + api (tsx watch) + web (vite), all in containers
# in a second terminal, once db is healthy:
make migrate ARGS="--name init"      # apply Prisma migrations against the dev db
```

Backend on `:3000`, frontend on `:5173`, Postgres on `:5432` (forwarded so `make migrate` from the host hits the same db). Stop with `make docker-dev-down`.

On macOS/Windows, if HMR misses file events, set `CHOKIDAR_USEPOLLING=true` in `.env`.

#### B. Local (no containers for app code)

```bash
make install                         # backend + frontend deps + husky hooks
cp .env.example .env
cp frontend/.env.example frontend/.env

make db-up                           # local Postgres in a container
make migrate ARGS="--name init"      # apply Prisma migrations
make dev                             # backend + frontend, hot reload, on :3000 + :5173
```

Both Node services hot-reload on file changes:
- **Backend** — `tsx watch src/server.ts` (recompiles + restarts in <1s)
- **Frontend** — `vite --host` (HMR, no full reload)

#### Make targets

For the full menu run `make help`. Common targets:

| Target | What it does |
|---|---|
| `make docker-dev` | Run dev profile in Docker (db + api + web, hot reload). **Recommended.** |
| `make docker-dev-down` | Stop the dev profile. |
| `make dev` | Run backend + frontend on the host (`concurrently -n api,web`). |
| `make build` | Build both (`tsc` + `vite build`). |
| `make verify` | typecheck + lint + tests + `prisma:check` — same gate as `pre-push`. |
| `make migrate ARGS="--name x"` | Create + apply a dev migration. |
| `make migrate-check` | DB-less schema validation (`prisma validate` + `format --check`). |
| `make migrate-shadow-check` | Real drift check via a throwaway Postgres container. |
| `make docker-prod` | Run prod profile in Docker (compiled image, runs migrations on startup). |
| `make docker-test` | Bring up the dedicated test database on `:5433`. |
| `make hooks-install` | Re-attach husky hooks if cloning skipped them. |

### Git hooks

`make install` runs `husky` and attaches:
- **pre-commit** → `lint-staged` (ESLint + Prettier on staged files only; Prisma schema auto-formatted). Sub-second on small commits.
- **pre-push** → typecheck (back+front) + lint (back+front) + test suite + `prisma:check`.

If your shell prints "fatal: not a git repository" during install, run `git init` and then `make hooks-install`.

## API documentation (Swagger)

Once the backend is running, a live OpenAPI 3.1 spec generated from the same zod
schemas that validate requests is available at:

| URL | What you get |
|---|---|
| http://localhost:3000/docs | Swagger UI — try-it-out, persisted Auth header |
| http://localhost:3000/docs.json | Raw OpenAPI 3.1 document |

Both are public (gated only by the `DOCS_ENABLED` env flag, default `true`). Set
`DOCS_ENABLED=false` to disable them — both URLs then explicitly return 404. See
[CLAUDE.md §17.3](./CLAUDE.md) for how to extend the docs when adding endpoints.

## Endpoints

All endpoints require:
- `Authorization: Bearer <jwt>` (signed with `JWT_SECRET`, payload `{ sub, email }`)
- `x-firebase-app-check: <APP_CHECK_TOKEN>`
- `x-client-type: web | mobile | desktop` (optional, defaults to `web`)

### Generate a test JWT

```bash
node -e "console.log(require('jsonwebtoken').sign({sub:'00000000-0000-0000-0000-000000000001', email:'demo@example.com'}, process.env.JWT_SECRET))"
```

### `GET /api/chats`

```bash
curl -s "http://localhost:3000/api/chats?limit=5" \
  -H "Authorization: Bearer $JWT" \
  -H "x-firebase-app-check: $APP_CHECK_TOKEN" | jq
```

Returns:

```json
{
  "data": [{ "id": "...", "title": "...", "userId": "...", "createdAt": "...", "updatedAt": "..." }],
  "pagination": { "nextCursor": null, "hasMore": false, "limit": 5 }
}
```

### `GET /api/chats/:chatId/history`

```bash
curl -s "http://localhost:3000/api/chats/$CHAT_ID/history" \
  -H "Authorization: Bearer $JWT" \
  -H "x-firebase-app-check: $APP_CHECK_TOKEN" | jq
```

When `CHAT_HISTORY_ENABLED=false`, only the last 10 messages are returned.

### `POST /api/chats/:chatId/completion`

**Streaming (`STREAMING_ENABLED=true`)**:

```bash
curl -N "http://localhost:3000/api/chats/$CHAT_ID/completion" \
  -H "Authorization: Bearer $JWT" \
  -H "x-firebase-app-check: $APP_CHECK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

Response is a stream of SSE events: `thinking`, `delta` (repeated), and finally `done`. With `AI_TOOLS_ENABLED=true`, `tool_execution` events are interleaved.

**JSON (`STREAMING_ENABLED=false`)**:

Same request, returns `{"message": {"role":"assistant","content":"..."}, "toolCalls": [...] }`.

## Feature flags

| Flag | Type | Default | Effect |
|---|---|---|---|
| `STREAMING_ENABLED` | bool | `true` | SSE vs JSON for completion |
| `PAGINATION_LIMIT` | int (10–100) | `20` | Max page size for chat list and history |
| `AI_TOOLS_ENABLED` | bool | `false` | Master switch — AI may call mocked tools |
| `CHAT_HISTORY_ENABLED` | bool | `true` | `false` ⇒ last 10 messages only |
| `RATE_LIMIT_PER_MINUTE` | int | `60` | Per-route, per-user (or per-(user, client)) ceiling |
| `COMPLETION_ENABLED` | bool | `true` | Kill-switch — false returns `404 FEATURE_DISABLED` for the completion route |
| `TOOL_CALCULATOR_ENABLED` | bool | `true` | Subordinate to `AI_TOOLS_ENABLED` — exposes the calculator tool |
| `TOOL_CURRENT_TIME_ENABLED` | bool | `true` | Subordinate — exposes the time tool |
| `TOOL_CURRENT_WEATHER_ENABLED` | bool | `true` | Subordinate — exposes the weather tool |
| `TOOL_CONVERT_CURRENCY_ENABLED` | bool | `true` | Subordinate — exposes the FX tool |
| `TOOL_SEARCH_WEB_ENABLED` | bool | `true` | Subordinate — exposes the web-search tool |

The first four flags drive **behavior** via the Strategy + Factory pair (e.g. [`CompletionStrategyFactory`](./src/modules/chat/strategies/completion-strategy.factory.ts), [`HistoryStrategyFactory`](./src/modules/chat/strategies/history-strategy.factory.ts)) — controllers stay branch-free. `COMPLETION_ENABLED` is a route-specific **middleware** kill-switch via [`featureFlagGuard`](./src/shared/middleware/feature-flag-guard.ts) — when off, the completion route short-circuits with 404 (case §6 "Important Note": route-specific feature checks).

The five `TOOL_*_ENABLED` flags are **subordinate** to `AI_TOOLS_ENABLED`: the master must be on for any tool to fire, and each per-tool flag then independently includes/excludes that tool from the model's allowlist via [`resolveEnabledTools`](./src/infrastructure/ai/tools/resolve-enabled.ts). This lets ops disable a single noisy/expensive tool (e.g. `searchWeb`) without taking the whole tool feature offline.

### Targeting & rollout (rule + percentage)

The JSON file at `FEATURE_FLAGS_FILE` accepts two shapes side-by-side. The bare primitive form is the original behavior — every user gets the same value:

```jsonc
{ "STREAMING_ENABLED": true }
```

The rich form unlocks **per-user / per-segment evaluation** (case §Business Context: "A/B test with specific user groups", "limit expensive features to premium users", "roll out features gradually"):

```jsonc
{
  "CHAT_HISTORY_ENABLED": {
    "default": true,
    "rules": [
      { "if": { "userRole": "admin" }, "value": true },
      { "if": { "clientType": "mobile" }, "value": false }
    ]
  },
  "AI_TOOLS_ENABLED": {
    "default": false,
    "rules": [{ "if": { "userRole": "admin" }, "value": true }],
    "percentage": 25
  }
}
```

Evaluation order per `flags.get(name, ctx)` call:
1. **Rules** — walked in declaration order, first match wins. Every key in `if` must equal the matching field in `ctx` (AND); missing keys are wildcards.
2. **Percentage** — boolean flags only. The user is bucketed via `sha1(flagName + userId) % 100`, deterministic across runs, so a user "in" the rollout stays in. Different flags use different buckets so rollouts don't pile on the same users.
3. **Default** — fallback.

Context fields are sourced from [`flagContextFrom(req)`](./src/shared/feature-flags/context.ts): `userId`, `clientType`, `userRole`. `plan` is reserved for a future subscription-tier hook. A complete sample lives at [`flags.example.json`](./flags.example.json).

`/healthz` returns the **evaluated default** snapshot only — no rule structure leaks publicly. Ops surfaces hit `GET /admin/flags` (token-gated) for the rich form.

### Toggle without redeploy

Three options, all without restarting the process:

**A. JSON file + SIGHUP** (recommended for self-hosted):

```bash
echo '{"STREAMING_ENABLED": false}' > flags.json
FEATURE_FLAGS_FILE=$(pwd)/flags.json pnpm start &
APP_PID=$!

# Flip the flag at runtime
echo '{"STREAMING_ENABLED": true}' > flags.json
kill -HUP $APP_PID
```

**B. Admin endpoint** (recommended for serverless — `kill -HUP` doesn't reach a Vercel lambda):

```bash
curl -X POST https://fluxchat-api.vercel.app/admin/flags/reload \
     -H "x-admin-token: $ADMIN_TOKEN"
# Returns the new snapshot. Set ADMIN_TOKEN (≥16 chars) on Vercel; without it
# both /admin/flags routes fail-closed with 404.
```

**C. Env var change + restart**: for orchestrated deployments where the orchestrator can update env and replace the process.

`/healthz` exposes the public, context-free snapshot. `GET /admin/flags` returns the full rich-form definitions for ops:

```bash
curl -s http://localhost:3000/healthz | jq .flags
curl -s -H "x-admin-token: $ADMIN_TOKEN" http://localhost:3000/admin/flags | jq
```

### Admin UI (`/admin/flags`)

Admin-role users see a "Feature flags" entry in the user dropdown that opens
[`/admin/flags`](https://fluxchat-web-ecru.vercel.app/admin/flags) — a
dashboard for editing flag definitions live, no redeploy required:

- Toggle defaults, drag the rollout-percentage slider, add/remove segment rules.
- "Test as user" panel below the editor evaluates against a synthetic
  `{ userId, userRole, clientType }` context server-side, so the bucket-hash
  semantics stay single-source-of-truth.
- "Reload" button triggers `POST /api/admin/flags/reload` — pulls the latest
  state from the DB + file + env into the live in-memory snapshot.

Edits persist in the `feature_flag_overrides` Postgres table (one row per
flag, JSON `definition` + `updatedBy` audit). The DB layer wins over the
JSON file, which wins over env defaults — so an admin UI edit always beats
a static deploy artifact.

To grant admin: update the `users.role` column to `admin` in Postgres
(future: an admin "manage users" surface). The JWT mints with the role
baked in on next login.

### Multi-instance consistency (known limitation)

Flag state lives in-process. On Vercel serverless this means each warm lambda instance holds its own copy. SIGHUP reaches the process that received it; `POST /admin/flags/reload` reaches the one lambda that handled the request. **Other warm instances see the change either on their own next reload trigger or on cold start.** For most flags this is fine — kill-switches converge in seconds as instances recycle, and low-traffic free-tier deploys typically have one warm instance.

For sub-second cross-instance consistency on a paid-tier production fleet, the canonical pattern is **Redis pub/sub on a `flags:reload` channel** — one publisher (the admin endpoint) and N subscribers (each lambda boot). The project already wires `ioredis` for the rate-limit store, so the upgrade path is well-paved when the product needs it. Out of scope for the current free-tier deploy.

## Tests

```bash
pnpm test           # unit + integration, with coverage
pnpm test:watch
```

Integration tests use in-memory repositories — no database required for the test suite.

## Verification (DoD)

```bash
pnpm typecheck   # tsc --noEmit, 0 errors
pnpm lint        # eslint, 0 errors
pnpm test        # vitest, all green
pnpm build       # dist/ produced
docker compose up --build   # app starts, /healthz returns ok
```

## Project layout

See [`CLAUDE.md` §3](./CLAUDE.md). One sentence summary: feature modules under `src/modules/`, cross-cutting under `src/infrastructure/` and `src/shared/`, composition root in `src/di/container.ts`, lifecycle in `src/server.ts`.

## AI providers

Three providers are wired through a common `IAiProvider` interface (CLAUDE.md §7.4.b):

| Role | Provider | Default model | Selection |
|---|---|---|---|
| Prime | Anthropic (direct SDK) | `claude-sonnet-4-6` | Used by chat completion. Picked first if `ANTHROPIC_API_KEY` is set. |
| Fast | Groq (OpenAI-compatible) | `openai/gpt-oss-120b` | Used by tool-agent / analysis paths via `FallbackAiProvider(Groq, Anthropic)`. |
| Extra | OpenAI (Vercel AI SDK) | `gpt-4o-mini` | Picked for the prime path when only `OPENAI_API_KEY` is set. |
| Mock | Deterministic | n/a | Fallback when no keys are configured. |

`FallbackAiProvider` wraps two providers — primary first, secondary on failure. Streaming fallback only fires *before* the first token; once bytes are on the wire, errors propagate.

### AI tools (gated by `AI_TOOLS_ENABLED`)

Five tools ship behind a single registry ([`src/infrastructure/ai/tools/`](./src/infrastructure/ai/tools/)) — every provider (Anthropic, Groq, OpenAI, Mock) reads the same list. Adding a new tool is a single file in that folder plus one line in [`registry.ts`](./src/infrastructure/ai/tools/registry.ts).

| Tool | Description | Sample prompt |
|---|---|---|
| `calculator` | Safe arithmetic evaluator (digits + - × ÷ and parentheses; no identifiers, no eval injection) | "what is (12 * 7) - 3 / 2?" |
| `getCurrentTime` | IANA-timezone-aware current time + weekday | "what time is it in Tokyo?" |
| `getCurrentWeather` | Deterministic mock weather with temperature, condition, humidity, wind | "weather in Istanbul" |
| `convertCurrency` | Fixed-rate FX over USD/EUR/TRY/GBP/JPY/CHF/CAD (snapshot 2026-Q2) | "how much is 100 USD in TRY?" |
| `searchWeb` | **Real** web search via DuckDuckGo Instant Answer API — no key, no setup. Falls back to empty on timeout / 5xx | "who is Ada Lovelace?" |

All tools implement the same shape — name, description, zod-typed parameters, an `execute(args)` impl, and an optional `detectIntent(prompt)` heuristic so the deterministic `MockAiProvider` exercises them in tests. Schema validation runs at `executeTool()` before the implementation, and any thrown error returns a structured `{ error }` envelope so the LLM can recover instead of the stream blowing up.

## Rate limiting

Per-route, per-user (fallback to IP). The backend is pluggable via `IRateLimitStore`:

| Store | When |
|---|---|
| `InMemoryRateLimitStore` | Default. Single-process / dev. |
| `RedisRateLimitStore` (ioredis) | When `REDIS_URL` is set. Multi-instance safe. |

```bash
# Local Redis for testing the multi-instance path
docker run -d --name appnation-redis -p 6379:6379 redis:7-alpine
REDIS_URL=redis://localhost:6379 pnpm dev
```

Algorithm: fixed-window counter (`INCR`/`PEXPIRE`/`PTTL` in Redis; bucket-with-refill in memory). Both expose the same `consume(key, limit, windowMs) -> Promise<RateLimitDecision>` contract.

## Deployment

Free-tier production stack: **Neon Postgres + Vercel (backend serverless + frontend SPA) + GitHub Actions**. Every merge to `main` runs the CI gate (typecheck × 2, lint × 2, 70 tests, schema check, build × 2), applies Prisma migrations, then deploys both halves to Vercel in parallel.

Step-by-step setup (signup, env vars, GitHub secrets) lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Decisions

- **Express + manual DI** instead of NestJS — patterns stay visible per the case study's "basic manual injection is acceptable" note.
- **Anthropic Sonnet 4.6 as the prime chat model** (direct API, not via Vercel AI SDK), with Groq as the fast path and OpenAI as an additional supported alternative. Mock fallback so the system runs end-to-end with zero external services.
- **Cursor-based pagination** — scales beyond `OFFSET … LIMIT`.
- **404 (not 403) on cross-user access** — does not leak the existence of resources.
