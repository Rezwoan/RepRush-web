#!/usr/bin/env bash
# ============================================================
# RepRush DEV — Raspberry Pi setup for the v2 rebuild (idempotent)
#
# Stands up a SECOND, fully isolated RepRush stack next to production so the
# v2 rebuild can be developed and deployed without ever touching the live app.
#
#   production : branch main → /var/www/reprush     → 3100/3101 → reprush.rezwoan.codes
#   dev (this) : branch v2   → /var/www/reprush-dev → 3120/3121 → dev-reprush.rezwoan.codes
#
# Ports on this Pi are shared with other projects. Verified map:
#   3005 AdGuard | 3100/3101 RepRush prod | 3110/3111 ClassMate
#   3120/3121 RepRush dev (ours) | 3200/3201 hbd-samia | 80/8080 nginx/RaspAP
#
# Safe to re-run. Never touches production, other projects, or existing secrets.
#
# Usage (on the Pi):
#   bash /var/www/reprush-dev/scripts/pi-setup-dev.sh
# Bootstrap (first run, before the dev checkout exists):
#   curl -fsSL https://raw.githubusercontent.com/Rezwoan/RepRush-web/v2/scripts/pi-setup-dev.sh | bash
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/Rezwoan/RepRush-web.git"
BRANCH="v2"
APP_DIR="/var/www/reprush-dev"
PROD_DIR="/var/www/reprush"
LOG_DIR="/var/log/reprush-dev"
DOMAIN="dev-reprush.rezwoan.codes"
BACKEND_PORT=3121
FRONTEND_PORT=3120
TUNNEL_ID="27a45beb-cb35-4793-ae4c-3ec398928907"
USER_NAME="$(whoami)"

echo "=== RepRush DEV setup ($DOMAIN) ==="

command -v node >/dev/null || { echo "Node.js is required but not installed."; exit 1; }
command -v git  >/dev/null || { echo "git is required but not installed."; exit 1; }
echo "node $(node -v), npm $(npm -v)"

# ── 0. Refuse to run if the ports belong to someone else ──
for p in "$FRONTEND_PORT" "$BACKEND_PORT"; do
  if sudo ss -tlnp 2>/dev/null | grep -q ":$p .*next-server\|:$p .*node"; then
    owner=$(sudo ss -tlnp 2>/dev/null | grep ":$p " | grep -o 'pid=[0-9]*' | head -1)
    if ! systemctl is-active --quiet reprush-dev-frontend.service && \
       ! systemctl is-active --quiet reprush-dev-backend.service; then
      echo "✗ port $p is in use by something that is not RepRush dev ($owner). Aborting."
      exit 1
    fi
  fi
done

# ── 1. Repo (branch v2) ───────────────────────────────────
echo "[1/8] Repo at $APP_DIR (branch $BRANCH)"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER_NAME:$USER_NAME" "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
fi

# ── 2. Log dir ────────────────────────────────────────────
echo "[2/8] Logs at $LOG_DIR"
sudo mkdir -p "$LOG_DIR"
sudo chown -R "$USER_NAME:$USER_NAME" "$LOG_DIR"

# ── 3. Env files (own secrets — never shared with prod) ───
echo "[3/8] Environment files"
if [ ! -f "$APP_DIR/backend/.env" ]; then
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  # Reuse prod's Resend key if present so invite mail works on dev too; otherwise leave blank
  # (the mail service degrades gracefully) rather than failing setup.
  RESEND_API_KEY="${RESEND_API_KEY:-$(grep -m1 '^RESEND_API_KEY=' "$PROD_DIR/backend/.env" 2>/dev/null | cut -d= -f2- || true)}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")}"
  cat > "$APP_DIR/backend/.env" <<EOF
NODE_ENV=production
PORT=$BACKEND_PORT
FRONTEND_URL=https://$DOMAIN
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=30d
RESEND_API_KEY=$RESEND_API_KEY
RESEND_FROM_EMAIL=RepRush Dev <noreply@rezwoan.codes>
ADMIN_EMAIL=frezwoan+reprushdev@gmail.com
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chmod 600 "$APP_DIR/backend/.env"
  echo "  created backend/.env (fresh JWT secret, mode 600)"
  echo "  dev admin: frezwoan+reprushdev@gmail.com / $ADMIN_PASSWORD"
  echo "  ^ recorded here once; read it back later with: sudo grep ADMIN_PASSWORD $APP_DIR/backend/.env"
else
  echo "  backend/.env exists — left untouched"
fi
if [ ! -f "$APP_DIR/frontend/.env.local" ]; then
  echo "NEXT_PUBLIC_API_URL=https://$DOMAIN" > "$APP_DIR/frontend/.env.local"
  echo "  created frontend/.env.local"
else
  echo "  frontend/.env.local exists — left untouched"
fi

