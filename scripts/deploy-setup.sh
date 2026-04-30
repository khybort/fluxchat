#!/usr/bin/env bash
# One-shot deployment configuration. Idempotent — safe to re-run.
#
# Prerequisites (these are the ONLY manual steps you need to do first):
#   1. Sign up at https://console.neon.tech (use "Sign in with GitHub")
#   2. Sign up at https://vercel.com (use "Continue with GitHub")
#   3. `gh` CLI logged in as a user with admin access to khybort/fluxchat:
#        gh auth login
#   4. Vercel CLI logged in:
#        pnpm dlx vercel login
#   5. Neon CLI authenticated:
#        pnpm dlx neonctl auth
#
# Then run:
#   bash scripts/deploy-setup.sh
#
# What this script does (in order):
#   - sanity-checks the prerequisites
#   - creates / picks a Neon project, captures the pooled DATABASE_URL
#   - generates JWT_SECRET and APP_CHECK_TOKEN (32-byte random hex)
#   - creates / links two Vercel projects (`fluxchat-api`, `fluxchat-web`)
#   - sets every backend env var on `fluxchat-api`
#   - sets `VITE_API_URL` and `VITE_APP_CHECK_TOKEN` on `fluxchat-web`
#   - sets the 5 GitHub Actions secrets (VERCEL_*, DATABASE_URL)
#   - prints next steps (manual: disable Vercel auto-deploy, then `git push`)

set -euo pipefail

# ────────── styling ──────────
RST=$'\033[0m'; BOLD=$'\033[1m'; CYAN=$'\033[36m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'

step()  { printf "\n${CYAN}${BOLD}▸ %s${RST}\n" "$1"; }
ok()    { printf "  ${GREEN}✓${RST} %s\n" "$1"; }
warn()  { printf "  ${YEL}⚠${RST} %s\n" "$1"; }
fail()  { printf "  ${RED}✗${RST} %s\n" "$1" >&2; exit 1; }

# ────────── prerequisite checks ──────────

step "Checking prerequisites"

REPO_OWNER="khybort"
REPO_NAME="fluxchat"
REPO_FULL="${REPO_OWNER}/${REPO_NAME}"

command -v gh   >/dev/null || fail "GitHub CLI (\`gh\`) not installed. brew install gh"
command -v node >/dev/null || fail "Node.js missing"
command -v pnpm >/dev/null || fail "pnpm missing (corepack enable && corepack prepare pnpm@latest --activate)"

gh auth status >/dev/null 2>&1 || fail "Run \`gh auth login\` first."
ok "gh CLI authenticated"

# Verify gh user has admin on the target repo (needed for `gh secret set`).
PERM=$(gh repo view "$REPO_FULL" --json viewerPermission --jq .viewerPermission 2>/dev/null || echo "NONE")
case "$PERM" in
  ADMIN|MAINTAIN|WRITE) ok "gh user has $PERM access on $REPO_FULL" ;;
  *) fail "gh user only has '$PERM' on $REPO_FULL — need ADMIN/MAINTAIN to set secrets. Run \`gh auth login\` as a different user." ;;
esac

# Vercel + Neon CLIs may be local (pnpm dlx) or globally installed — try both.
vercel_cmd() { if command -v vercel >/dev/null; then vercel "$@"; else pnpm dlx vercel@latest "$@"; fi; }
neon_cmd()   { if command -v neonctl >/dev/null; then neonctl "$@"; else pnpm dlx neonctl "$@"; fi; }

vercel_cmd whoami >/dev/null 2>&1 || fail "Run \`pnpm dlx vercel login\` first."
ok "Vercel CLI authenticated"

neon_cmd me >/dev/null 2>&1 || fail "Run \`pnpm dlx neonctl auth\` first."
ok "Neon CLI authenticated"

# ────────── Neon project ──────────

step "Provisioning Neon Postgres project"

