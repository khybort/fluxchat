# AppNation Chat — top-level orchestration.
# All targets are .PHONY so `make foo` always re-runs.
# Run `make help` for the menu.

SHELL := /bin/sh

# Colors for the help target
CYAN := \033[36m
DIM  := \033[2m
RST  := \033[0m

.DEFAULT_GOAL := help

.PHONY: help install install-api install-web hooks-install \
        dev dev-api dev-web build build-api build-web start \
        lint lint-api lint-web typecheck typecheck-api typecheck-web \
        test test-watch verify \
        migrate migrate-deploy migrate-check migrate-shadow-check migrate-status prisma-studio prisma-generate prisma-seed \
        db-up db-down db-logs db-reset \
        docker-dev docker-dev-logs docker-dev-down docker-prod docker-prod-down docker-test docker-prune \
        deploy-setup deploy-trigger deploy-watch \
        format clean

## ─── meta ───────────────────────────────────────────────────────────────────

help:  ## Show this menu
	@printf "$(CYAN)AppNation Chat$(RST) — make targets\n\n"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-22s$(RST) %s\n", $$1, $$2}'
	@printf "\n$(DIM)Tip:$(RST) most targets accept ENV overrides, e.g. \`make migrate ARGS=\"--name new_field\"\`\n"

## ─── install / hooks ────────────────────────────────────────────────────────

install: install-api install-web hooks-install  ## Install backend + frontend deps and git hooks

install-api:  ## Install backend deps
	pnpm install

install-web:  ## Install frontend deps
	pnpm --dir frontend install

hooks-install:  ## Install/refresh husky pre-commit + pre-push hooks
	pnpm prepare

## ─── development (hot reload) ───────────────────────────────────────────────

dev:  ## Start backend + frontend with hot reload (concurrently)
	pnpm dev

dev-api:  ## Start backend only (tsx watch)
	pnpm dev:api

dev-web:  ## Start frontend only (vite dev)
	pnpm dev:web

## ─── build / start ──────────────────────────────────────────────────────────

build: build-api build-web  ## Build backend + frontend

build-api:  ## Build backend (tsc -> dist/)
	pnpm build

build-web:  ## Build frontend (vite -> frontend/dist/)
	pnpm build:web

start:  ## Run the production backend (requires `make build` first)
	pnpm start

## ─── quality gates ──────────────────────────────────────────────────────────

lint: lint-api lint-web  ## Lint backend + frontend

lint-api:  ## ESLint backend
	pnpm lint

lint-web:  ## ESLint frontend
	pnpm lint:web

typecheck: typecheck-api typecheck-web  ## Type-check backend + frontend

typecheck-api:  ## Type-check backend (tsc --noEmit)
	pnpm typecheck

typecheck-web:  ## Type-check frontend (tsc -b --noEmit)
	pnpm typecheck:web

test:  ## Run backend test suite (vitest)
	pnpm test

test-watch:  ## Run backend tests in watch mode
	pnpm test:watch

test-db:  ## Run real-Postgres integration tests (Testcontainers, requires Docker)
	RUN_DB_TESTS=1 pnpm vitest run tests/integration/db-real.e2e.test.ts

format:  ## Prettier-write the whole repo
	pnpm format

verify:  ## Run typecheck + lint + tests + migration drift check (everything)
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) test
	$(MAKE) migrate-check

## ─── prisma / migrations ────────────────────────────────────────────────────

prisma-generate:  ## Regenerate Prisma client
	pnpm prisma:generate

migrate:  ## Create + apply a dev migration. Usage: make migrate ARGS="--name add_x"
	pnpm prisma migrate dev $(ARGS)

migrate-deploy:  ## Apply migrations against the configured DATABASE_URL (prod-style)
	pnpm prisma:deploy

migrate-status:  ## Show migration status against the configured DATABASE_URL (needs DB)
	pnpm prisma migrate status

migrate-check:  ## DB-less schema check: prisma validate + format. Use migrate-status for real drift.
	pnpm prisma:check

migrate-shadow-check:  ## Real drift check using a throwaway shadow Postgres container (slower, needs Docker)
	@docker rm -f appnation-shadow-db >/dev/null 2>&1 || true
	@docker run -d --rm --name appnation-shadow-db -e POSTGRES_PASSWORD=shadow -p 54329:5432 postgres:16-alpine >/dev/null
	@printf "▸ waiting for shadow Postgres"; \
	until docker exec appnation-shadow-db pg_isready -U postgres >/dev/null 2>&1; do printf "."; sleep 1; done; printf " ready\n"
	@DATABASE_URL=postgresql://postgres:shadow@localhost:54329/postgres \
		pnpm exec prisma migrate diff \
			--from-migrations ./prisma/migrations \
			--to-schema-datamodel ./prisma/schema.prisma \
			--shadow-database-url postgresql://postgres:shadow@localhost:54329/postgres \
			--exit-code \
		&& EXIT=0 || EXIT=$$?; \
		docker rm -f appnation-shadow-db >/dev/null 2>&1; \
		exit $$EXIT

prisma-studio:  ## Launch Prisma Studio against the configured DATABASE_URL
	pnpm prisma:studio

prisma-seed:  ## Seed the configured DATABASE_URL with the demo admin + user accounts
	pnpm prisma:seed

## ─── local database ────────────────────────────────────────────────────────

db-up:  ## Start the local Postgres in Docker (detached)
	docker compose up -d db

db-down:  ## Stop the local Postgres container (data preserved)
	docker compose stop db

db-logs:  ## Tail local Postgres logs
	docker compose logs -f db

db-reset:  ## DESTRUCTIVE: drop the local Postgres volume and recreate it
	docker compose rm -sf db
	docker volume rm $$(docker volume ls -q --filter name=$$(basename $$PWD))_db_data 2>/dev/null || true
	docker compose up -d db

## ─── docker compose profiles ────────────────────────────────────────────────

docker-dev:  ## Bring up dev profile detached (db + api hot reload + web hot reload). Use `make docker-dev-logs` to tail.
	docker compose --profile dev up -d --build

docker-dev-logs:  ## Tail logs for the dev profile
	docker compose --profile dev logs -f

docker-dev-down:  ## Stop dev profile services
	docker compose --profile dev down

docker-prod:  ## Bring up prod profile in detached mode
	docker compose --profile prod up -d --build

docker-prod-down:  ## Stop prod profile services
	docker compose --profile prod down

docker-test:  ## Bring up the dedicated test database (port 5433)
	docker compose --profile test up -d db-test

docker-prune:  ## DESTRUCTIVE: remove all profile containers, networks, and volumes for this project
	docker compose --profile dev --profile prod --profile test down -v --remove-orphans

## ─── deployment ─────────────────────────────────────────────────────────────

deploy-setup:  ## One-shot setup: create Neon DB + link Vercel projects + push env vars + GH secrets (see DEPLOYMENT.md for prerequisites)
	@bash scripts/deploy-setup.sh

deploy-trigger:  ## Push an empty commit to main to trigger the deploy workflow
	git commit --allow-empty -m "ci: trigger redeploy"
	git push origin main

deploy-watch:  ## Tail the latest GitHub Actions run
	gh run watch --repo khybort/fluxchat

## ─── housekeeping ───────────────────────────────────────────────────────────

clean:  ## Remove build artifacts (dist/, frontend/dist/, coverage/)
	rm -rf dist frontend/dist coverage frontend/.vite
