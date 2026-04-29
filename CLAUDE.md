# CLAUDE.md — AppNation AI Chat Backend

This file is the **single source of truth** for how this project must be built. Every contributor (human or AI) must follow it. When in doubt, this document overrides preference.

---

## 1. Project Overview

We are building an **AI-powered chat backend** that serves multiple user segments (enterprise, startup, individual). The product team needs to enable/disable features at **runtime, without redeployment**, to A/B test, control cost, and roll back broken features fast.

### Core endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/chats` | Paginated list of the authenticated user's chats |
| `GET`  | `/api/chats/:chatId/history` | Messages of a specific chat (full or limited by flag) |
| `POST` | `/api/chats/:chatId/completion` | AI completion — streams via SSE or returns JSON, by flag |

### Why this matters (evaluation weights)

- **Implementation Quality — 50%**: design patterns, middleware ordering, feature flagging, code organization, TypeScript discipline.
- **Functionality — 30%**: 3 endpoints work, multi-client support, SSE streaming, error handling.
- **Best Practices — 20%**: config, structured logging, DB lifecycle, security, tests.

Optimize for **visible, well-named patterns** over cleverness. A reviewer must see DI, Service, Repository, Singleton, Strategy at a glance.

---

## 2. Tech Stack & Versions

| Concern | Choice | Version |
|---|---|---|
| Runtime | Node.js | `>= 20.11` |
| Language | TypeScript (strict) | `>= 5.4` |
| HTTP framework | Express | `^4.19` |
| ORM | Prisma | `^5.x` |
| Database | PostgreSQL | `16` |
| Validation | `zod` | `^3.x` |
| Logger | `pino` (+ `pino-http`, `pino-pretty` dev) | `^9.x` |
| Auth (mock) | `jsonwebtoken` | `^9.x` |
| AI — prime | `@anthropic-ai/sdk` (Claude Sonnet 4.6, direct Anthropic API) | `^0.30` |
| AI — fast | `@ai-sdk/openai` pointed at Groq (`openai/gpt-oss-120b`) | latest |
| AI — extra | `@ai-sdk/openai` (OpenAI, also supported) | latest |
| Tests | `vitest` + `supertest` | latest |
| Package manager | `pnpm` | `>= 9` |

**Rule**: When adding a dependency, prefer one already in this list. New deps require justification in the PR description.

`dotenv` is loaded **only once** at the top of `src/server.ts` (and inside `vitest.config.ts`). Nowhere else.

---

## 3. Architecture & Folder Structure

Layered + DDD-lite. Feature modules under `modules/`, cross-cutting under `infrastructure/` and `shared/`, composition root in `di/`.

```
src/
├── app.ts                          # Express app wiring (no listen())
├── server.ts                       # bootstrap + lifecycle (entry)
├── config/
│   ├── config.ts                   # Config singleton
│   └── env.schema.ts               # zod schema for process.env
├── infrastructure/
│   ├── database/
│   │   └── prisma.service.ts       # PrismaService singleton
│   ├── logger/
│   │   └── logger.ts               # Logger singleton (pino)
│   └── ai/
│       ├── ai.provider.ts          # IAiProvider interface
│       ├── anthropic.provider.ts   # Claude Sonnet 4.6 (prime, direct Anthropic SDK)
│       ├── groq.provider.ts        # Groq gpt-oss-120b (fast, OpenAI-compatible)
│       ├── openai.provider.ts      # OpenAI (also supported)
│       ├── fallback.provider.ts    # composite: primary -> secondary
│       └── mock.provider.ts        # deterministic fallback when no keys
├── shared/
│   ├── errors/
│   │   ├── app-error.ts            # AppError base + subclasses
│   │   └── error-handler.ts        # express error middleware
│   ├── middleware/
│   │   ├── request-logger.ts
│   │   ├── app-check.ts            # Firebase mock
│   │   ├── auth.ts                 # JWT mock
│   │   ├── client-type.ts
│   │   ├── validate-request.ts     # zod-based
│   │   ├── feature-flag-guard.ts
│   │   └── rate-limit.ts           # in-memory token bucket
│   ├── feature-flags/
│   │   ├── feature-flag.service.ts # Singleton
│   │   ├── feature-flag.types.ts
│   │   └── strategy.ts             # IStrategy<TIn,TOut> + StrategyFactory base
│   ├── rate-limit/
│   │   ├── rate-limit.types.ts     # IRateLimitStore + RateLimitDecision
│   │   ├── in-memory.store.ts      # single-instance default
│   │   └── redis.store.ts          # multi-instance, structural Redis client
│   ├── openapi/
│   │   ├── zod.ts                  # extendZodWithOpenApi side-effect
│   │   ├── registry.ts             # OpenAPIRegistry singleton
│   │   ├── security.ts             # security schemes + ErrorResponse + paged helper
│   │   ├── build-spec.ts           # OpenApiGeneratorV31 -> OpenAPI 3.1 doc
│   │   └── docs.middleware.ts      # mountDocs → /docs.json + /docs (Swagger UI)
│   ├── pagination/
│   │   └── cursor.ts               # encode/decode cursor helpers
│   ├── types/
│   │   └── express.d.ts            # Request augmentation (user, requestId, clientType)
│   └── constants.ts                # business constants (NOT env-based)
├── modules/
│   ├── chat/
│   │   ├── chat.controller.ts
│   │   ├── chat.service.ts
│   │   ├── chat.repository.ts
│   │   ├── chat.repository.interface.ts
│   │   ├── chat.routes.ts
│   │   ├── chat.dto.ts             # zod schemas + inferred types
│   │   ├── chat.mapper.ts          # Prisma <-> domain mapping
│   │   ├── chat.openapi.ts         # OpenAPI registration (paths + schemas)
│   │   └── strategies/
│   │       ├── completion.strategy.ts        # IStrategy interface
│   │       ├── streaming-completion.strategy.ts
│   │       ├── json-completion.strategy.ts
│   │       ├── completion-strategy.factory.ts
│   │       ├── history.strategy.ts           # full-history | limited-history
│   │       └── history-strategy.factory.ts
│   └── user/
│       ├── user.repository.ts
│       └── user.repository.interface.ts
└── di/
    └── container.ts                # composition root (manual DI)
prisma/
├── schema.prisma
└── migrations/
tests/
├── unit/
├── integration/
└── helpers/
api/
└── index.ts                        # Vercel serverless entry (wraps Express app)
.github/
└── workflows/
    ├── ci.yml                      # PR + push gate (typecheck/lint/tests/build)
    └── deploy.yml                  # push-to-main: migrate + Vercel deploy
.env.example
docker-compose.yml
Dockerfile
README.md
```

