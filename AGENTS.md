# RepRush — Agent Guidelines

> This file is for AI coding agents (Claude, Copilot, Cursor, etc.) working in this repo.
> Read it **before** making any changes. Ignoring these rules will break the live deployment.

---

## What This Project Is

RepRush is a **live PWA** at https://reprush.rezwoan.me, deployed on a Raspberry Pi
(`blackbox.local`) that **also hosts other projects**. The CI/CD pipeline deploys
automatically on every push to `main`. A broken build or a port/proxy mistake can take
down RepRush **and** affect the other apps on that Pi.

---

## Ground Truth — The Pi Setup (do not assume otherwise)

| Thing | Reality | Notes |
|---|---|---|
| Process manager | **systemd** | NOT pm2, NOT docker. Units: `reprush-backend.service`, `reprush-frontend.service` |
| Reverse proxy | **nginx** | One vhost per hostname at `/etc/nginx/sites-available/reprush` |
| Public routing | **Cloudflare Tunnel** (`cloudflared`, systemd) | Tunnel → nginx `:80`. No port-forwarding, no public IP. |
| App directory | **`/var/www/reprush`** | A git checkout of `main`. NOT `/opt/reprush`. |
| Logs | `/var/log/reprush/` | `backend.log`, `frontend.log` |
| **Backend port** | **3101** | 3001 is free locally but prod uses 3101 |
| **Frontend port** | **3100** | **3000 is taken by another project on the Pi — never use it** |
| CI runner | self-hosted, label **`reprush`** | dedicated runner for this repo only |

> Ports 80, 3000, 3005, 8000, 5432 on the Pi belong to **other projects**. Do not touch them.

---

## The Most Important Rules

### 1. Do not break the build
Every push to `main` triggers a production deploy that runs, in order:
`npm ci && npm run build` in **both** `backend/` and `frontend/`, then restarts the services.
If either build fails, the deploy fails. **Before committing, run both builds locally.**

### 2. Do not change ports
Backend is **3101**, frontend is **3100**. These are set by systemd (`Environment=PORT=...`)
and referenced by the nginx vhost. Changing `PORT` anywhere requires updating
`/etc/nginx/sites-available/reprush` and the systemd units on the Pi too. **Never set the
frontend to 3000 — that port is another live app.**

### 3. Do not change the API prefix
The backend uses `app.setGlobalPrefix('api')`. nginx routes `location /api/` → backend and
everything else → frontend. Removing/altering the prefix breaks all API calls.

### 4. Keep the frontend↔backend URL contract
The frontend calls `process.env.NEXT_PUBLIC_API_URL + '/api'`. In production this is
`https://reprush.rezwoan.me` (set in `frontend/.env.local` on the Pi, baked in at build time),
so requests go to `https://reprush.rezwoan.me/api/...` which nginx proxies to `:3101`.
Do not hardcode `localhost` in frontend code or change `frontend/src/lib/api.ts` baseURL logic.

### 5. Never commit `.env` files
`.env` / `.env.local` are gitignored (JWT secret, Resend key, admin password). The Pi keeps
its own copies at `/var/www/reprush/backend/.env` and `/var/www/reprush/frontend/.env.local`;
they survive `git reset --hard` because they are untracked. If you add a new env var:
1. Add a placeholder to `backend/.env.example` / `frontend/.env.local.example`
2. Document it in `DEPLOYMENT.md`
3. Add the real value on the Pi manually, then restart the service.

### 6. Database schema changes — be careful
TypeORM `synchronize: true` auto-migrates on startup. Adding columns/tables/entities is safe.
**Removing or renaming columns loses data.** If a change is destructive, back up first:
```bash
ssh reezz@blackbox.local 'cp /var/www/reprush/backend/database/reprush.db ~/reprush-backup-$(date +%Y%m%d).db'
```

### 7. Do not break CI/CD
`.github/workflows/deploy.yml` runs on the Pi runner (`runs-on: [self-hosted, reprush]`) and
calls `/var/www/reprush/scripts/deploy.sh`. Don't change the runner label, and don't rewrite
`scripts/deploy.sh` to use pm2/docker or `--omit=dev` (the backend build needs devDependencies).

### 8. UI / functionality freeze unless asked
Treat the current UI and features as the contract. Make the smallest change that satisfies the
request; don't refactor working components, rename props, or restyle pages as a side effect.

---

## Safe Changes (no special care)
- UI components, styles, Tailwind classes, copy
- New pages or API endpoints
- New npm packages (installed during deploy)
- New TypeORM entities (schema auto-syncs)
- Bug fixes that keep the API contract

## Risky Changes (test locally, call it out)
- Auth/JWT/cookie logic (can log everyone out)
- Removing/renaming API endpoints (frontend breaks)
- Changing/removing TypeORM fields (data loss)
- Major version bumps (NestJS, Next.js, TypeORM)
- `main.ts` CORS, `next.config.js`, ports, the API prefix

---

## Deployment Flow

```
git push origin main
  └── GitHub Actions (.github/workflows/deploy.yml)
        └── self-hosted runner on the Pi  (label: reprush)
              └── bash /var/www/reprush/scripts/deploy.sh
                    ├── git reset --hard origin/main
                    ├── backend:  npm ci && npm run build
                    ├── frontend: npm ci && npm run build
                    ├── sudo systemctl restart reprush-backend reprush-frontend
                    └── health check (backend :3101, frontend :3100) → fail job if down
```

## Stack Quick Reference

| Layer | Tech | Port | Run by |
|---|---|---|---|
| Backend | NestJS + TypeORM + sql.js | 3101 | `node dist/main.js` (systemd) |
| Frontend | Next.js 14 + Tailwind + framer-motion + PWA | 3100 | `next start -p 3100` (systemd) |
| Database | SQLite (sql.js) at `backend/database/reprush.db` | — | TypeORM auto-managed |
| Proxy | nginx | 80 | system service |
| Tunnel/DNS | Cloudflare Tunnel + Cloudflare DNS | — | `cloudflared` (systemd) |

## Manual deploy
```bash
ssh reezz@blackbox.local 'bash /var/www/reprush/scripts/deploy.sh'
```

## Key Files
```
RepRush/  (→ /var/www/reprush on the Pi)
├── .github/workflows/deploy.yml   ← CI/CD (runs on Pi runner)
├── scripts/
│   ├── pi-setup.sh                ← one-time Pi setup (idempotent)
│   └── deploy.sh                  ← what CI/CD runs each push
├── backend/  (NestJS — src/main.ts: port+CORS; src/app.module.ts: TypeORM)
├── frontend/ (Next.js — src/lib/api.ts: the axios client)
├── DEPLOYMENT.md                  ← full deployment guide
└── AGENTS.md                      ← this file
```