# ── 4. Seed the dev DB from a copy of prod (once) ─────────
echo "[4/8] Database"
mkdir -p "$APP_DIR/backend/database"
if [ ! -f "$APP_DIR/backend/database/reprush.db" ] && [ -f "$PROD_DIR/backend/database/reprush.db" ]; then
  cp "$PROD_DIR/backend/database/reprush.db" "$APP_DIR/backend/database/reprush.db"
  echo "  seeded dev DB from a copy of production (read-only snapshot; safe to wipe)"
else
  echo "  dev DB already present — left untouched"
fi

# ── 5. Build ──────────────────────────────────────────────
echo "[5/8] Building backend"
cd "$APP_DIR/backend" && npm ci --no-audit --no-fund && npm run build
echo "      Building frontend"
cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund && npm run build

# ── 6. systemd services ───────────────────────────────────
echo "[6/8] systemd services"
sudo tee /etc/systemd/system/reprush-dev-backend.service >/dev/null <<EOF
[Unit]
Description=RepRush DEV — NestJS API (v2)
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

sudo tee /etc/systemd/system/reprush-dev-frontend.service >/dev/null <<EOF
[Unit]
Description=RepRush DEV — Next.js Frontend (v2)
After=network.target reprush-dev-backend.service

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
sudo systemctl enable reprush-dev-backend.service reprush-dev-frontend.service
sudo systemctl restart reprush-dev-backend.service
sudo systemctl restart reprush-dev-frontend.service

# ── 7. nginx vhost ────────────────────────────────────────
echo "[7/8] nginx vhost for $DOMAIN"
sudo tee /etc/nginx/sites-available/reprush-dev >/dev/null <<EOF
# RepRush DEV — $DOMAIN  (cloudflared tunnel -> nginx :80 -> here)
# Separate vhost from production's; nginx routes by Host header.
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

    # Keep search engines off the rebuild
    add_header X-Robots-Tag "noindex, nofollow" always;

    client_max_body_size 12M;

    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    location /_next/static/ {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

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

        # Next.js sends "s-maxage=31536000, stale-while-revalidate" on
        # prerendered documents, which assumes a CDN that gets purged on every
        # deploy. Nothing purges here, so a returning browser happily serves a
        # year-old HTML shell that references /_next chunks the deploy already
        # deleted — a white screen until the user hard-refreshes.
        # Documents revalidate; the content-hashed assets under /_next/static/
        # keep their immutable caching (see the block above).
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/reprush-dev /etc/nginx/sites-enabled/reprush-dev
sudo nginx -t && sudo systemctl reload nginx

# ── 8. Cloudflare tunnel ingress (idempotent) ─────────────
echo "[8/8] Cloudflare tunnel ingress"
CF_CONF=/etc/cloudflared/config.yml
if sudo grep -q "hostname: $DOMAIN" "$CF_CONF"; then
  echo "  ingress rule already present"
else
  sudo cp "$CF_CONF" "$CF_CONF.bak-$(date +%Y%m%d%H%M%S)"
  # Insert immediately before the catch-all 404 rule, preserving indentation.
  sudo sed -i "s|^  - service: http_status:404|  - hostname: $DOMAIN\n    service: http://localhost:80\n  - service: http_status:404|" "$CF_CONF"
  sudo cloudflared tunnel ingress validate && sudo systemctl restart cloudflared
  echo "  ingress rule added and cloudflared restarted"
fi
# MUST run as root. `reezz`'s ~/.cloudflared/cert.pem is scoped to the rezwoan.me
# zone, so as the user this silently creates `$DOMAIN.rezwoan.me` instead of a
# record in rezwoan.codes. /etc/cloudflared/cert.pem is the rezwoan.codes cert.
sudo cloudflared tunnel route dns "$TUNNEL_ID" "$DOMAIN" 2>&1 | tee /tmp/cfroute.log | tail -2
if grep -qiE "Added CNAME|already configured to route" /tmp/cfroute.log; then
  echo "  DNS OK"
else
  echo "  ✗ DNS route may have failed — check the output above"
fi

# Verify end to end rather than trusting the exit codes above.
echo "  resolving $DOMAIN ..."
for i in 1 2 3 4 5 6; do
  if getent hosts "$DOMAIN" >/dev/null 2>&1 || dig +short "$DOMAIN" @1.1.1.1 | grep -q .; then
    echo "  ✓ $DOMAIN resolves"; break
  fi
  [ "$i" = 6 ] && echo "  … not resolving yet; Cloudflare DNS usually catches up within a minute"
  sleep 10
done

# ── Status ────────────────────────────────────────────────
echo
echo "Service status:"
systemctl --no-pager --no-legend status reprush-dev-backend.service  | head -3 || true
systemctl --no-pager --no-legend status reprush-dev-frontend.service | head -3 || true
echo
echo "Production untouched:"
systemctl --no-pager --no-legend status reprush-backend.service  | head -3 || true
systemctl --no-pager --no-legend status reprush-frontend.service | head -3 || true
echo
echo "Done. Local: http://localhost:$FRONTEND_PORT  |  Public: https://$DOMAIN"