**Boundary rules** (enforced by review):
- `controller → service → repository → prisma`. Imports never go backwards.
- `modules/<X>/` may not import from `modules/<Y>/repository`. It may consume `<Y>`'s service if absolutely necessary, but prefer keeping modules independent.
- `infrastructure/` and `shared/` may be imported by any module. Modules may not import each other's internals.
- The composition root (`di/container.ts`) is the **only place** that knows concrete classes. Everything else depends on interfaces.

---

## 4. Coding Standards (Clean Code)

### TypeScript

- `tsconfig.json` MUST include:
  ```json
  {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler"
  }
  ```
- **No `any`**. Use `unknown` and narrow.
- **No non-null assertion (`!`)** outside of test setup.
- **No default exports.** Named exports only — they survive renames cleanly.
- **No barrel files** (`index.ts` re-exports). Direct imports only — they keep the dep graph honest.

### Naming

| Kind | Convention | Example |
|---|---|---|
| Class | `PascalCase` | `ChatService` |
| Interface | `IPascalCase` | `IChatRepository` |
| Function / variable | `camelCase` | `listUserChats` |
| Constant | `SCREAMING_SNAKE_CASE` | `DEFAULT_PAGINATION_LIMIT` |
| File | `kebab-case` | `chat.service.ts` |
| Type alias | `PascalCase` | `ChatListResult` |
| Generic param | `T`, `TIn`, `TOut` | `IStrategy<TIn, TOut>` |

### Functions & files

- **Function ≤ 30 lines.** If longer, extract.
- **File ≤ 200 lines.** Hard cap 300.
- **One public class per file.** Helpers in same file are fine if private.
- **Pure functions whenever possible.** Side effects belong at infrastructure boundary (DB, HTTP, logger).
- **Early return** over nested `if`. No more than 2 levels of nesting in any function.
- **Boolean parameters are forbidden** in public APIs — they read poorly at call site. Use enum/option object.

### Comments

- Default: **no comment**. Code should be self-documenting.
- Write a comment **only** to explain *why* something non-obvious is the way it is (a constraint, a workaround, a non-trivial invariant).
- **Never** describe *what* the code does — that's what names are for.
- **Never** mention the task, ticket, or author — that belongs in the commit message.
- TODOs MUST include an owner: `// TODO(beyza): ...`

### Imports

- Order: (1) node builtins, (2) external packages, (3) internal absolute (`@/...`), (4) relative.
- Blank line between groups.
- ESLint `import/order` enforces this.

---

## 5. SOLID Principles — Concrete Application

| Principle | Rule for this project |
|---|---|
| **SRP** — Single Responsibility | Controller speaks HTTP. Service holds business logic. Repository talks to the DB. **A controller never imports `prisma`.** A service never imports `req`/`res`. |
| **OCP** — Open/Closed | Adding a new feature flag adds a new Strategy + a factory entry. **You do not modify existing strategies.** |
| **LSP** — Liskov Substitution | Repositories are programmed against `IChatRepository`. The Prisma implementation and an in-memory test impl must be swappable without changing the service. |
| **ISP** — Interface Segregation | No god `IChatService` containing 20 methods. Split per use case (`IListChats`, `ISendMessage`) when they grow. Start small; segregate when interfaces drift apart. |
| **DIP** — Dependency Inversion | Services depend on **interfaces** declared in their own module (`chat.repository.interface.ts`), not on concrete classes. Concrete wiring lives only in `di/container.ts`. |

If you find yourself writing `if (flag) doA() else doB()` in a service or controller — that violates OCP. Lift the branching into a Strategy + Factory.

---

## 6. Clean Architecture Rules

1. **Dependency direction**: `presentation (controller) → application (service) → infrastructure (repository → prisma)`. Never reversed.
2. **Domain types are owned by the module**, not by Prisma. Repository methods return `Chat` (domain) not `PrismaChat`. The mapping happens in `<module>.mapper.ts`.
3. **`shared/` is dependency-free** — it does not import `modules/` or `infrastructure/`. (It may use `infrastructure/logger` because the logger is a primitive.)
4. **`infrastructure/` is dependency-free of `modules/`**. It exposes interfaces and primitive services.
5. **Cross-module access only through services.** A chat service may call a user service if needed; it must never reach into another module's repository.
6. **No framework leakage**: Express types (`Request`, `Response`) live only in `controller.ts` and `middleware/`. They never appear in `service.ts` or `repository.ts`.

---

## 7. Design Patterns (MANDATORY — case requires all five)

Every pattern below is a **graded requirement**. The reviewer will look for them. Don't hide them.

### 7.1 Singleton

Singletons in this project (each is its own file, each exposes `getInstance()`):

- `Config` — `src/config/config.ts`
- `Logger` — `src/infrastructure/logger/logger.ts`
- `PrismaService` — `src/infrastructure/database/prisma.service.ts`
- `FeatureFlagService` — `src/shared/feature-flags/feature-flag.service.ts`

**Implementation rule**:

