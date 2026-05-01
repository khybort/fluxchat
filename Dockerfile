# syntax=docker/dockerfile:1.7

# ────────────────────────────────────────────────────────────────────────────
# 1) deps — install all dependencies (incl. dev) into a cacheable layer
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false

# ────────────────────────────────────────────────────────────────────────────
# 2) dev — hot-reload target. Source is bind-mounted by docker-compose, so the
#    container picks up file changes without a rebuild. Used by the `dev` profile.
# ────────────────────────────────────────────────────────────────────────────
FROM deps AS dev
WORKDIR /app
ENV NODE_ENV=development
RUN apk add --no-cache tini openssl
COPY prisma ./prisma
RUN pnpm prisma generate
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "dev:api"]

# ────────────────────────────────────────────────────────────────────────────
# 3) build — compile TypeScript and prune dev deps
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate \
 && pnpm build \
 && pnpm prune --prod

# ────────────────────────────────────────────────────────────────────────────
# 4) runtime — production image, non-root user, minimal surface
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "dist/server.js"]
