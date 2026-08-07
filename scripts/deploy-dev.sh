#!/usr/bin/env bash
# ============================================================
# RepRush DEV — Deploy script (branch v2 → dev-reprush.rezwoan.codes)
#
# Run by the self-hosted runner on every push to `v2`.
# Manually:  ssh reezz@blackbox.local 'bash /var/www/reprush-dev/scripts/deploy-dev.sh'
#
# This NEVER touches /var/www/reprush (production) or the reprush-* services.
# ============================================================
set -euo pipefail

APP_DIR="/var/www/reprush-dev"
BRANCH="v2"
BACKEND_PORT=3121
FRONTEND_PORT=3120

echo "[deploy-dev] $(date) — starting"

# Guard: refuse to run against the production checkout.
[[ "$APP_DIR" == "/var/www/reprush-dev" ]] || { echo "refusing: APP_DIR is not the dev checkout"; exit 1; }

# ── 1. Pull latest v2 ─────────────────────────────────────
echo "[1/6] Fetching latest $BRANCH..."
git -C "$APP_DIR" fetch origin "$BRANCH"
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"

# ── 2. Snapshot the dev DB before a build that may migrate it ──
# TypeORM runs synchronize:true, so a schema change lands on service start.
# Keep the last 5 snapshots; they are small and have saved us before.
echo "[2/6] Snapshotting dev database..."
DB="$APP_DIR/backend/database/reprush.db"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.bak-$(date +%Y%m%d%H%M%S)"
  ls -1t "$DB".bak-* 2>/dev/null | tail -n +6 | xargs -r rm --
  echo "  snapshot taken"
fi

# `npm ci` on this Pi occasionally reports "added N packages" and leaves
# node_modules/.bin incomplete, so the very next line dies with
# "sh: 1: nest: not found". It succeeds on a plain retry every time. Rather
# than burning a whole deploy on it, check for the binary the build needs and
# reinstall once if it is missing.
install_deps() {
  local dir="$1" bin="$2"
  cd "$dir"
  npm ci --no-audit --no-fund
  if [ ! -x "node_modules/.bin/$bin" ]; then
    echo "  npm ci left node_modules/.bin/$bin missing — reinstalling once"
    rm -rf node_modules
    npm ci --no-audit --no-fund
  fi
  [ -x "node_modules/.bin/$bin" ] || { echo "install failed: $bin still missing in $dir"; exit 1; }
}

# ── 3. Backend ────────────────────────────────────────────
echo "[3/6] Building backend..."
install_deps "$APP_DIR/backend" nest
npm run build

# ── 4. Frontend ───────────────────────────────────────────
echo "[4/6] Building frontend..."
install_deps "$APP_DIR/frontend" next
npm run build

# ── 5. Restart dev services only ──────────────────────────
echo "[5/6] Restarting dev services..."
sudo systemctl restart reprush-dev-backend.service
sudo systemctl restart reprush-dev-frontend.service

# ── 6. Health check ───────────────────────────────────────
echo "[6/6] Health check..."
# `curl -w %{http_code}` already prints 000 when it cannot connect, so the old
# `|| echo 000` appended a *second* 000 and a dead service read as "000000" —
# which is not equal to "000", so the check passed and the deploy reported
# success with the API crash-looping. Caught on 2026-08-07 when a failed boot
# self-check took the dev backend down and the script said "✓ success".
# Retry rather than a single sleep: a Pi can take longer than 6s to bind.
probe() { curl -s -o /dev/null -m 5 -w "%{http_code}" "$1" 2>/dev/null || true; }
await_backend() {
  local url="$1" code=000
  for _ in $(seq 1 10); do
    code=$(probe "$url")
    [[ "$code" == "401" ]] && break
    sleep 3
  done
  echo "$code"
}

BACKEND=$(await_backend "http://localhost:${BACKEND_PORT}/api/auth/me")
FRONTEND=$(probe "http://localhost:${FRONTEND_PORT}")
echo "  backend  :${BACKEND_PORT} -> HTTP $BACKEND"
echo "  frontend :${FRONTEND_PORT} -> HTTP $FRONTEND"

# A healthy API answers /auth/me with 401 when signed out. Anything else —
# including no answer at all — means it did not come up.
if [[ "$BACKEND" != "401" ]]; then
  echo "[deploy-dev] ✗ backend unhealthy (HTTP ${BACKEND:-none}, expected 401)"
  sudo journalctl -u reprush-dev-backend.service -n 30 --no-pager; exit 1
fi
if [[ "$FRONTEND" != "200" && "$FRONTEND" != "307" && "$FRONTEND" != "302" ]]; then
  echo "[deploy-dev] ✗ frontend health check failed ($FRONTEND)"
  sudo journalctl -u reprush-dev-frontend.service -n 30 --no-pager; exit 1
fi

# Production must still be up — a dev deploy that breaks prod is a bug in this script.
PROD=$(probe "http://localhost:3100")
echo "  prod     :3100 -> HTTP $PROD (must be unaffected)"
if [[ "$PROD" != "200" && "$PROD" != "307" && "$PROD" != "302" ]]; then
  echo "[deploy-dev] ✗ dev deployed, but PRODUCTION is not responding (HTTP ${PROD:-none})"
  echo "[deploy-dev]   this script must never affect prod — investigate before deploying again"
  exit 1
fi

echo "[deploy-dev] ✓ success — $(date)"
