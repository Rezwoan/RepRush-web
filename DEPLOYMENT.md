# RepRush — Deployment Guide

> **Live URL:** https://reprush.rezwoan.codes
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
              └── reprush.rezwoan.codes → http://localhost:80
                    └── nginx vhost (server_name reprush.rezwoan.codes)
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
cloudflared tunnel route dns 27a45beb-cb35-4793-ae4c-3ec398928907 reprush.rezwoan.codes

# 2. Add an ingress rule in /etc/cloudflared/config.yml, BEFORE the `- service: http_status:404` line:
#      - hostname: reprush.rezwoan.codes
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
| `FRONTEND_URL` | `https://reprush.rezwoan.codes` |
| `JWT_SECRET` | auto-generated 96-char hex (Pi only) |
| `JWT_EXPIRY` | `30d` |
| `RESEND_API_KEY` | Resend key for invite emails |
| `RESEND_FROM_EMAIL` | `RepRush <noreply@rezwoan.codes>` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seeded admin account |

### Frontend — `/var/www/reprush/frontend/.env.local`
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://reprush.rezwoan.codes` (baked into the build) |

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

---

## Dev / staging stack (the v2 rebuild)

A second, fully isolated RepRush runs on the same Pi for the v2 rebuild. It shares nothing with
production except the machine, nginx and the Cloudflare tunnel (both of which route by hostname).

```
dev-reprush.rezwoan.codes → cloudflared → nginx :80 (vhost reprush-dev)
                                            ├── /api/ → 127.0.0.1:3121   (reprush-dev-backend)
                                            └── /     → 127.0.0.1:3120   (reprush-dev-frontend)
```

| | Production | Dev |
|---|---|---|
| Branch | `main` | `v2` |
| Dir | `/var/www/reprush` | `/var/www/reprush-dev` |
| Ports | 3100 / 3101 | 3120 / 3121 |
| Services | `reprush-backend`, `reprush-frontend` | `reprush-dev-backend`, `reprush-dev-frontend` |
| Logs | `/var/log/reprush/` | `/var/log/reprush-dev/` |
| nginx | `sites-available/reprush` | `sites-available/reprush-dev` |
| Workflow | `deploy.yml` (push to `main`) | `deploy-dev.yml` (push to `v2`) |
| Deploy script | `scripts/deploy.sh` | `scripts/deploy-dev.sh` |
| DB | `backend/database/reprush.db` | its own copy, snapshotted on every deploy |

First-time setup (idempotent, safe to re-run):

```bash
curl -fsSL https://raw.githubusercontent.com/Rezwoan/RepRush-web/v2/scripts/pi-setup-dev.sh | bash
```

It clones `v2` to `/var/www/reprush-dev`, generates its own `.env` (fresh JWT secret, own admin
account), seeds the dev DB from a copy of production's, builds, installs the two `reprush-dev-*`
systemd units and the `reprush-dev` nginx vhost, adds the Cloudflare ingress rule and DNS record, and
restarts `cloudflared`. It refuses to run if 3120/3121 are taken by anything else.

Dev env vars — `/var/www/reprush-dev/backend/.env` and `frontend/.env.local` — mirror production's
but with `PORT=3121`, `FRONTEND_URL=https://dev-reprush.rezwoan.codes` and
`NEXT_PUBLIC_API_URL=https://dev-reprush.rezwoan.codes`. Its `JWT_SECRET` is **different**, so dev
sessions are not valid on production.

```bash
# Dev operations
systemctl status reprush-dev-backend reprush-dev-frontend
tail -f /var/log/reprush-dev/backend.log
bash /var/www/reprush-dev/scripts/deploy-dev.sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3120

# Dev DB snapshots (deploy-dev.sh keeps the last 5)
ls -1t /var/www/reprush-dev/backend/database/reprush.db.bak-*
```

> The dev vhost sends `X-Robots-Tag: noindex, nofollow`, so the rebuild stays out of search results.

**Port map on this Pi** (verified 2026-08-06): 3005 AdGuard · 3100/3101 RepRush prod ·
3110/3111 ClassMate · 3120/3121 RepRush dev · 3200/3201 hbd-samia · 5432 Postgres · 80/8080
nginx/RaspAP. Never bind anything else.
