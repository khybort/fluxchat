# Deployment

Goal: deploy backend + frontend on the **free tier** of every service. The trigger is a merge to `main` — GitHub Actions runs CI gates, applies Prisma migrations, then deploys both halves to Vercel in parallel.

```
PR ──► CI (typecheck · lint · 146 tests · build · prisma:check)
       │
merge ─┴──► CI ─► migrate (prisma migrate deploy) ─┬─► deploy backend  (Vercel)
                                                   └─► deploy frontend (Vercel)
```

## Free-tier stack

| Component | Provider | Free tier limit |
|---|---|---|
| Database (Postgres) | [Neon](https://neon.tech) | 0.5 GB storage, branching, autosuspend |
| Backend (Express, serverless) | Vercel Hobby | 100 GB bandwidth, 60s function timeout |
| Frontend (Vite SPA) | Vercel Hobby | 100 GB bandwidth, unlimited static |
| CI/CD | GitHub Actions | 2 000 min/month for private repos (unlimited public) |

> **SSE caveat.** Vercel Hobby caps a single function invocation at 60 seconds. The completion endpoint streams within that window — fine for demos and short answers. For multi-minute streams, host the backend on a long-lived runtime (Fly.io, Render, Railway).

## One-time setup

Do these once. After that, every `git push origin main` redeploys automatically.

### 1. Create the Postgres database (Neon)

1. Sign up at https://console.neon.tech (free, no credit card).
2. Create a project — choose any region close to your Vercel region.
3. Under **Connection Details** copy the **Pooled** connection string. It looks like:
   ```
   postgresql://user:pass@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
   Use the **pooled** URL — Neon's PgBouncer is what serverless functions need.

### 2. Create the two Vercel projects

```bash
# Once, locally — links each Vercel project to a folder.
npm install -g vercel

# Backend project (root of the repo)
vercel login
vercel link
# → choose / create a Vercel project named e.g. "fluxchat-api"
# → confirm "What's your project's directory?" = "./"
# → settings will be inferred from vercel.json

# Frontend project (./frontend)
vercel link --cwd frontend
# → choose / create "fluxchat-web"
# → directory = "./" (relative to frontend/)
```

`vercel link` writes `.vercel/project.json` (gitignored). Note both project IDs and your team/personal `orgId` from `.vercel/project.json` — you'll paste them as GitHub secrets in step 4.

### 3. Set Vercel environment variables

Open each project in https://vercel.com → **Settings → Environment Variables**. Mark every variable for the **Production** environment (and **Preview** if you want PR previews).

#### Backend (`fluxchat-api`)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL from step 1 | required |
| `JWT_SECRET` | 32+ random characters (`openssl rand -hex 32`) | required |
| `APP_CHECK_TOKEN` | any non-empty string ≥ 8 chars | required, must match frontend |
| `CORS_ORIGINS` | `https://fluxchat-web.vercel.app` (your frontend URL) | required after first deploy |
| `LOG_LEVEL` | `info` | |
| `DOCS_ENABLED` | `true` | flip to `false` to disable `/docs` |
| `STREAMING_ENABLED` | `true` | feature flag |
| `PAGINATION_LIMIT` | `20` | feature flag |
| `AI_TOOLS_ENABLED` | `false` | feature flag |
| `CHAT_HISTORY_ENABLED` | `true` | feature flag |
| `RATE_LIMIT_PER_MINUTE` | `60` | feature flag |
| `ANTHROPIC_API_KEY` | optional | enables real Claude responses |
| `GROQ_API_KEY` | optional | enables Groq fast path |
| `OPENAI_API_KEY` | optional | additional supported provider |

> Without any AI key the backend falls back to its deterministic mock provider — the system runs end-to-end without external services.

#### Frontend (`fluxchat-web`)

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://fluxchat-api.vercel.app` (your backend URL, no trailing slash) |
| `VITE_APP_CHECK_TOKEN` | same value as backend's `APP_CHECK_TOKEN` |

### 4. Add GitHub repository secrets

In GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens → Create Token (scope: full account) |
| `VERCEL_ORG_ID` | `.vercel/project.json` from step 2 (`orgId`) |
| `VERCEL_BACKEND_PROJECT_ID` | backend `.vercel/project.json` (`projectId`) |
| `VERCEL_FRONTEND_PROJECT_ID` | frontend `.vercel/project.json` (`projectId`) |
| `DATABASE_URL` | same Neon URL as the backend's env var (used for `prisma migrate deploy`) |

### 5. Disable Vercel's auto-deploy (GitHub Actions owns the pipeline)

In each Vercel project → **Settings → Git**:

- Toggle **OFF** "Production Branch" auto-deploy on push, OR
- Set **Ignored Build Step** to `exit 0` so Vercel skips its own build (GitHub Actions runs `vercel build` + `vercel deploy` instead).

This avoids double deploys (one from Vercel's GitHub integration, one from our pipeline).

### 6. First deploy

Push the deployment commit (the workflow files + `vercel.json`). The `Deploy` workflow runs end-to-end:

```
git push origin main
```

Watch the run at GitHub → **Actions → Deploy**. Order:
1. `ci` — 146 tests
2. `migrate` — `prisma migrate deploy` against Neon
3. `deploy-backend` + `deploy-frontend` (parallel)

Once both green, the URLs print in the Vercel CLI step. Smoke test:

```bash
curl https://fluxchat-api.vercel.app/healthz | jq
# { "status": "ok", "flags": { ... } }

open https://fluxchat-api.vercel.app/docs
# Swagger UI listing every endpoint
```

## Troubleshooting

- **`prisma migrate deploy` fails with "no migrations folder"** — make sure `prisma/migrations/20260429160000_init/` is committed (it is in this repo's first commit).
- **CORS errors in the browser** — backend's `CORS_ORIGINS` env var must include the frontend's origin (no path, no trailing slash). Update Vercel env, then redeploy backend.
- **`The function exceeded the maximum duration of 60 seconds`** — the SSE stream ran past Vercel Hobby's cap. Either shorten the AI response or move the backend to a long-lived host.
- **Cold starts feel slow** — Neon autosuspends idle databases; the first request after idle takes a few hundred ms extra to wake the DB. Subsequent requests are warm.

## Rollback

Vercel keeps every previous deployment. To roll back:

```bash
vercel rollback --token=$VERCEL_TOKEN
```

…or in the dashboard, find the prior deployment under **Deployments → Promote to Production**. Migrations are not auto-reverted; if a deploy includes a destructive migration, write a follow-up migration that restores the schema.