```ts
export class Config {
  private static instance: Config | null = null;
  private constructor(private readonly values: AppConfig) {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config(loadAndValidate(process.env));
    }
    return Config.instance;
  }

  /** Test-only. Do not call from production code. */
  public static resetForTesting(): void {
    Config.instance = null;
  }
}
```

- `private constructor` prevents external `new`.
- `getInstance()` is lazy.
- `resetForTesting()` exists **only** because tests need isolation. It is never called outside `tests/`.

### 7.2 Repository Pattern

```ts
// modules/chat/chat.repository.interface.ts
export interface IChatRepository {
  findByUser(userId: string, params: ListParams): Promise<Chat[]>;
  findByIdForUser(chatId: string, userId: string): Promise<Chat | null>;
  countByUser(userId: string): Promise<number>;
}

// modules/chat/chat.repository.ts
export class ChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string, { cursor, limit }: ListParams): Promise<Chat[]> {
    const rows = await this.prisma.client.chat.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomainChat);
  }
  // ...
}
```

- Constructor injection of `PrismaService`. Never `new PrismaClient()` inside.
- Returns **domain types**, mapped in `chat.mapper.ts`.
- Repository is **stateless** beyond its dependencies. No per-request data.

### 7.3 Service Pattern

```ts
export class ChatService {
  constructor(
    private readonly chatRepo: IChatRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly flags: FeatureFlagService,
    private readonly logger: Logger,
  ) {}

  async listChats(userId: string, input: ListChatsInput): Promise<ListChatsResult> {
    const limit = clamp(input.limit ?? this.flags.get('PAGINATION_LIMIT'), 10, 100);
    const rows = await this.chatRepo.findByUser(userId, { cursor: input.cursor, limit });
    return buildPagedResult(rows, limit);
  }
}
```

- **No HTTP types** in the service signature. No `req`, no `res`, no status codes.
- Business rules (clamping, ownership checks, transaction composition) live here.
- Service throws `AppError` subclasses; the controller never builds error responses by hand.

### 7.4 Dependency Injection (Manual)

The composition root `src/di/container.ts` is the **only** file that calls `new` on services and repositories.

```ts
export interface AppContainer {
  chatController: ChatController;
  // ...
}

export function buildContainer(): AppContainer {
  const config = Config.getInstance();
  const logger = Logger.getInstance();
  const prisma = PrismaService.getInstance();
  const flags = FeatureFlagService.getInstance();

  // AI providers: prime = Anthropic (Claude Sonnet 4.6), fast = Fallback(Groq -> Anthropic).
  // Chat completion uses `prime`. Tool/analysis paths use `fast`.
  const prime = buildPrimeProvider(builders, logger);
  const fast = buildFastProvider(builders, logger);

  const chatRepo = new ChatRepository(prisma);
  const messageRepo = new MessageRepository(prisma);

  const completionFactory = new CompletionStrategyFactory(flags, aiProvider, messageRepo, logger);
  const historyFactory = new HistoryStrategyFactory(flags, messageRepo);

  const chatService = new ChatService(chatRepo, messageRepo, flags, logger);
  const completionService = new CompletionService(chatRepo, completionFactory, logger);
  const historyService = new HistoryService(chatRepo, historyFactory);

  const chatController = new ChatController(chatService, completionService, historyService);

  return { chatController };
}
```

- Tests build their **own** container with mocks. Never reuse the production container in tests.
- Routes import the controller from the container, not directly from the module.

### 7.4.b AI Provider Wiring (architecture rule)

The chat completion endpoint speaks to AI through `IAiProvider`. Three concrete implementations are supported, plus a composite:

| Role | Class | Default model | When used |
|---|---|---|---|
| **Prime** | `AnthropicProvider` (direct `@anthropic-ai/sdk`) | `claude-sonnet-4-6` | Main agent responses + supervisor |
| **Fast** | `GroqProvider` (Vercel AI SDK pointed at Groq) | `openai/gpt-oss-120b` | Fast routing / tool-agent analysis |
| **Extra** | `OpenAiProvider` (Vercel AI SDK + OpenAI) | `gpt-4o-mini` | Additional supported alternative |
| **Composite** | `FallbackAiProvider` | n/a | Wraps two providers — primary first, secondary on failure |
| **Mock** | `MockAiProvider` | deterministic | When no API keys are set |

Container exposes two named providers:
- `ai.prime` → used by `CompletionStrategyFactory` (chat completion endpoint). Selection priority: Anthropic → OpenAI → Groq → Mock.
- `ai.fast` → exposed for tool-agent / analysis code paths. When both Groq and Anthropic keys are set, it is `FallbackAiProvider(Groq, Anthropic)` — try Groq first, fall back to Anthropic on failure (matching the spec for tool agent analysis/summary calls).

**Streaming fallback rule**: `FallbackAiProvider` only switches providers if the primary fails *before* emitting the first token. Once bytes are on the wire, errors propagate — clients have already received content; mid-stream provider switch would corrupt the response.

**Anthropic real-time tool streaming**: `AnthropicProvider.stream` watches the raw SDK event stream — `content_block_start` detects `tool_use` blocks, `content_block_delta` (`input_json_delta`) accumulates the arguments, and `content_block_stop` triggers immediate tool execution + a `tool_execution` SSE event. Only after the tool fires do we open the follow-up stream that carries the model's textual response, so clients see the tool result *before* the explanatory text.

### 7.5 Strategy Pattern (THE pattern reviewers look for)

