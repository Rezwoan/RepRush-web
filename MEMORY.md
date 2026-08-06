# MEMORY — RepRush v2

Durable facts, infrastructure truth, conventions, and decisions already made. Read this first every
session. Append to it whenever you learn something a future session would otherwise have to
rediscover. Keep it factual and terse — plans go in `PROGRESS.md`, product detail in `docs/v2/SPEC.md`.

> Not to be confused with the auto-memory index at
> `C:\Users\Admin\.claude\projects\E--RepRush\memory\MEMORY.md`. This file is the project's own
> working memory and is the authoritative one for v2.

---

## 1. The mission

Rebuild RepRush from a personal gym log into the app in `inspiration/` — a gamified, social,
rank-driven training app. The owner supplied 91 screenshots of *Liftoff* and said "this is how I
wanted my app to be." We rebuild that product **as RepRush**, with our own art, our own palette and
our own backend. Nothing is copied from those screenshots except the product ideas.

The owner will not intervene at any point. No questions, no approvals, no resource requests. The
deliverable is a finished, deployed product.

---

## 2. Environments

| | Production (untouchable) | Dev (where v2 is built) |
|---|---|---|
| Branch | `main` | `v2` |
| URL | https://reprush.rezwoan.codes | https://dev-reprush.rezwoan.codes |
| App dir on Pi | `/var/www/reprush` | `/var/www/reprush-dev` |
| Frontend port | 3100 | **3120** |
| Backend port | 3101 | **3121** |
| systemd units | `reprush-backend`, `reprush-frontend` | `reprush-dev-backend`, `reprush-dev-frontend` |
| nginx vhost | `/etc/nginx/sites-available/reprush` | `/etc/nginx/sites-available/reprush-dev` |
| Logs | `/var/log/reprush/` | `/var/log/reprush-dev/` |
| DB | `backend/database/reprush.db` | `backend/database/reprush.db` (own copy) |
| Deploy workflow | `.github/workflows/deploy.yml` | `.github/workflows/deploy-dev.yml` |
| Deploy script | `scripts/deploy.sh` | `scripts/deploy-dev.sh` |
| CI concurrency group | `reprush-deploy` | `reprush-dev-deploy` |

Owner wrote the subdomain as `dev-reprush.rezwon.codes`; the real zone is **`rezwoan.codes`**, so the
hostname is **`dev-reprush.rezwoan.codes`**. This was a typo, not a second domain.

### Pi ground truth (do not assume otherwise)
- Host `blackbox.local`, user `reezz`. Raspberry Pi 5, arm64.
- systemd (not pm2, not docker). nginx vhost per hostname. Cloudflare Tunnel → nginx `:80`.
- Cloudflare tunnel id: `27a45beb-cb35-4793-ae4c-3ec398928907`; ingress lives in
  `/etc/cloudflared/config.yml`, new hostnames go **before** the `- service: http_status:404` line.
- Self-hosted GitHub runner, label `reprush`, one runner serving this repo. Both workflows share it
  and run sequentially — that is fine; separate concurrency groups keep them from cancelling
  each other.
- Repo: https://github.com/Rezwoan/RepRush-web (public).

### Pi port map (verified 2026-08-06 — do not bind anything not marked FREE)
| Port | Owner |
|---|---|
| 22 / 53 / 80 / 8080 / 10000 | ssh, AdGuard DNS, nginx, RaspAP, webmin |
| 3005 | AdGuard Home |
| **3100 / 3101** | **RepRush prod** (frontend / backend) |
| 3110 / 3111 | ClassMate (frontend / backend) |
| **3120 / 3121** | **RepRush dev — ours** |
| 3200 / 3201 | hbd-samia (frontend / backend) |
| 5432 | Postgres (portfolio) |
| 5252 / 5354 / 20241 / 37482 / 63816 | tailscaled, dnsmasq, misc |

Other projects on this Pi: `rezwoan-portfolio`, `classmate`, `hbd-samia`, AdGuard, RaspAP — each with
its own nginx vhost, systemd units and GitHub runner. Never touch them.

`sudo` on the Pi is **passwordless** for user `reezz`, so infra steps can be fully automated over SSH.

---

## 3. Stack (kept, deliberately)

- **Backend** NestJS 10 + TypeORM 0.3 + **sql.js** (SQLite compiled to wasm), `synchronize: true`.
- **Frontend** Next.js 14 App Router + Tailwind 3 + framer-motion 11 + next-pwa + axios + recharts.
- Auth: JWT in an httpOnly cookie, 30-day expiry, `/api/auth/me` for session.
- Writes during a workout go through the localStorage **outbox** in `frontend/src/lib/offline.ts`,
  never straight to the API. Sessions started offline get negative temp ids remapped on sync.

Decision: we do **not** swap the DB engine or the framework. A rewrite of the stack is not the ask
and would risk the live data. `ponytail:` sql.js holds the whole DB in memory and rewrites the file
on flush — fine at one-user scale; if v2 grows past ~50 concurrent users or the file past ~50 MB,
switch to `better-sqlite3` (same SQL, drop-in for TypeORM).

