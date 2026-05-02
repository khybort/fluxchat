# Architecture

A short, evaluator-facing overview of how the AppNation AI Chat backend is organized. The deeper contract — coding standards, exhaustive forbidden patterns, and the verification checklist — lives in [`CLAUDE.md`](./CLAUDE.md). The deployment runbook lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Layers (per module)

Every feature module follows a strict three-layer Clean Architecture shape. The **dependency rule** is one-way: outer layers depend on inner layers, never the reverse.

```
                            ┌──────────────────────────┐
HTTP request ──────────────►│  adapters/http           │  ← Express, zod DTOs, OpenAPI
                            │  (controller binds to    │
                            │   the use case bag)      │
                            └────────────┬─────────────┘
                                         │ depends on
                                         ▼
                            ┌──────────────────────────┐
                            │  application             │  ← business logic, no Express
                            │  ├ use-cases/  (1 class  │
                            │  │ per business op)      │
                            │  ├ policies/   (shared   │
                            │  │ domain rules)         │
                            │  ├ strategies/ (flag-    │
                            │  │ driven algorithms)    │
                            │  └ ports/      (interface│
                            │    contracts)            │
                            └────────────┬─────────────┘
                                         │ depends on
                                         ▼
                            ┌──────────────────────────┐
                            │  domain                  │  ← entity types only
                            │  *.types.ts              │     (anemic — TypeScript
                            │                          │      stack convention)
                            └──────────────────────────┘
                                         ▲
                                         │ implements
                            ┌────────────┴─────────────┐
                            │  adapters/persistence    │  ← Prisma adapters
                            │  *.prisma.repository.ts  │
                            │  *.mapper.ts             │
                            └──────────────────────────┘
```

**Boundary rules:**
- `domain/` imports nothing else from the module — pure types, no I/O.
- `application/` depends on `domain/` and on its own ports — never on adapters.
- `adapters/` depend on `application/ports/` (to know what to implement) and `domain/` (to translate types). The Prisma adapter is **invisible** to use cases at compile time.
- Cross-module access goes through another module's published surface (`domain/*.types.ts` and `application/ports/*.port.ts`). A module never reaches into another module's `adapters/` or internal use cases.

## Five design patterns

| Pattern    | Where to look                                                                                                                                                           |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Singleton  | [`Config`](./src/config/config.ts), [`Logger`](./src/infrastructure/logger/logger.ts), [`PrismaService`](./src/infrastructure/database/prisma.service.ts), [`FeatureFlagService`](./src/shared/feature-flags/feature-flag.service.ts) — each has a private constructor + `getInstance()` + `resetForTesting()`. |
| Repository (Port + Adapter) | Port: [`IChatRepository`](./src/modules/chat/application/ports/chat.repository.port.ts) + [`IMessageRepository`](./src/modules/chat/application/ports/message.repository.port.ts). Adapters: [`ChatPrismaRepository`](./src/modules/chat/adapters/persistence/chat.prisma.repository.ts) + [`chat.mapper.ts`](./src/modules/chat/adapters/persistence/chat.mapper.ts). Tests swap in [`InMemoryChatRepository`](./tests/helpers/in-memory-repositories.ts). |
| Use Case   | One `IUseCase<TInput, TOutput>` class per HTTP endpoint, e.g. [`ListChatsUseCase`](./src/modules/chat/application/use-cases/list-chats.use-case.ts), [`RunCompletionUseCase`](./src/modules/chat/application/use-cases/run-completion.use-case.ts). Use cases share cross-cutting domain rules via [`ChatAccessPolicy`](./src/modules/chat/application/policies/chat-access.policy.ts) + [`MessagePersistencePolicy`](./src/modules/chat/application/policies/message-persistence.policy.ts). Throws `AppError` subclasses; controller never builds error responses by hand. |
| DI         | [`src/di/wire-app.ts`](./src/di/wire-app.ts) is the **only** file that calls `new` on use cases, policies, controllers, and routers — shared by prod ([`container.ts`](./src/di/container.ts)) and tests ([`build-test-app.ts`](./tests/helpers/build-test-app.ts)) so the dependency graph is identical. |
| Strategy   | [`CompletionStrategyFactory`](./src/modules/chat/application/strategies/completion-strategy.factory.ts) → `Streaming` vs `Json` (driven by `STREAMING_ENABLED`); [`HistoryStrategyFactory`](./src/modules/chat/application/strategies/history-strategy.factory.ts) → `Full` vs `Limited` (driven by `CHAT_HISTORY_ENABLED`). Use cases stay branch-free. |