```ts
// shared/feature-flags/strategy.ts
export interface IStrategy<TIn, TOut> {
  execute(input: TIn): Promise<TOut> | TOut;
}

// modules/chat/strategies/completion.strategy.ts
export interface ICompletionStrategy
  extends IStrategy<CompletionInput, CompletionResult> {}

// modules/chat/strategies/streaming-completion.strategy.ts
export class StreamingCompletionStrategy implements ICompletionStrategy {
  constructor(private readonly ai: IAiProvider, private readonly flags: FeatureFlagService) {}

  async execute(input: CompletionInput): Promise<CompletionResult> {
    return { kind: 'stream', stream: this.ai.streamCompletion(input) };
  }
}

// modules/chat/strategies/json-completion.strategy.ts
export class JsonCompletionStrategy implements ICompletionStrategy {
  constructor(private readonly ai: IAiProvider) {}

  async execute(input: CompletionInput): Promise<CompletionResult> {
    const text = await this.ai.completeOnce(input);
    return { kind: 'json', message: text };
  }
}

// modules/chat/strategies/completion-strategy.factory.ts
export class CompletionStrategyFactory {
  constructor(
    private readonly flags: FeatureFlagService,
    private readonly ai: IAiProvider,
    private readonly messages: IMessageRepository,
    private readonly logger: Logger,
  ) {}

  build(): ICompletionStrategy {
    return this.flags.get('STREAMING_ENABLED')
      ? new StreamingCompletionStrategy(this.ai, this.flags)
      : new JsonCompletionStrategy(this.ai);
  }
}
```

The controller is then **branch-free**:

```ts
async completion(req: Request, res: Response, next: NextFunction) {
  try {
    const strategy = this.completionFactory.build();
    const result = await strategy.execute({ chatId: req.params.chatId, ... });
    return ResponseSerializer.write(res, result);  // SSE or JSON, decided by `result.kind`
  } catch (e) { next(e); }
}
```

The same pattern applies to `HistoryStrategy` (`FullHistoryStrategy` vs `LimitedHistoryStrategy`) and to the AI tools branch (`WithToolsStrategy` vs `NoToolsStrategy`).

**If you find yourself writing `if (flag)` outside a Factory, stop. Add a Strategy.**

---

## 8. Configuration Management

### Loading

- All env vars are validated by a single `zod` schema in `src/config/env.schema.ts`.
- Parsing happens **once** in `Config.getInstance()`. If validation fails, the process exits with a clear error before the server starts.

```ts
// config/env.schema.ts (excerpt — see source for the full shape)
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  APP_CHECK_TOKEN: z.string().min(8),

  // AI providers (each optional; container picks based on which keys are set)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace']).default('info'),
  CORS_ORIGINS: z.string().default(''),
  // feature flags
  STREAMING_ENABLED: z.coerce.boolean().default(true),
  PAGINATION_LIMIT: z.coerce.number().int().min(10).max(100).default(20),
  AI_TOOLS_ENABLED: z.coerce.boolean().default(false),
  CHAT_HISTORY_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  FEATURE_FLAGS_FILE: z.string().optional(),
});
```

### Access rules

- `Config.getInstance().values.ai.anthropicApiKey` — yes.
- `process.env.ANTHROPIC_API_KEY` outside `config/` — **forbidden**. Lint rule blocks it.
- Sensitive fields (JWT secret, AI provider keys) appear in logs **only** through redaction.

### Layering

| File | Holds |
|---|---|
| `src/config/env.schema.ts` | zod schema for env vars |
| `src/config/config.ts` | Singleton, structured access (`config.app`, `config.db`, `config.ai`) |
| `src/shared/constants.ts` | Business constants that never change between envs (e.g. `LIMITED_HISTORY_COUNT = 10`) |

`.env.example` MUST list every variable from `EnvSchema`, with safe placeholder values, and MUST be committed. `.env` is gitignored.

---

## 9. Database Connection Management

### PrismaService

```ts
export class PrismaService {
  private static instance: PrismaService | null = null;
  public readonly client: PrismaClient;

  private constructor(logger: Logger) {
    this.client = new PrismaClient({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
    this.client.$on('error', (e) => logger.pino.error({ err: e }, 'prisma_error'));
  }

  public static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService(Logger.getInstance());
    }
    return PrismaService.instance;
  }

  public async connect(): Promise<void> { await this.client.$connect(); }
  public async disconnect(): Promise<void> { await this.client.$disconnect(); }
}
```

### Lifecycle (server.ts)

Order is **fixed**:

```
1. Config.getInstance()
2. Logger.getInstance()
3. FeatureFlagService.getInstance()
4. PrismaService.getInstance().connect()
5. buildContainer() → controllers
6. createApp(container) → Express app
7. server.listen(port)
8. Register SIGTERM/SIGINT → graceful shutdown:
     a. server.close()
     b. PrismaService.getInstance().disconnect()
     c. logger.flush()
     d. process.exit(0)
```

### Pool & scalability

- Connection pool tuning via `DATABASE_URL` query string: `?connection_limit=10&pool_timeout=20`.
- For serverless deployments, document the limit value in `README.md` (10 per instance is a sane default for non-serverless).
- **Cursor-based pagination** is the default; offset is forbidden because it scales poorly.
- Indexes that MUST exist:
  - `Chat`: `@@index([userId, createdAt(sort: Desc)])`
  - `Message`: `@@index([chatId, createdAt(sort: Asc)])`
  - `User`: `email @unique`

### Transactions

- Service composes transactions: `prisma.$transaction(async (tx) => ...)`.
- Repositories accept an optional `tx?: Prisma.TransactionClient` parameter so they can participate in a service-level transaction.
- A repository never starts its own transaction.

---

## 10. Logging Strategy