---

## 4. What exists today (v1 surface, as of 2026-08-06)

Backend modules: `auth`, `users`, `workouts`, `exercises`, `goals`, `achievements`, `leaderboard`,
`supplements`, `creatine`, `body-weight`, `push`, `mail`, `admin`, `seed`.

Entities: `User`, `Onboarding`, `ExercisePlan` (JSON blob of exercises), `UserPlan`, `GymSession`,
`WorkoutSet`, `PersonalRecord`, `Goal`, `Supplement`, `SupplementLog`, `CreatineLog`,
`BodyWeightLog`, `PushSubscription`.

Frontend routes: `/`, `/login`, `/onboarding`, `/dashboard`, `/workout`, `/workout/preview/[id]`,
`/workout/session/[id]`, `/workout/summary/[id]`, `/progress`, `/achievements`, `/leaderboard`,
`/profile`, `/admin`.

Seed data: a hardcoded ULPPL 5-day plan in `backend/src/seed/seed.service.ts` with per-exercise
warm-up sets, rep ranges, baseline loads and rest times. Useful as a starting routine template in
v2; the v2 exercise catalog supersedes its exercise definitions.

Notable v1 rules that must survive into v2:
- Ghost/placeholder values are a **lookup** of last session's actual numbers
  (`GET /workouts/last-values/:type`), never a prediction. No progressive-overload estimator.
- `auth-context` falls back to the cached profile when `/auth/me` fails for network reasons; only
  401/403 signs the user out. Otherwise opening offline bounces to `/login`.

---

## 5. Conventions

- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`). **No AI attribution, no
  `Co-Authored-By` trailer** — standing owner preference.
- Both builds must pass before every commit: `backend && npm run build`, `frontend && npm run build`.
- New env var → placeholder in `backend/.env.example` / `frontend/.env.local.example`, documented in
  `DEPLOYMENT.md`, real value added on the Pi by SSH, service restarted.
- Non-trivial logic ships with one assert-based self-check in the same file (`if (require.main === module)`
  for node scripts, a `__selfcheck` export otherwise). No test framework.
- Deliberate shortcuts get a `ponytail:` comment naming the ceiling and upgrade path.
- All art is hand-authored SVG under `frontend/src/components/art/`. Nothing from `inspiration/`.

---

## 6. Decisions

*(append here; newest last, each with a one-line why)*

- **2026-08-06** Build v2 on branch `v2` + a parallel dev stack on the Pi rather than a feature flag
  in prod. Why: the data model changes are too large to hide behind flags, and prod must keep
  working for real users.
- **2026-08-06** Dev DB is seeded from a **copy** of the prod DB taken at P0. Why: the rank engine
  and bodygraph need real training history to be testable; a copy can be wiped freely.
- **2026-08-06** Keep sql.js / NestJS / Next 14. Why: the ask is a product rebuild, not a stack
  rewrite; swapping either adds risk with no user-visible gain.
- **2026-08-06** No paywall, no subscriptions, no ads, no Pro tier. The inspiration app monetises;
  RepRush is the owner's own app. Cosmetics (themes, borders, banners, titles) are unlocked with an
  in-app earned currency instead of money. Why: monetisation screens exist only because Liftoff is a
  commercial product; reproducing them would be pure cost.
- **2026-08-06** No third-party food API for nutrition. Ship a bundled, trimmed open food dataset +
  manual/custom entry. Why: no API keys can be provisioned without owner intervention.
- **2026-08-06** No Strava integration, no Google sign-in, no Discord link. Why: all three need OAuth
  apps and credentials the owner would have to create. Email+password (existing) stays.
- **2026-08-06** Exercise thumbnails are equipment/muscle-derived SVG icons, not illustrated figures.
  Why: illustrated per-exercise art cannot be produced or licensed autonomously.
- **2026-08-06** Cutover to the live domain is the final phase (P14), gated on every earlier phase
  being green, preceded by a full prod DB backup, with a documented one-command rollback.

---

## 7. Open risks

- SSH to `blackbox.local` from this Windows machine is assumed to work (v1 docs use it freely). If it
  does not, all Pi-side infra (dev vhost, dev services, tunnel ingress) is blocked; code phases can
  still proceed and infra can be batched later. Test it in P0 and record the result here.
- Cloudflare tunnel ingress edit requires `sudo` on the Pi. Same fallback.
- Pi 5 build time: two Next.js builds per deploy already takes minutes. v2 is much larger — watch the
  CI job duration and, if it becomes painful, cache `.next/cache` between deploys.
- `synchronize: true` with ~20 new entities is the single biggest data-loss risk in this project.
  Every schema change on dev happens **after** `cp reprush.db reprush.db.bak-<date>`.

---

## 8. Facts learned (append as you go)

*(empty — fill in during implementation)*
