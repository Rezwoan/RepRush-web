#!/usr/bin/env bash
# ============================================================
# RepRush — Deploy script
# Run by the self-hosted GitHub Actions runner on every push to main.
# Safe to run manually:  ssh reezz@blackbox.local 'bash /var/www/reprush/scripts/deploy.sh'
#
# Model: the live dir is a git checkout of `main`. We hard-reset to the
# pushed commit, rebuild both apps, then restart the systemd services.
# Gitignored files (.env, database/, node_modules/, .next/) survive the reset.
# ============================================================
set -euo pipefail

APP_DIR="/var/www/reprush"
BACKEND_PORT=3101
FRONTEND_PORT=3100

# ── 0. One deploy at a time ───────────────────────────────
# Same reason as deploy-dev.sh: GitHub's push-event delivery for this repo can
# lag by tens of minutes, so a CI run routinely lands while a manual run is
# mid-`npm ci`, and two npm processes rewriting one node_modules is what
# produced the ENOTEMPTY failures behind "sh: 1: nest: not found". CI's
# concurrency group only serialises CI against itself.
exec 9>/tmp/reprush-deploy.lock
if ! flock -w 1200 9; then
  echo "[deploy] another deploy is holding the lock — giving up"
  exit 1
fi

echo "[deploy] $(date) — starting"

# ── 1. Pull latest ────────────────────────────────────────
echo "[1/6] Fetching latest main..."
git -C "$APP_DIR" fetch origin main
git -C "$APP_DIR" reset --hard origin/main

# ── 2. Snapshot the production DB before a build that may migrate it ──
# TypeORM runs synchronize:true, so a schema change lands on service start.
# This is the live database; keep the last 10 snapshots.
echo "[2/6] Snapshotting production database..."
DB="$APP_DIR/backend/database/reprush.db"
if [ -f "$DB" ]; then
  cp "$DB" "$DB.bak-$(date +%Y%m%d%H%M%S)"
  ls -1t "$DB".bak-* 2>/dev/null | tail -n +11 | xargs -r rm --
  echo "  snapshot taken"
fi

# ── 3. Backend (full install — nest build needs devDeps) ──
echo "[3/6] Building backend..."
cd "$APP_DIR/backend"
npm ci --no-audit --no-fund
npm run build

# ── 4. Frontend ───────────────────────────────────────────
echo "[4/6] Building frontend..."
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
npm run build

# ── 5. Restart services ───────────────────────────────────
echo "[5/6] Restarting services..."
sudo systemctl restart reprush-backend.service
sudo systemctl restart reprush-frontend.service

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

# A healthy API answers /auth/me with 401 when signed out.
if [[ "$BACKEND" != "401" ]]; then
  echo "[deploy] ✗ backend unhealthy (HTTP ${BACKEND:-none}, expected 401)"; sudo journalctl -u reprush-backend.service -n 30 --no-pager; exit 1
fi
if [[ "$FRONTEND" != "200" && "$FRONTEND" != "307" && "$FRONTEND" != "302" ]]; then
  echo "[deploy] ✗ frontend health check failed ($FRONTEND)"; sudo journalctl -u reprush-frontend.service -n 30 --no-pager; exit 1
fi

echo "[deploy] ✓ success — $(date)"