If you find yourself writing `if (flag) doA() else doB()` in a controller or use case, that violates Open/Closed. Lift the branch into a Strategy + Factory.

## Use Case Bag pattern (controller dependency)

A controller depends on a typed grouping of `IUseCase` references — one entry per HTTP endpoint — instead of a multi-method service class. This satisfies ISP perfectly: the controller is bound to N single-method interfaces, not one god class.

```ts
// modules/chat/application/use-cases/chat.use-cases.ts
export interface ChatUseCases {
  listChats:     IUseCase<ListChatsInput, PageResult<Chat>>;
  createChat:    IUseCase<CreateChatInput, Chat>;
  deleteChat:    IUseCase<DeleteChatInput, void>;
  getHistory:    IUseCase<GetChatHistoryInput, PageResult<Message>>;
  runCompletion: IUseCase<RunCompletionInput, CompletionResult>;
  // ... 9 entries total for the chat module
}

// modules/chat/adapters/http/chat.controller.ts
export class ChatController {
  constructor(private readonly useCases: ChatUseCases) {}

  public listChats = async (req, res): Promise<void> => {
    const result = await this.useCases.listChats.execute({ ... });
    res.status(200).json(result);
  };
}
```

The bag is a passive type — `wireApp` constructs each concrete use case and assembles them into this shape. Adding a new endpoint is a 4-step flow:
1. Write `<verb>-<noun>.use-case.ts` exporting a class implementing `IUseCase`.
2. Add it to the bag interface.
3. Wire it in `wireApp`.
4. Add a controller method + route.

## Feature-flag flow

`flag → factory → strategy`. Six core flags ship today: `STREAMING_ENABLED`, `PAGINATION_LIMIT`, `AI_TOOLS_ENABLED`, `CHAT_HISTORY_ENABLED`, `RATE_LIMIT_PER_MINUTE`, `COMPLETION_ENABLED` (the last is a kill-switch enforced at the route layer by [`featureFlagGuard`](./src/shared/middleware/feature-flag-guard.ts) — 404 + `FEATURE_DISABLED` when off). Per-tool flags (`TOOL_*_ENABLED`) are derived from each tool's own `flag` spec at registry-load time, so adding a tool doesn't touch the flag types.

Sources, in priority order:
1. DB overrides via the admin UI (`feature_flag_overrides` table).
2. JSON file at `FEATURE_FLAGS_FILE` (live-reloadable).
3. Code defaults (with role/clientType rules baked in).

`SIGHUP` (or `POST /admin/flags/reload`) triggers `flags.reload()` and emits a structured `feature_flags_reloaded` log line with the diff. `GET /healthz` returns the live snapshot for frontends and ops dashboards.

## SSE pipeline

```
chat.controller.completion
  → ChatUseCases.runCompletion.execute()
    → ChatAccessPolicy.ensureOwnership(...)         (404 on cross-user)
    → MessagePersistencePolicy.buildModelHistory()  (last-N for context)
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

App Check → Auth (JWT) → Client type → per-route validate + rate-limit + feature-flag-guard → routes → `/docs` → notFound → errorHandler. Public auth routes (`/api/auth/register`, `/api/auth/login`) mount before the global JWT requirement; everything else after. `clientTypeMiddleware` rebinds `req.log` so every downstream log line carries the client type, and the completion route keys its rate-limit bucket on `(user, clientType)` so a user's mobile and web sessions don't share quota. All middleware factories receive their config via DI — no `Logger.getInstance()` / `Config.getInstance()` reaches into the request hot path.

## AI tools (plug-in registry)

Each tool is a single file in [`src/infrastructure/ai/tools/`](./src/infrastructure/ai/tools/) declaring its own `flag` spec. The registry derives `TOOL_GATE_FLAGS` and the per-tool flag defaults at load time, so **adding a new tool is a 2-file change**: write `<name>.tool.ts`, append it to `ALL_TOOLS` in [`registry.ts`](./src/infrastructure/ai/tools/registry.ts). No edits to `flag-defaults.ts`, `feature-flag.types.ts`, or any provider — every provider (Anthropic, Groq, OpenAI, Mock) reads the registry. Tool execution receives a `ToolContext { logger, signal }` so per-request observability and cancellation flow into tool implementations.

## Where to read next

- [`CLAUDE.md`](./CLAUDE.md) — exhaustive coding standards, forbidden patterns, lifecycle order, naming conventions.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Vercel + Neon + GitHub Actions free-tier deploy.
- [`README.md`](./README.md) — local quickstart, smoke tests, demo URLs, full feature flag + tool tables.
