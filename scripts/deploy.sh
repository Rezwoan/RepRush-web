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

echo "[deploy] $(date) — starting"

# ── 1. Pull latest ────────────────────────────────────────
echo "[1/5] Fetching latest main..."
git -C "$APP_DIR" fetch origin main
git -C "$APP_DIR" reset --hard origin/main

# ── 2. Backend (full install — nest build needs devDeps) ──
echo "[2/5] Building backend..."
cd "$APP_DIR/backend"
npm ci --no-audit --no-fund
npm run build

# ── 3. Frontend ───────────────────────────────────────────
echo "[3/5] Building frontend..."
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
npm run build

# ── 4. Restart services ───────────────────────────────────
echo "[4/5] Restarting services..."
sudo systemctl restart reprush-backend.service
sudo systemctl restart reprush-frontend.service

# ── 5. Health check ───────────────────────────────────────
echo "[5/5] Health check..."
sleep 6
# Backend is "up" if it answers at all (401 on a protected route counts).
BACKEND=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT}/api/auth/me" 2>/dev/null || echo 000)
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRONTEND_PORT}" 2>/dev/null || echo 000)
echo "  backend  :${BACKEND_PORT} -> HTTP $BACKEND"
echo "  frontend :${FRONTEND_PORT} -> HTTP $FRONTEND"

if [[ "$BACKEND" == "000" ]]; then
  echo "[deploy] ✗ backend not responding"; sudo journalctl -u reprush-backend.service -n 30 --no-pager; exit 1
fi
if [[ "$FRONTEND" != "200" && "$FRONTEND" != "307" && "$FRONTEND" != "302" ]]; then
  echo "[deploy] ✗ frontend health check failed ($FRONTEND)"; sudo journalctl -u reprush-frontend.service -n 30 --no-pager; exit 1
fi

echo "[deploy] ✓ success — $(date)"