NEON_PROJECT_NAME="${NEON_PROJECT_NAME:-fluxchat}"
EXISTING_NEON=$(neon_cmd projects list --output json | node -e "
  const arr=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const projects = Array.isArray(arr) ? arr : (arr.projects || []);
  const hit = projects.find(p => p.name === '$NEON_PROJECT_NAME');
  console.log(hit ? hit.id : '');
" 2>/dev/null || echo "")

if [ -n "$EXISTING_NEON" ]; then
  NEON_ID="$EXISTING_NEON"
  ok "Reusing Neon project '$NEON_PROJECT_NAME' (id: $NEON_ID)"
else
  ok "Creating Neon project '$NEON_PROJECT_NAME'"
  NEON_ID=$(neon_cmd projects create --name "$NEON_PROJECT_NAME" --output json | node -e "
    const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
    console.log(j.project ? j.project.id : j.id);
  ")
  ok "Created Neon project id=$NEON_ID"
fi

# Get the pooled connection string (PgBouncer mode — required for serverless).
DATABASE_URL=$(neon_cmd connection-string --project-id "$NEON_ID" --pooled 2>/dev/null || \
               neon_cmd cs --project-id "$NEON_ID" --pooled 2>/dev/null || \
               echo "")
if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" != postgresql://* ]]; then
  fail "Could not obtain pooled connection string from neonctl (got: $DATABASE_URL)"
fi
ok "Got pooled DATABASE_URL"

# ────────── secrets generation ──────────

step "Generating local secrets"

JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
APP_CHECK_TOKEN="${APP_CHECK_TOKEN:-$(openssl rand -hex 16)}"
ok "JWT_SECRET (length=${#JWT_SECRET})"
ok "APP_CHECK_TOKEN (length=${#APP_CHECK_TOKEN})"

# ────────── apply migrations against Neon ──────────

step "Applying Prisma migrations to Neon"

DATABASE_URL="$DATABASE_URL" pnpm prisma migrate deploy
ok "Migrations applied"

# ────────── Vercel projects ──────────

setup_vercel_project() {
  local NAME="$1"
  local CWD="$2"
  local IS_FRONTEND="$3"

  step "Vercel project: $NAME (cwd=$CWD)"

  pushd "$CWD" >/dev/null

  if [ ! -f .vercel/project.json ]; then
    # Create (or link) the Vercel project. `vercel link --yes` non-interactively links.
    vercel_cmd link --yes --project "$NAME" || fail "vercel link failed for $NAME"
    ok "Linked .vercel/project.json"
  else
    ok "Already linked"
  fi

  popd >/dev/null
}

setup_vercel_project "fluxchat-api" "."        "false"
setup_vercel_project "fluxchat-web" "frontend" "true"

# Read the project IDs we'll need for GitHub secrets.
BACKEND_PROJECT_ID=$(node -e "console.log(require('./.vercel/project.json').projectId)")
FRONTEND_PROJECT_ID=$(node -e "console.log(require('./frontend/.vercel/project.json').projectId)")
ORG_ID=$(node -e "console.log(require('./.vercel/project.json').orgId)")
ok "BACKEND_PROJECT_ID=$BACKEND_PROJECT_ID"
ok "FRONTEND_PROJECT_ID=$FRONTEND_PROJECT_ID"
ok "ORG_ID=$ORG_ID"

# ────────── set Vercel env vars ──────────

# Helper: idempotently set an env var on a Vercel project for production.
# `vercel env rm` + `vercel env add` is the only reliable idempotent path.
set_vercel_env() {
  local CWD="$1"
  local NAME="$2"
  local VALUE="$3"
  pushd "$CWD" >/dev/null
  vercel_cmd env rm "$NAME" production --yes >/dev/null 2>&1 || true
  printf "%s" "$VALUE" | vercel_cmd env add "$NAME" production >/dev/null
  ok "$NAME set on $(basename "$(pwd)")"
  popd >/dev/null
}

step "Setting Vercel backend env vars (fluxchat-api)"

set_vercel_env "."        "DATABASE_URL"          "$DATABASE_URL"
set_vercel_env "."        "JWT_SECRET"            "$JWT_SECRET"
set_vercel_env "."        "APP_CHECK_TOKEN"       "$APP_CHECK_TOKEN"
set_vercel_env "."        "LOG_LEVEL"             "info"
set_vercel_env "."        "DOCS_ENABLED"          "true"
set_vercel_env "."        "STREAMING_ENABLED"     "true"
set_vercel_env "."        "PAGINATION_LIMIT"      "20"
set_vercel_env "."        "AI_TOOLS_ENABLED"      "false"
set_vercel_env "."        "CHAT_HISTORY_ENABLED"  "true"
set_vercel_env "."        "RATE_LIMIT_PER_MINUTE" "60"
# AI keys remain optional — don't push empties so they fall through to mock provider.
[ "${ANTHROPIC_API_KEY:-}" != "" ] && set_vercel_env "." "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
[ "${GROQ_API_KEY:-}"      != "" ] && set_vercel_env "." "GROQ_API_KEY"      "$GROQ_API_KEY"
[ "${OPENAI_API_KEY:-}"    != "" ] && set_vercel_env "." "OPENAI_API_KEY"    "$OPENAI_API_KEY"

step "Setting Vercel frontend env vars (fluxchat-web)"

# Backend URL is published by the first deploy; we'll set it after that.
# For now use a placeholder that the deploy step replaces.
BACKEND_URL_PLACEHOLDER="https://${BACKEND_PROJECT_ID}.vercel.app"
set_vercel_env "frontend" "VITE_API_URL"          "$BACKEND_URL_PLACEHOLDER"
set_vercel_env "frontend" "VITE_APP_CHECK_TOKEN"  "$APP_CHECK_TOKEN"
warn "VITE_API_URL initially points at $BACKEND_URL_PLACEHOLDER"
warn "After the first backend deploy, update it to the real URL via the Vercel dashboard,"
warn "then trigger a frontend redeploy (or push an empty commit)."

# ────────── GitHub Actions secrets ──────────

step "Setting GitHub Actions secrets on $REPO_FULL"

# We need a Vercel personal access token for the GH workflow. The user must
# create one at https://vercel.com/account/tokens — we can't generate it from
# the CLI. Prompt for it (read once, never echo).
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "  Open https://vercel.com/account/tokens → Create Token (full account scope)"
  printf "  Paste the token here (input hidden): "
  read -rs VERCEL_TOKEN
  echo
fi
[ -n "$VERCEL_TOKEN" ] || fail "VERCEL_TOKEN required"

set_gh_secret() {
  printf "%s" "$2" | gh secret set "$1" --repo "$REPO_FULL" --body -
  ok "$1 set on $REPO_FULL"
}

set_gh_secret "VERCEL_TOKEN"                 "$VERCEL_TOKEN"
set_gh_secret "VERCEL_ORG_ID"                "$ORG_ID"
set_gh_secret "VERCEL_BACKEND_PROJECT_ID"    "$BACKEND_PROJECT_ID"
set_gh_secret "VERCEL_FRONTEND_PROJECT_ID"   "$FRONTEND_PROJECT_ID"
set_gh_secret "DATABASE_URL"                 "$DATABASE_URL"

# ────────── done ──────────

step "Done"

cat <<EOF

  ${BOLD}Next steps:${RST}

  1. ${BOLD}(One-time)${RST} Disable Vercel's native auto-deploy so the GH Actions
     workflow owns the rollout. In each Vercel project (fluxchat-api,
     fluxchat-web) → Settings → Git → set "Ignored Build Step" to:
         exit 0
     This makes Vercel skip its own builds. Our CI/CD does \`vercel build\`
     + \`vercel deploy\` instead.

  2. ${BOLD}Push${RST} (or amend a commit) to trigger the deploy:
         git commit --allow-empty -m "ci: trigger first deploy"
         git push origin main

  3. Watch the run:
         gh run watch --repo $REPO_FULL

  4. After the first backend deploy succeeds, copy its URL from the
     deploy-backend job log (something like https://fluxchat-api-xxx.vercel.app),
     update the frontend's VITE_API_URL via:
         cd frontend && pnpm dlx vercel env rm VITE_API_URL production --yes
         echo "https://your-backend.vercel.app" | pnpm dlx vercel env add VITE_API_URL production
     and either trigger a frontend redeploy from the Actions tab or push an
     empty commit to redeploy.

  5. Smoke test:
         curl https://your-backend.vercel.app/healthz | jq
         open https://your-backend.vercel.app/docs
         open https://your-frontend.vercel.app

EOF