- Library: `pino`. JSON in prod, `pino-pretty` in dev.
- Levels in use: `fatal | error | warn | info | debug | trace`. Default `info`. `debug` disabled in prod.
- **`console.log` is forbidden.** Lint rule enforced. Use `Logger.getInstance().pino.info(...)`.
- **Structured logging only**: `logger.info({ chatId, userId }, 'chat_listed')`. The first arg is the object, the second is the message — pino convention.
- Every HTTP request gets a `requestId` (uuid v4) attached in `request-logger.ts`. The middleware creates a child logger and assigns it to `req.log`. Downstream code uses `req.log` so logs include `requestId`.
- **Redaction**: `pino`'s `redact` config strips `req.headers.authorization`, `req.headers["x-firebase-app-check"]`, `password`, `token`, `apiKey`.
- Initialization order (repeated for emphasis): **Config → Logger → FeatureFlagService → PrismaService → DI Container → Express → listen**. Never instantiate Logger before Config; Logger needs `LOG_LEVEL`.

---

## 11. Middleware Architecture (PDF order is mandatory)

### Global middleware (in `app.ts`, in this exact order)

```ts
app.use(requestLogger);              // 1. requestId + child logger
app.use(helmet());                    // security headers
app.use(express.json({ limit: '1mb' }));
app.use(cors(corsOptions));
app.use(appCheckMiddleware);          // 2. Firebase mock — verify x-firebase-app-check
app.use(authMiddleware);              // 3. JWT — populates req.user
app.use(clientTypeMiddleware);        // 4. x-client-type → req.clientType
app.use('/api', router);              // 5. routes
app.use(notFoundHandler);
app.use(errorHandler);                // 6. last — terminates the chain
```

### Route-specific middleware (per the case's "Important Note")

These are **not** mounted globally. They are attached per route:

- `validateRequest({ body?, query?, params? })` — zod-based, throws `ValidationError`.
- `featureFlagGuard('FLAG_NAME')` — short-circuits with 404 if the flag is off (404 not 403, so the feature's existence is not leaked).
- `rateLimitPerRoute({ store, keyBy, limit?, windowMs? })` — pluggable store (`InMemoryRateLimitStore` for single-instance, `RedisRateLimitStore` for multi-instance), limit defaults to `RATE_LIMIT_PER_MINUTE` flag, headers `X-RateLimit-*` set. The composition root picks the store: `REDIS_URL` set → Redis, otherwise in-memory.

Example:

```ts
router.post(
  '/chats/:chatId/completion',
  validateRequest({ params: chatIdParamSchema, body: completionBodySchema }),
  rateLimitPerRoute({ keyBy: 'user' }),
  (req, res, next) => container.chatController.completion(req, res, next),
);
```

### Auth & client-type contracts

After `authMiddleware`, `req.user` is `{ id, email }`. If JWT is missing/invalid → `UnauthorizedError`.
After `clientTypeMiddleware`, `req.clientType` is `'web' | 'mobile' | 'desktop'`. Default to `'web'` if header absent.

These augmentations live in `src/shared/types/express.d.ts`:

```ts
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: pino.Logger;
      user?: AuthUser;
      clientType: ClientType;
    }
  }
}
```

---

## 12. Feature Flagging System (KEY REQUIREMENT)

### Required flags

| Flag | Type | Default | Effect |
|---|---|---|---|
| `STREAMING_ENABLED` | bool | `true` | `true` → SSE; `false` → JSON |
| `PAGINATION_LIMIT` | number | `20` | Max items per page in chat list (clamped 10–100) |
| `AI_TOOLS_ENABLED` | bool | `false` | `true` → mocked tools available to the AI |
| `CHAT_HISTORY_ENABLED` | bool | `true` | `false` → return only last 10 messages |
| `RATE_LIMIT_PER_MINUTE` | number | `60` | Per-user rate limit ceiling |

### Service contract

```ts
type FlagValue = boolean | number | string;

export class FeatureFlagService {
  private flags: Map<string, FlagValue>;

  public get<T extends FlagValue>(name: string, fallback?: T): T { ... }
  public set<T extends FlagValue>(name: string, value: T): void { ... }   // for tests + admin
  public reload(): Promise<void> { ... }                                   // re-read sources
  public snapshot(): Record<string, FlagValue> { ... }                     // for /healthz/flags
}
```

### Sources, in priority order

1. **JSON file** if `FEATURE_FLAGS_FILE` is set (live-reloadable).
2. **Environment variables** parsed into `Config`.
3. **Code defaults** (the table above).

### Hot reload (no redeploy)

- On `SIGHUP`: re-read the JSON file and `process.env` (env can also be re-evaluated if reloaded by the orchestrator). Log the diff: `{ changed: ['STREAMING_ENABLED'], from: true, to: false }`.
- Optional: a guarded `POST /admin/flags/reload` route gated by an `X-Admin-Token` header (out of case scope; document but skip unless asked).
- Each request reads flags fresh — no per-request caching of flag state.

### Strategy connection

- A flag never directly drives a branch in a service or controller.
- Pattern: **flag → factory → strategy**. The factory consults the flag and returns the right strategy instance. The caller stays branch-free.

### Adding a new flag (the rule of two changes)

1. Add the field to `EnvSchema` and (if applicable) to the JSON schema.
2. Write the new Strategy + add it to the relevant Factory.

That's it. **You do not modify existing strategies, services, or controllers.** If you do, OCP is violated.

---

## 13. Endpoint Specifications

### `GET /api/chats`

- **Middleware**: global chain + `validateRequest({ query: listChatsQuery })` + `rateLimitPerRoute`.
- **Query**: `cursor?: string`, `limit?: number` (clamped to `[10, PAGINATION_LIMIT]`, default `PAGINATION_LIMIT`).
- **Response 200**:
  ```json
  {
    "data": [{ "id": "...", "title": "...", "createdAt": "...", "updatedAt": "..." }],
    "pagination": { "nextCursor": "...", "hasMore": true, "limit": 20 }
  }
  ```
- **Errors**: 401 (no/invalid JWT), 429 (rate limit).

### `GET /api/chats/:chatId/history`

- **Middleware**: global + `validateRequest({ params: chatIdParam, query: historyQuery })` + `rateLimitPerRoute`.
- **Ownership**: enforced in the service. If `chat.userId !== req.user.id` → **404 NotFoundError** (not 403 — do not leak existence).
- **Behavior**:
  - `CHAT_HISTORY_ENABLED=true` → all messages, paginated by cursor.
  - `CHAT_HISTORY_ENABLED=false` → last `LIMITED_HISTORY_COUNT` (default 10) messages, no pagination.
- **Response 200**:
  ```json
  { "data": [{ "id": "...", "role": "user|assistant", "content": "...", "createdAt": "..." }],
    "pagination": { "nextCursor": "...", "hasMore": false, "limit": 50 } }
  ```

### `POST /api/chats/:chatId/completion`

- **Middleware**: global + `validateRequest({ params: chatIdParam, body: completionBody })` + `rateLimitPerRoute`.
- **Ownership**: same 404 rule as above.
- **Behavior**:
  - `STREAMING_ENABLED=true` → **SSE** (`Content-Type: text/event-stream`). Events:
    - `event: thinking` — once at start.
    - `event: tool_execution` — only if `AI_TOOLS_ENABLED=true` and a tool ran. `data: { tool, args, result }`.
    - `event: delta` — repeated. `data: { text: "..." }`.
    - `event: done` — once at the end. `data: { messageId, usage? }`.
  - `STREAMING_ENABLED=false` → JSON `{ message: { id, role: 'assistant', content }, usage? }`.
- **Persistence** (in a transaction): write the user message → run AI (stream chunks to client and accumulate locally) → write the assistant message with the final content.
- **Cancellation**: if the client disconnects mid-stream (`req.on('close')`), abort the upstream AI call and persist whatever was generated so far.

---

## 14. Error Handling

### AppError hierarchy

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) { super(message); }
}

