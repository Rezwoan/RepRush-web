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

# ── 3. Backend ────────────────────────────────────────────
echo "[3/6] Building backend..."
cd "$APP_DIR/backend"
npm ci --no-audit --no-fund
npm run build

# ── 4. Frontend ───────────────────────────────────────────
echo "[4/6] Building frontend..."
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
npm run build

# ── 5. Restart dev services only ──────────────────────────
echo "[5/6] Restarting dev services..."
sudo systemctl restart reprush-dev-backend.service
sudo systemctl restart reprush-dev-frontend.service

# ── 6. Health check ───────────────────────────────────────
echo "[6/6] Health check..."
sleep 6
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT}/api/auth/me" 2>/dev/null || echo 000)
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}" 2>/dev/null || echo 000)
echo "  backend  :${BACKEND_PORT} -> HTTP $BACKEND"
echo "  frontend :${FRONTEND_PORT} -> HTTP $FRONTEND"

if [[ "$BACKEND" == "000" ]]; then
  echo "[deploy-dev] ✗ backend not responding"
  sudo journalctl -u reprush-dev-backend.service -n 30 --no-pager; exit 1
fi
if [[ "$FRONTEND" != "200" && "$FRONTEND" != "307" && "$FRONTEND" != "302" ]]; then
  echo "[deploy-dev] ✗ frontend health check failed ($FRONTEND)"
  sudo journalctl -u reprush-dev-frontend.service -n 30 --no-pager; exit 1
fi

# Production must still be up — a dev deploy that breaks prod is a bug in this script.
PROD=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3100" 2>/dev/null || echo 000)
echo "  prod     :3100 -> HTTP $PROD (must be unaffected)"

echo "[deploy-dev] ✓ success — $(date)"
