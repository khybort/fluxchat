# Architecture

A short, evaluator-facing overview of how the AppNation AI Chat backend is organized. The deeper contract — coding standards, exhaustive forbidden patterns, and the verification checklist — lives in [`CLAUDE.md`](./CLAUDE.md). The deployment runbook lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Layers

```
HTTP → controller → service → repository → prisma → PostgreSQL
                       │
                       └── strategy (feature-flag-driven behavior)
```

Imports never go backwards. Controllers speak HTTP and never touch Prisma. Services hold business rules and have no `Request`/`Response` types in their signatures. Repositories return **domain types**, mapped from Prisma rows in `*.mapper.ts`. Cross-module access goes through services, never another module's repository.

## Five design patterns

| Pattern    | Where to look                                                                                                                                                           |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Singleton  | [`Config`](./src/config/config.ts), [`Logger`](./src/infrastructure/logger/logger.ts), [`PrismaService`](./src/infrastructure/database/prisma.service.ts), [`FeatureFlagService`](./src/shared/feature-flags/feature-flag.service.ts) — each has a private constructor + `getInstance()` + `resetForTesting()`. |
| Repository | [`IChatRepository`](./src/modules/chat/chat.repository.interface.ts) + [`ChatRepository`](./src/modules/chat/chat.repository.ts) + [`chat.mapper.ts`](./src/modules/chat/chat.mapper.ts). Service depends on the interface; tests use [`InMemoryChatRepository`](./tests/helpers/in-memory-repositories.ts).  |
| Service    | [`ChatService`](./src/modules/chat/chat.service.ts), [`CompletionService`](./src/modules/chat/completion.service.ts), [`HistoryService`](./src/modules/chat/history.service.ts), [`AuthService`](./src/modules/auth/auth.service.ts) — pure business logic, throws `AppError` subclasses. |
| DI         | [`src/di/container.ts`](./src/di/container.ts) is the **only** file that calls `new` on services and repositories. Tests build their own container with mocks via [`tests/helpers/build-test-app.ts`](./tests/helpers/build-test-app.ts). |
| Strategy   | [`CompletionStrategyFactory`](./src/modules/chat/strategies/completion-strategy.factory.ts) → `Streaming` vs `Json`; [`HistoryStrategyFactory`](./src/modules/chat/strategies/history-strategy.factory.ts) → `Full` vs `Limited`. Controllers stay branch-free. |

If you find yourself writing `if (flag) doA() else doB()` in a controller or service, that violates Open/Closed. Lift the branch into a Strategy + Factory.

## Feature-flag flow

`flag → factory → strategy`. Five flags ship today: `STREAMING_ENABLED`, `PAGINATION_LIMIT`, `AI_TOOLS_ENABLED`, `CHAT_HISTORY_ENABLED`, `RATE_LIMIT_PER_MINUTE`, plus the `COMPLETION_ENABLED` kill-switch enforced at the route layer by [`featureFlagGuard`](./src/shared/middleware/feature-flag-guard.ts) (404 + `FEATURE_DISABLED` when off).

Sources, in priority order:
1. JSON file at `FEATURE_FLAGS_FILE` (live-reloadable).
2. Environment variables.
3. Code defaults.

`SIGHUP` triggers `flags.reload()` and emits a structured `feature_flags_reloaded` log line with the diff. `GET /healthz` returns the live snapshot for frontends and ops dashboards.

## SSE pipeline

```
chat.controller.completion
  → CompletionStrategyFactory.build(flags)
    → StreamingCompletionStrategy.execute()
      → AnthropicProvider.stream()
        ├─ event: thinking          (start)
        ├─ event: tool_execution    (only when AI_TOOLS_ENABLED + tool fired)
        ├─ event: delta             (repeated)
        └─ event: done              (end)
  → sse.serializer writes `event:\ndata:\n\n` to res
```

`tool_execution` is emitted **before** the explanatory text by watching the raw Anthropic event stream (`content_block_start` → `content_block_delta` → `content_block_stop`), so clients render the tool call in order. `FallbackAiProvider` only switches providers if the primary fails *before* the first token — once bytes are on the wire, errors propagate.

## Middleware (per the case)

App Check → Auth (JWT) → Client type → per-route validate + rate-limit + feature-flag-guard → routes → `/docs` → notFound → errorHandler. Public auth routes (`/api/auth/register`, `/api/auth/login`) mount before the global JWT requirement; everything else after. `clientTypeMiddleware` rebinds `req.log` so every downstream log line carries the client type, and the completion route keys its rate-limit bucket on `(user, clientType)` so a user's mobile and web sessions don't share quota.

## Where to read next

- [`CLAUDE.md`](./CLAUDE.md) — exhaustive coding standards, forbidden patterns, lifecycle order.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Vercel + Neon + GitHub Actions free-tier deploy.
- [`README.md`](./README.md) — local quickstart, smoke tests, demo URLs.
