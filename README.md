# AppNation AI Chat — Backend + Frontend

This repo ships both halves of the case study:

- **Backend** (this directory): TypeScript + Express + Prisma + PostgreSQL with runtime feature flagging, Anthropic / Groq / OpenAI providers, JWT auth, real-time SSE streaming. Architecture, design patterns, coding standards, and the verification checklist live in [`CLAUDE.md`](./CLAUDE.md).
- **Frontend** ([`frontend/`](./frontend)): React + Vite + shadcn/ui + lucide-react + framer-motion. Animated chat UI, SSE streaming, real-time `tool_execution` cards, pagination, multi-client detection, runtime feature-flag awareness. See [`frontend/README.md`](./frontend/README.md).

Run them together with the steps below.

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

```bash
make install                         # backend + frontend deps + husky hooks
cp .env.example .env                 # set JWT_SECRET, APP_CHECK_TOKEN, AI keys
cp frontend/.env.example frontend/.env

make db-up                           # local Postgres
make migrate ARGS="--name init"      # apply Prisma migrations

make dev                             # backend + frontend, hot reload, on :3000 + :5173
```

That's it. Both Node services hot-reload on file changes:
- **Backend** — `tsx watch src/server.ts` (recompiles + restarts in <1s)
- **Frontend** — `vite --host` (HMR, no full reload)

For the full menu run `make help`. Common targets:

| Target | What it does |
|---|---|
| `make dev` | Backend + frontend together with hot reload (`concurrently -n api,web`). |
| `make build` | Build both (`tsc` + `vite build`). |
| `make verify` | typecheck + lint + tests + `prisma:check` — same gate as `pre-push`. |
| `make migrate ARGS="--name x"` | Create + apply a dev migration. |
| `make migrate-check` | DB-less schema validation (`prisma validate` + `format --check`). |
| `make migrate-shadow-check` | Real drift check via a throwaway Postgres container. |
| `make docker-dev` | Run dev profile in Docker (api + web hot reload + db). |
| `make docker-prod` | Run prod profile in Docker (compiled image, runs migrations on startup). |
| `make hooks-install` | Re-attach husky hooks if cloning skipped them. |

### Docker profiles

`docker-compose.yml` ships three named profiles:

```bash
make docker-dev      # db + api-dev (tsx watch) + web-dev (vite --host)
make docker-prod     # db + api (built image, migrate deploy on entrypoint)
make docker-test     # db-test on :5433
```

Hot reload inside containers works via bind-mounted source + named volumes for `node_modules`. On macOS/Windows set `CHOKIDAR_USEPOLLING=true` if HMR misses events.

### Git hooks

`make install` runs `husky` and attaches:
- **pre-commit** → `lint-staged` (ESLint + Prettier on staged files only; Prisma schema auto-formatted). Sub-second on small commits.
- **pre-push** → typecheck (back+front) + lint (back+front) + test suite + `prisma:check`.

If your shell prints "fatal: not a git repository" during install, run `git init` and then `make hooks-install`.

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
| `AI_TOOLS_ENABLED` | bool | `false` | AI may call mocked tools |
| `CHAT_HISTORY_ENABLED` | bool | `true` | `false` ⇒ last 10 messages only |
| `RATE_LIMIT_PER_MINUTE` | int | `60` | Per-route, per-user ceiling |

### Toggle without redeploy

Two options, both work without restarting the process:

**A. JSON file + SIGHUP** (recommended for ops):

```bash
echo '{"STREAMING_ENABLED": false}' > flags.json
FEATURE_FLAGS_FILE=$(pwd)/flags.json pnpm start &
APP_PID=$!

# Flip the flag at runtime
echo '{"STREAMING_ENABLED": true}' > flags.json
kill -HUP $APP_PID
```

**B. Env var change + restart**: for orchestrated deployments where the orchestrator can update env and replace the process.

The `/healthz` endpoint exposes the current snapshot:

```bash
curl -s http://localhost:3000/healthz | jq .flags
```

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

## Decisions

- **Express + manual DI** instead of NestJS — patterns stay visible per the case study's "basic manual injection is acceptable" note.
- **Anthropic Sonnet 4.6 as the prime chat model** (direct API, not via Vercel AI SDK), with Groq as the fast path and OpenAI as an additional supported alternative. Mock fallback so the system runs end-to-end with zero external services.
- **Cursor-based pagination** — scales beyond `OFFSET … LIMIT`.
- **404 (not 403) on cross-user access** — does not leak the existence of resources.
