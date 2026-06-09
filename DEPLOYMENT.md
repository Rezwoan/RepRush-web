# RepRush — Deployment Guide

> **Live URL:** https://reprush.rezwoan.me
> **Server:** Raspberry Pi 5 — `blackbox.local` (user `reezz`), app at `/var/www/reprush`
> **CI/CD:** GitHub Actions → dedicated self-hosted runner on the Pi (label `reprush`)
> **Repo:** https://github.com/Rezwoan/RepRush-web

This Pi **also hosts other projects** (a portfolio on :3000/:8000, AdGuard, RaspAP, etc.).
Everything below is scoped to RepRush and is designed not to disturb them.

---

## Architecture

```
Internet
  └── Cloudflare (DNS + TLS)
        └── Cloudflare Tunnel  (cloudflared, systemd — no port forwarding)
              └── reprush.rezwoan.me → http://localhost:80
                    └── nginx vhost (server_name reprush.rezwoan.me)
                          ├── /api/  → NestJS backend  (127.0.0.1:3101)
                          └── /      → Next.js frontend (127.0.0.1:3100)
```

- **Process manager:** systemd (`reprush-backend.service`, `reprush-frontend.service`)
- **Ports:** frontend **3100**, backend **3101** (3000/3001/3005/8000/80 are used by other apps)
- **Database:** SQLite via sql.js at `/var/www/reprush/backend/database/reprush.db` (persists across deploys)

---

## First-Time Setup (run once)

The repo must be public (it is) so the Pi can clone without credentials.

```bash
ssh reezz@blackbox.local
curl -fsSL https://raw.githubusercontent.com/Rezwoan/RepRush-web/main/scripts/pi-setup.sh | bash
```

`scripts/pi-setup.sh` is idempotent and will:
1. Clone the repo to `/var/www/reprush`
2. Create `/var/log/reprush`
3. Create `backend/.env` (fresh JWT secret) and `frontend/.env.local` — only if missing
4. `npm ci && npm run build` for backend and frontend
5. Install + enable + start the two systemd services
6. Install the nginx vhost and reload nginx
7. Print the two remaining manual steps (Cloudflare + runner)

It never regenerates secrets on re-run and never edits other projects.

---

## Cloudflare Tunnel (one-time)

Routing is via the existing Cloudflare Tunnel (`cloudflared`), not port forwarding.

```bash
# 1. Create the DNS record pointing the hostname at the tunnel
cloudflared tunnel route dns 27a45beb-cb35-4793-ae4c-3ec398928907 reprush.rezwoan.me

# 2. Add an ingress rule in /etc/cloudflared/config.yml, BEFORE the `- service: http_status:404` line:
#      - hostname: reprush.rezwoan.me
#        service: http://localhost:80
sudo nano /etc/cloudflared/config.yml

# 3. Apply
sudo systemctl restart cloudflared
```

nginx routes by `Host` header, so the tunnel only needs to forward the hostname to `:80`.

---

## CI/CD — Self-Hosted Runner (one-time)

The Pi has no public inbound access, so a self-hosted runner **polls** GitHub. RepRush gets its
**own** runner (separate from the portfolio runner already on the Pi).

```bash
mkdir -p ~/actions-runner-reprush && cd ~/actions-runner-reprush
curl -O -L https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-arm64-2.334.0.tar.gz
tar xzf actions-runner-linux-arm64-2.334.0.tar.gz

# Get a registration token from:
#   https://github.com/Rezwoan/RepRush-web/settings/actions/runners/new   (or `gh api`)
./config.sh --url https://github.com/Rezwoan/RepRush-web \
  --token <REG_TOKEN> --name blackbox-reprush --labels reprush --unattended

sudo ./svc.sh install reezz
sudo ./svc.sh start
```

After this, every push to `main` runs `.github/workflows/deploy.yml` →
`scripts/deploy.sh` (pull → build both → restart services → health check).

---

## Environment Variables

### Backend — `/var/www/reprush/backend/.env`
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3101` |
| `FRONTEND_URL` | `https://reprush.rezwoan.me` |
| `JWT_SECRET` | auto-generated 96-char hex (Pi only) |
| `JWT_EXPIRY` | `7d` |
| `RESEND_API_KEY` | Resend key for invite emails |
| `RESEND_FROM_EMAIL` | `RepRush <noreply@rezwoan.me>` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seeded admin account |

### Frontend — `/var/www/reprush/frontend/.env.local`
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://reprush.rezwoan.me` (baked into the build) |

> These live **only on the Pi**, are gitignored, and survive `git reset --hard`. Never commit them.
> `PORT`/`NODE_ENV` are also set by systemd; dotenv won't override them, which is intended.

---

## Operations

```bash
# Status / logs
systemctl status reprush-backend reprush-frontend
sudo journalctl -u reprush-backend -f
tail -f /var/log/reprush/frontend.log

# Restart
sudo systemctl restart reprush-backend reprush-frontend

# Manual deploy (same as CI)
bash /var/www/reprush/scripts/deploy.sh

# Backend health (401 = up but unauthenticated)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3101/api/auth/me
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100
```

---

## Troubleshooting

**Site down**
```bash
systemctl status reprush-backend reprush-frontend
sudo nginx -t && sudo systemctl status nginx
systemctl status cloudflared
```

**Deploy/build failed in CI** — open the run in GitHub Actions, or on the Pi:
```bash
sudo journalctl -u reprush-backend -n 100
tail -n 100 /var/log/reprush/frontend-error.log
```

**Port already in use** — RepRush must stay on 3100/3101; 3000/3001/3005/8000 belong to other apps:
```bash
sudo ss -tlnp | grep -E ':3100|:3101'
```

**Database backup**
```bash
cp /var/www/reprush/backend/database/reprush.db ~/reprush-backup-$(date +%Y%m%d).db
```