export class ValidationError   extends AppError { constructor(d?: unknown) { super('VALIDATION_ERROR',   400, 'Invalid input', d); } }
export class UnauthorizedError extends AppError { constructor(m='Unauthorized') { super('UNAUTHORIZED',   401, m); } }
export class ForbiddenError    extends AppError { constructor(m='Forbidden')   { super('FORBIDDEN',       403, m); } }
export class NotFoundError     extends AppError { constructor(m='Not found')   { super('NOT_FOUND',       404, m); } }
export class RateLimitError    extends AppError { constructor()                { super('RATE_LIMITED',    429, 'Too many requests'); } }
export class FeatureDisabledError extends AppError { constructor(f: string)    { super('FEATURE_DISABLED',404, `Feature '${f}' disabled`); } }
```

### errorHandler middleware

- `AppError` → `{ error: { code, message, details? }, requestId }` with the corresponding status.
- `ZodError` → 400 + `ValidationError` shape with `issues`.
- Prisma errors:
  - `P2025` (record not found) → `NotFoundError`.
  - `P2002` (unique violation) → 409 conflict.
  - other → 500 (don't expose internals).
- Anything else → 500. Log full stack with `error` level. Response body says `"Internal server error"` only.

### Response shape (consistent across all errors)

```json
{ "error": { "code": "NOT_FOUND", "message": "Chat not found" }, "requestId": "..." }
```

In `production`, stack traces are **never** in the response. In `development`, include `stack` for diagnosis.

---

## 15. Security Practices

- `helmet()` mandatory.
- CORS: explicit origin allowlist from `CORS_ORIGINS` (comma-separated). Never `*`.
- Body size: `express.json({ limit: '1mb' })`.
- JWT: `JWT_SECRET` ≥ 32 chars (zod-enforced). Mock tokens for the case study are fine; the validation pipeline (verify, decode, attach `req.user`) must be real.
- App Check: header `x-firebase-app-check` must equal `Config.app.appCheckToken`. Mock acceptable.
- Rate limiting: per route, per user (fall back to IP if no user). Backend store is pluggable — `InMemoryRateLimitStore` for single-process deployments, `RedisRateLimitStore` (using `ioredis`) for horizontally-scaled production. DI selects based on `REDIS_URL`. Both implement the same `IRateLimitStore` interface — swap is a one-line change at the composition root, no middleware refactor.
- Prisma is parametrized — do not use `$queryRawUnsafe`. If raw SQL is required, use `$queryRaw` tagged template (parametrized).
- Logger redaction list (see §10).
- `.env` MUST be in `.gitignore`. `.env.example` MUST be committed.
- Disable `x-powered-by` (helmet does this).

---

## 16. Testing Strategy

### Layout

```
tests/
├── unit/
│   ├── chat.service.test.ts
│   ├── completion-strategy.factory.test.ts
│   └── feature-flag.service.test.ts
├── integration/
│   ├── chats.e2e.test.ts            # supertest against the Express app
│   └── completion.e2e.test.ts       # SSE + JSON branches
└── helpers/
    ├── build-test-container.ts       # mock container
    └── reset-singletons.ts           # Config/Logger/Flags reset
