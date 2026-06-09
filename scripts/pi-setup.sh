#!/usr/bin/env bash
# ============================================================
# RepRush — Raspberry Pi first-time setup (idempotent)
#
# Tailored to the BlackBox Pi, which already runs other projects:
#   - process manager: systemd   (NOT pm2)
#   - reverse proxy:    nginx     (vhost per hostname; cloudflared -> :80)
#   - ports 3000/3001/3005/8000/80 are taken by other apps
#       -> RepRush uses 3100 (frontend) and 3101 (backend)
#   - app lives in /var/www/<project>, logs in /var/log/<project>
#
# Safe to re-run. It will NOT touch other projects, regenerate secrets,
# or edit the shared cloudflared tunnel config (that step is manual; see end).
#
# Usage (on the Pi):
#   bash /var/www/reprush/scripts/pi-setup.sh
# Bootstrap (first time, before the repo is cloned):
#   curl -fsSL https://raw.githubusercontent.com/Rezwoan/RepRush-web/main/scripts/pi-setup.sh | bash
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/Rezwoan/RepRush-web.git"
APP_DIR="/var/www/reprush"
LOG_DIR="/var/log/reprush"
DOMAIN="reprush.rezwoan.me"
BACKEND_PORT=3101
FRONTEND_PORT=3100
USER_NAME="$(whoami)"

echo "=== RepRush Pi setup ==="

command -v node >/dev/null || { echo "Node.js is required but not installed."; exit 1; }
command -v git  >/dev/null || { echo "git is required but not installed."; exit 1; }
echo "node $(node -v), npm $(npm -v)"

# ── 1. Repo ───────────────────────────────────────────────
echo "[1/8] Repo at $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER_NAME:$USER_NAME" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
fi

# ── 2. Log dir ────────────────────────────────────────────
echo "[2/8] Logs at $LOG_DIR"
sudo mkdir -p "$LOG_DIR"
sudo chown -R "$USER_NAME:$USER_NAME" "$LOG_DIR"

# ── 3. Env files (only created if missing — never overwrite secrets) ──
echo "[3/8] Environment files"
if [ ! -f "$APP_DIR/backend/.env" ]; then
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  cat > "$APP_DIR/backend/.env" <<EOF
NODE_ENV=production
PORT=$BACKEND_PORT
FRONTEND_URL=https://$DOMAIN
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=7d
RESEND_API_KEY=re_KTufxzGR_4xAfbUCKJf7mwwE5M1zZudZu
RESEND_FROM_EMAIL=RepRush <noreply@rezwoan.me>
ADMIN_EMAIL=frezwoan+reprush@gmail.com
ADMIN_PASSWORD=RepRush@Admin2025
EOF
  echo "  created backend/.env (fresh JWT secret)"
else
  echo "  backend/.env exists — left untouched"
fi
if [ ! -f "$APP_DIR/frontend/.env.local" ]; then
  echo "NEXT_PUBLIC_API_URL=https://$DOMAIN" > "$APP_DIR/frontend/.env.local"
  echo "  created frontend/.env.local"
else
  echo "  frontend/.env.local exists — left untouched"
fi

# ── 4. Build ──────────────────────────────────────────────
echo "[4/8] Building backend"
cd "$APP_DIR/backend" && npm ci --no-audit --no-fund && npm run build
echo "      Building frontend"
cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund && npm run build

# ── 5. systemd services ───────────────────────────────────
echo "[5/8] systemd services"
sudo tee /etc/systemd/system/reprush-backend.service >/dev/null <<EOF
[Unit]
Description=RepRush — NestJS API
After=network.target

[Service]
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP_DIR/backend
Environment=NODE_ENV=production
Environment=PORT=$BACKEND_PORT
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5s
StandardOutput=append:$LOG_DIR/backend.log
StandardError=append:$LOG_DIR/backend-error.log

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/reprush-frontend.service >/dev/null <<EOF
[Unit]
Description=RepRush — Next.js Frontend
After=network.target reprush-backend.service

[Service]
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP_DIR/frontend
Environment=NODE_ENV=production
Environment=PORT=$FRONTEND_PORT
ExecStart=/usr/bin/node node_modules/.bin/next start -p $FRONTEND_PORT
Restart=on-failure
RestartSec=5s
StandardOutput=append:$LOG_DIR/frontend.log
StandardError=append:$LOG_DIR/frontend-error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable reprush-backend.service reprush-frontend.service
sudo systemctl restart reprush-backend.service
sudo systemctl restart reprush-frontend.service

# ── 6. nginx vhost ────────────────────────────────────────
echo "[6/8] nginx vhost for $DOMAIN"
sudo tee /etc/nginx/sites-available/reprush >/dev/null <<EOF
# RepRush — $DOMAIN  (cloudflared tunnel -> nginx :80 -> here)
server {
    listen 80;
    server_name $DOMAIN;

    # Real client IP from Cloudflare
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    real_ip_header CF-Connecting-IP;

    client_max_body_size 12M;   # base64 profile-image uploads

    # Backend API (NestJS global prefix is /api)
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    # Next.js immutable assets
    location /_next/static/ {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/reprush /etc/nginx/sites-enabled/reprush
sudo nginx -t && sudo systemctl reload nginx

# ── 7. Status ─────────────────────────────────────────────
echo "[7/8] Service status"
systemctl --no-pager --no-legend status reprush-backend.service  | head -3 || true
systemctl --no-pager --no-legend status reprush-frontend.service | head -3 || true

# ── 8. Manual steps (printed, not automated) ──────────────
cat <<EOF

[8/8] Remaining MANUAL steps (one-time):

  A) Cloudflare Tunnel — route the hostname to nginx :80
     cloudflared tunnel route dns 27a45beb-cb35-4793-ae4c-3ec398928907 $DOMAIN
     Then add to /etc/cloudflared/config.yml (BEFORE the http_status:404 line):
         - hostname: $DOMAIN
           service: http://localhost:80
     sudo systemctl restart cloudflared

  B) GitHub Actions runner (auto-deploy on push) — dedicated runner for THIS repo:
     mkdir -p ~/actions-runner-reprush && cd ~/actions-runner-reprush
     curl -O -L https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-arm64-2.334.0.tar.gz
     tar xzf actions-runner-linux-arm64-2.334.0.tar.gz
     ./config.sh --url https://github.com/Rezwoan/RepRush-web \\
       --token <REG_TOKEN from repo Settings > Actions > Runners > New> \\
       --name blackbox-reprush --labels reprush --unattended
     sudo ./svc.sh install $USER_NAME && sudo ./svc.sh start

Done. Local: http://localhost:$FRONTEND_PORT  |  Public: https://$DOMAIN
EOF