```

### Rules

- **Unit tests** mock repositories with hand-written fakes that implement the interface. Do not mock `IChatRepository` with Jest auto-mock — write a small `InMemoryChatRepository`.
- **Integration tests** use `supertest` against `createApp(testContainer)`. The DB is either the same Postgres with a transaction-rollback wrapper, or a separate `db-test` service in `docker-compose.yml`.
- **Coverage targets**: services ≥ 80%, strategies = 100%, error handler = 100%.
- **Naming**: `describe('ChatService.listChats')` → `it('clamps limit to PAGINATION_LIMIT')`.
- **Per-test isolation**: each test calls `resetSingletons()` in `beforeEach`.
- **Feature flag combinatorics**: every flag is tested in both `true` and `false` states. `STREAMING_ENABLED` is tested for both SSE and JSON.

### What we do NOT mock

- The `FeatureFlagService` is not mocked; we use the real one and `set()` values per test.
- The error handler is exercised end-to-end (`it('returns 404 with NOT_FOUND code on missing chat')`).

---

## 17. Docker & Deployment

### Dockerfile (multi-stage)

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build && pnpm prune --prod

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### docker-compose.yml — profiles

Three named profiles isolate the use cases (compose evaluates only the services that match the active profile):

| Profile | Services | What it gives you |
|---|---|---|
| `dev` | `db`, `api-dev`, `web-dev` | Both Node services run with hot reload (`tsx watch` / `vite --host`). Source folders are bind-mounted; `node_modules` lives inside named volumes so host vs. container OS binaries don't collide. |
| `prod` | `db`, `api` | The compiled runtime image (`Dockerfile` target `runtime`), with the entrypoint running `prisma migrate deploy` before starting. |
| `test` | `db-test` (port 5433) | Dedicated Postgres for the integration suite. |

`Dockerfile` is multi-stage: `deps → dev → build → runtime`. The `dev` target installs all deps and launches `pnpm dev:api`; the `runtime` target is the prod image (non-root user, tini entrypoint, `pnpm prune --prod`-trimmed `node_modules`).

### `.dockerignore`

```
node_modules
.git
.env
.env.*
dist
coverage
tests
*.log
```

---

## 17.1 Make targets (top-level orchestration)

The repo ships a `Makefile` so you don't have to remember pnpm script names. Run `make help` for the full menu. The most useful entries:

| Target | What it does |
|---|---|
| `make install` | Install backend + frontend deps and the husky hooks (`prepare`). |
| `make dev` | Start backend + frontend together with hot reload (`concurrently -n api,web`). |
| `make dev-api` / `make dev-web` | Start only one side. |
| `make build` | Build backend (`tsc`) + frontend (`vite build`). |
| `make verify` | typecheck + lint + tests + `prisma:check` (DB-less). The pre-push gate. |
| `make migrate ARGS="--name add_x"` | Create + apply a dev migration. |
| `make migrate-deploy` | Apply migrations against `DATABASE_URL` (prod-style). |
| `make migrate-check` | DB-less schema validation (`prisma validate` + `format --check`). |
| `make migrate-shadow-check` | Real drift detection — spins up a throwaway Postgres container, runs `prisma migrate diff` with `--shadow-database-url`, tears down. Slower; needs Docker. |
| `make migrate-status` | `prisma migrate status` against the configured DB. |
| `make docker-dev` / `make docker-prod` / `make docker-test` | Bring up the corresponding compose profile. |
| `make db-up` / `make db-reset` | Local Postgres convenience. |
| `make hooks-install` | Re-install husky hooks if you cloned and they didn't auto-attach. |

## 17.2 Git hooks (husky + lint-staged)

- `.husky/pre-commit` runs `lint-staged` — only the staged files go through ESLint+Prettier (Prisma schema is auto-formatted). Sub-second on small commits.
- `.husky/pre-push` runs the heavier gate: backend typecheck, frontend typecheck, both lints, full test suite, and the DB-less Prisma schema check. The deeper drift check (`make migrate-shadow-check`) is opt-in because it needs Docker.
- The `prepare` script in `package.json` re-installs hooks on `pnpm install`. If the hooks fail to attach (e.g. you cloned before `git init` ran), `make hooks-install` re-runs `husky`.
- The `lint-staged` config lives in `package.json#lint-staged` and routes frontend files into the frontend's own ESLint/Prettier (so the right config + plugins apply).

## 17.3 API Documentation (OpenAPI / Swagger)

The API exposes its OpenAPI 3.1 spec from a **single source of truth**: the same zod schemas that already validate requests. There is no parallel YAML to drift.

| URL | What it serves | Auth |
|---|---|---|
| `GET /docs.json` | Raw OpenAPI 3.1 document (JSON) | None — public, gated by `DOCS_ENABLED` |
| `GET /docs` | Swagger UI rendered against `/docs.json` | None — public, gated by `DOCS_ENABLED` |

When `DOCS_ENABLED=false` both routes return **404 NOT_FOUND** (not 401) so it's clear the feature is off, not auth-gated.

### How a new endpoint shows up in the docs

1. Add the route + zod DTO as usual (`chat.dto.ts`, `chat.routes.ts`, etc.).
2. In the module's `*.openapi.ts` file:
   - Call `.openapi('SchemaName', { example: ... })` on the request/response zod schemas.
   - Call `openApiRegistry.registerPath({ method, path, tags, security, request, responses })` for the new route.
3. That's it — `src/app.ts` already side-effect-imports `auth.openapi.ts`, `chat.openapi.ts`, and `healthz.openapi.ts` at module load, so the registry fills before `mountDocs()` reads it.

### Security schemes

Three schemes are declared once in `src/shared/openapi/security.ts` and reused across all paths:
- `bearerAuth` → `Authorization: Bearer <jwt>`
- `appCheckHeader` → `x-firebase-app-check`
- `clientTypeHeader` → `x-client-type`

`AUTHED_SECURITY` (all three) is the default; `PUBLIC_SECURITY` (App Check + clientType only) is used by `register` and `login`.

### Streaming response

`POST /api/chats/:chatId/completion` is the only path with two response variants: `application/json` and `text/event-stream`. Both are documented under `responses['200'].content`. Each SSE event variant (`thinking`, `tool_execution`, `delta`, `done`) is registered as its own component schema so consumers can lint stream payloads.

### Test coverage

`tests/integration/docs.e2e.test.ts` asserts:
- `/docs.json` returns OpenAPI 3.1 with all 7 expected paths and 3 security schemes.
- `/docs` returns Swagger UI HTML.
- With `DOCS_ENABLED=false`, `/docs.json` returns 404 (not 401).

## 17.4 Deployment (Vercel + Neon + GitHub Actions)

Production runs on the free tier of Vercel (backend serverless + frontend SPA) and Neon (Postgres). Pipeline lives in `.github/workflows/`:

- **`ci.yml`** — runs on every PR and on push to `main`. Gates: typecheck × 2 (backend, frontend), lint × 2, `pnpm test` (70 tests), `prisma:check`, build × 2. Same checks `pre-push` runs locally — pre-push catches drift before CI does.
- **`deploy.yml`** — runs on push to `main` (i.e. after a PR merges). Reuses `ci.yml` via `workflow_call` as the gate, then runs three parallel jobs:
  1. `migrate` → `prisma migrate deploy` against the production DATABASE_URL secret.
  2. `deploy-backend` → `vercel build --prod` + `vercel deploy --prebuilt --prod` from the repo root.
  3. `deploy-frontend` → same, scoped to `./frontend`.

Vercel's native auto-deploy is **off** — the GitHub Actions pipeline owns it so migrations run before code, in a single observable run. The `vercel.json` files declare `framework`, install/build commands, function `maxDuration` (60s for the backend SSE path), and SPA rewrites for the frontend.

Backend serverless entry: [`api/index.ts`](api/index.ts) imports the existing Express app from `src/app.ts`. Vercel rewrites every path to this single function (`{ source: '/(.*)', destination: '/api' }`), so routing inside Express is unchanged. The PrismaService singleton survives across warm invocations; cold starts pay one DB connect.

Operator setup (one-time: Neon project, Vercel link, env vars, GitHub secrets) is in [`DEPLOYMENT.md`](DEPLOYMENT.md). Adding a new feature flag or env var requires three places:
1. `src/config/env.schema.ts` — runtime validation.
2. Vercel project env vars (Production, Preview).
3. `.env.example` — documentation.

## 18. Git & Commit Hygiene

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`, `perf:`.
- One concern per commit. Don't bundle a refactor with a feature.
- Branch naming: `feat/<short-desc>`, `fix/<short-desc>`.
- PR title = the lead commit message. PR description references the requirement (e.g. "implements §13.3 — completion endpoint").
- Don't commit `.env`, `coverage/`, `dist/`.

---

## 19. Verification Checklist (Definition of Done)

Before declaring the case complete, ALL of these must pass. Run the commands and paste the output into the PR description.

```bash
pnpm install
pnpm tsc --noEmit                 # 0 errors
pnpm lint                         # 0 errors
pnpm test                         # all green, coverage thresholds met
pnpm prisma migrate deploy        # clean DB, no drift
pnpm build                        # dist/ produced
docker compose up --build         # app comes up healthy
```

Then run smoke tests (cURL examples below) for each endpoint:

```bash
# 1) List chats — pagination metadata returned
curl -H "Authorization: Bearer $JWT" \
     -H "x-firebase-app-check: $APP_CHECK_TOKEN" \
     -H "x-client-type: web" \
     "http://localhost:3000/api/chats?limit=5"

# 2) STREAMING_ENABLED=true → SSE
curl -N -H "Authorization: Bearer $JWT" -H "x-firebase-app-check: $APP_CHECK_TOKEN" \
     -H "x-client-type: web" -H "Content-Type: application/json" \
     -d '{"message":"hello"}' \
     http://localhost:3000/api/chats/$CHAT_ID/completion

# 3) Toggle STREAMING_ENABLED=false in .env → reload → JSON response

# 4) AI_TOOLS_ENABLED=true → tool_execution event appears in the SSE stream

# 5) CHAT_HISTORY_ENABLED=false → /history returns at most 10 messages
```

**Critical**: feature flag toggling must change behavior **without rebuilding**. Demonstrate by editing the flags JSON file (or `.env` + `kill -HUP $PID`) and re-running the smoke test.

---

## 20. Forbidden Patterns

If a reviewer (or you) spots any of these, the PR is blocked:

- ❌ Calling `prisma` from a controller.
- ❌ Calling `req` / `res` / `next` from a service or repository.
- ❌ Importing from another module's `repository.ts`.
- ❌ `process.env.X` outside `src/config/`.
- ❌ `console.log` / `console.error` anywhere (except a one-liner allowed in `server.ts` only as a last-resort pre-Logger fatal).
- ❌ `any` (use `unknown` and narrow).
- ❌ `default export` (named exports only).
- ❌ `if (flag) { ... } else { ... }` for behavior switching (lift to a Strategy + Factory).
- ❌ Barrel `index.ts` files re-exporting siblings.
- ❌ Empty `catch {}`.
- ❌ Returning Prisma types (e.g. `Chat & { messages: Message[] }`) out of a repository — return a domain type.
- ❌ Raw error stacks in `production` responses.
- ❌ Boolean parameters in public APIs (`fn(true, false)` is unreadable).
- ❌ `// eslint-disable-next-line` without a reason comment.

---

## Appendix A — Suggested package.json scripts

```json
{
  "scripts": {
    "dev":         "tsx watch src/server.ts",
    "build":       "tsc -p tsconfig.build.json",
    "start":       "node dist/server.js",
    "lint":        "eslint . --ext .ts",
    "format":      "prettier --write .",
    "test":        "vitest run --coverage",
    "test:watch":  "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate":  "prisma migrate dev",
    "prisma:deploy":   "prisma migrate deploy"
  }
}
```

## Appendix B — Suggested ESLint rules (highlights)

- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/no-non-null-assertion: error`
- `import/no-default-export: error`
- `import/no-cycle: error`
- `no-restricted-syntax`: ban `process.env` reads outside `src/config/**`.
- `no-console: error`
- `import/order: error` (groups defined in §4).

---

## Appendix C — Reading order for new contributors

1. §1 Overview
2. §3 Folder structure
3. §7 Design patterns (read all five)
4. §11 Middleware order
5. §12 Feature flagging
6. §20 Forbidden patterns

That's enough to start writing code that fits this codebase.
