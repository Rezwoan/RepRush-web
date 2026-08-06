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
- **2026-08-06** ~~Exercise thumbnails are equipment/muscle-derived SVG icons, not illustrated
  figures. Why: illustrated per-exercise art cannot be produced or licensed autonomously.~~
  **Reversed 2026-08-06** — this was wrong, and so was the reflex behind it. Free, openly-licensed
  assets exist for almost everything here and were not looked for before hand-authoring started.
  See §9 for the asset sourcing policy that replaces it.
- **2026-08-06** Cutover to the live domain is the final phase (P14), gated on every earlier phase
  being green, preceded by a full prod DB backup, with a documented one-command rollback.
- **2026-08-07** The exercise catalog is a **JSON file loaded into memory**, not a database table.
  Why: it is static, identical for every user, and sql.js keeps the entire database in memory and
  rewrites the file on flush — 873 catalog rows would make every unrelated write slower forever, in
  exchange for nothing. User-authored exercises get their own small table when P6 needs them.
- **2026-08-07** Exercise photos are served from jsDelivr at a pinned upstream commit, not vendored.
  Why: 1,746 JPEGs ≈ 90 MB would dwarf the app and slow every Pi deploy. Swap `IMAGE_BASE` in
  `scripts/build-exercise-catalog.js` and mirror into `frontend/public/` if offline photos ever
  matter; nothing else knows the difference.
- **2026-08-07** P2's 25-entity list was **cut down to what P2 and P3 actually use**. Why: entities
  written for a phase that hasn't been designed get their fields guessed and then rewritten. Adding
  columns is safe under `synchronize: true`; *removing* them is the data-loss operation. Building
  each entity in the phase that first needs it is strictly cheaper and strictly safer.
- **2026-08-07** `User.username` is unique via `@Index({ unique: true })`, not `@Column({ unique: true })`.
  Why: a unique *column* makes SQLite rebuild the whole `users` table (create/copy/drop/rename) on
  the next `synchronize`, which is exactly the operation that can lose live accounts. A separate
  unique index is a plain `CREATE UNIQUE INDEX`.

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

## 9. Asset sourcing policy

**Look for a free, openly-licensed asset before authoring one. Every time.**

P1 started by hand-drawing the muscle map, badges, medals and equipment icons without searching
first. That was the wrong instinct: a public-domain exercise database with 800+ exercises *and*
images exists, and so does a 89-region anatomical SVG library. Hand-authoring is the fallback, not
the default — reserve it for things that must be original to the brand or must be tinted/composed
programmatically in ways a fixed asset can't be.

### Adopted

| Need | Source | Licence | Notes |
|---|---|---|---|
| Exercise catalog | [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) | **Unlicense** (public domain) | 800+ exercises: name, force, level, mechanic, equipment, primary/secondary muscles, instructions, **and images**. Replaces the whole "hand-author 200 exercises" task in P2. |
| Muscle map | [`body-muscles`](https://www.npmjs.com/package/body-muscles) v1.0.0 | **Apache-2.0** | 89 SVG regions (40 front / 49 back), left/right split, zero deps, ~29 KB min. We use its raw `FRONT_MUSCLES`/`BACK_MUSCLES` path data, **not** its DOM renderer, so `Bodygraph` stays our own React component with our tier colours and click handling. |
| UI icons | `lucide-react` | ISC | Already installed. |
| Badge / medal emblems | [game-icons.net](https://game-icons.net) (lorc, delapouite, caro-asercion) | **CC BY 3.0** | 23 glyphs vendored as path data by `scripts/fetch-game-icons.js` → `components/art/game-icons.ts`. All 512×512, background rect stripped. Attribution obligation met by `components/art/attribution.tsx`, rendered at the bottom of Profile, and by `ATTRIBUTIONS.md`. Add a glyph by adding a line to the script's `ICONS` map and re-running it. |

### Evaluated, not adopted (and why)

- [`react-body-highlighter`](https://github.com/giavinh79/react-body-highlighter) (MIT) — good, but
  20 muscle groups with no upper/mid/lower chest split, and the spec wants sub-muscle ranks.
  Keep as the fallback if `body-muscles` goes stale.
- [Kenney](https://kenney.nl) UI Pack / Medals (CC0) — raster PNG at fixed colours. Rank badges need
  8 tiers × 3 divisions × a locked state, i.e. programmatic tinting, which is the one case where a
  fixed asset loses. Still the right source if a static badge set is ever wanted.
- **Animated badge/medal packs** — LottieFiles and IconScout both have large "ranking badges /
  medals" sets. All of them fail the same two tests: the art is authored at fixed colours (runtime
  recolouring means walking the JSON's colour arrays by After Effects layer name, which breaks on
  every asset update and re-mounts the animation on state change), and they ship rank 1–10, not
  8 tiers × 3 divisions × locked. Licensing is per-asset and mostly account-gated. Rejected.
- **Rive** (`@rive-app/react-canvas`) — the state-machine model is genuinely the best fit for
  tier transitions, but it is a ~200 KB WASM runtime and the `.riv` files have to be authored in
  the Rive editor. Authoring is a resource this project can't self-serve. Rejected.
- **Lottie** (`lottie-react`) — ~60 KB runtime, but the same fixed-colour and authoring problems.
  Rejected. Revisit only if a designer joins and the badge set stops needing 48 tinted states.

### Still hand-authored, deliberately

- **Volt, the mascot** — a mascot has to be original to the brand; a stock character is the worst
  possible thing to borrow. Stays ours.
- **Badge and medal bodies** (the crest, the heptagon, the ribbon, the ray halo) — geometry that
  has to be tinted per tier and animated per state. The *emblems* inside them are game-icons
  artwork; only the frame is ours.
- **Equipment glyphs** — small, composable, already done.

### Animation approach (decided 2026-08-07)

Badge and medal motion is **SMIL inside the SVG** (`<animate>`, `<animateTransform>`), not CSS
keyframes and not a runtime library. Reasons, in order: the art is drawn in user units and rendered
anywhere from 24px to 120px, and CSS percentage transforms resolve against a box that changes with
it; SMIL values do not. It is also zero bytes of JS and nothing to tree-shake.

Two rules that fall out of it:

1. **Never branch server-rendered markup on `useReducedMotion`.** It reads a media query the server
   can't see, so it renders `false` there — on a machine that *does* prefer reduced motion, the
   client's first render disagrees and React discards and re-renders the entire root. Use
   `lib/use-idle-motion.ts`, which gates on mount first. Anything touching only a framer
   `transition` is safe, because transitions never appear in the server HTML.
2. **Keep every ornament inside the 100×100 viewBox.** `overflow-visible` is needed for the glow,
   but ornaments that spill paint over whatever is laid out beneath them. `rank-badge.tsx`'s
   self-check asserts the extents.

### Not yet needed but pre-vetted

- [unDraw](https://undraw.co) — open licence, no attribution, recolourable to the brand hue. The
  onboarding narrative interstitials (SPEC §3.3 steps 16–17) should use these rather than anything
  drawn by hand.

## 8. Facts learned (append as you go)

**P0 · 2026-08-06**

- SSH to `reezz@blackbox.local` works with key auth, and **`sudo` is passwordless** — every infra
  step can be automated over SSH. No owner intervention is needed for Pi work.
- **`cloudflared tunnel route dns` must be run with `sudo`.** `reezz`'s `~/.cloudflared/cert.pem` is
  scoped to the **rezwoan.me** zone (`e230adaf…`); `/etc/cloudflared/cert.pem` is the
  **rezwoan.codes** zone (`7ffbd865…`). Run unprivileged, it silently creates
  `<host>.rezwoan.codes.rezwoan.me` instead of the record you asked for, and reports success.
- The argo tunnel token inside `/etc/cloudflared/cert.pem` is a working Cloudflare API token
  (base64 JSON, field `apiToken`, plus `zoneID`). Useful for verifying DNS state directly:
  `GET /zones/{zoneID}/dns_records`. Handle it only on the Pi; never copy it off the box, never
  print it, never put it in this repo (which is public).
- **DNS gotcha that cost ~20 minutes:** after creating a record, both this workstation and the Pi
  kept returning NXDOMAIN for 30 minutes, *including* queries aimed at `holly/tadeo.ns.cloudflare.com`.
  The responses had `ra` set and no `aa`, i.e. an intercepting resolver (AdGuard on the Pi / the
  upstream network) was answering and had negative-cached the pre-creation NXDOMAIN for the zone's
  SOA minimum of 1800 s. Cloudflare's DoH resolved it correctly the whole time.
  **Verify new hostnames with DoH, not `dig`:**
  ```bash
  curl -s -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=<host>&type=A"
  curl -s -o /dev/null -w '%{http_code}\n' -L \
    --resolve <host>:443:172.67.176.150 https://<host>
  ```
  `172.67.176.150` / `104.21.96.103` are the Cloudflare anycast IPs every `rezwoan.codes` hostname
  on this tunnel lands on.
- The dev stack has its **own admin account**, separate from prod's. Credentials are generated by
  `pi-setup-dev.sh` and live only on the Pi — read them with
  `ssh reezz@blackbox.local 'sudo grep ADMIN /var/www/reprush-dev/backend/.env'`. Never commit them.
- `deploy-dev.sh` snapshots the dev DB before every deploy (keeps 5) because `synchronize: true`
  migrates on service start.
- `.gitattributes` now pins `*.sh` to LF. This workstation has `core.autocrlf=true`, which would
  otherwise be one bad checkout away from `\r: command not found` on the Pi.
- `inspiration/` and `.claude/` are gitignored — the repo is **public** and those are 25 MB of a
  third-party app's screenshots. `docs/v2/SPEC.md` is the committed substitute.

**P1 · 2026-08-06**

- **`Cache-Control` on Next.js documents is a live bug, not just a QA annoyance.** Next marks
  prerendered pages `s-maxage=31536000, stale-while-revalidate`, which assumes a CDN that gets
  purged on every deploy. Nothing purges here. With no `max-age`, a browser treats it as
  "serve stale immediately, revalidate in the background" — so every visitor is one deploy behind,
  and right after a deploy the stale shell points at `/_next` chunks that no longer exist (white
  screen until a hard refresh). Fixed on dev by having nginx send `no-cache` for documents while
  `/_next/static/` keeps `immutable`.
  **⚠️ Production still has this** (`curl -sI https://reprush.rezwoan.codes/login` shows the
  1-year header). Not changed — prod is frozen until P14. Apply the same three lines to
  `/etc/nginx/sites-available/reprush` at cutover.
- Symptom to recognise: the deployed chunk on the Pi contains your change, but the browser keeps
  running the previous build. Confirm with
  `grep -o "<marker>" /var/www/reprush-dev/frontend/.next/static/chunks/app/**/*.js`; if the server
  has it, it is this. A `?cb=1` query param bypasses it for QA.
- `body-muscles` ships **no viewBox** and both figures share one small coordinate space, side by
  side: front `x 0–32`, back `x 36–69`, both `y 0–93`. Measured with `getBBox()`. Strokes are in
  those units, so a normal-looking `1.5` is ~4% of the body's width — use ~0.12.
- The tsconfig target here predates `downlevelIteration`, so spreading a `Map`'s entries
  (`[...map.entries()]`) does not compile. Use `Array.from(map.entries())`.

**P2 · 2026-08-07**

- **Non-`.ts` backend assets go in `backend/data/`, not `src/`.** `nest build` is plain `tsc`: it
  does not copy `.json` into `dist/`, so an imported catalog file would vanish at runtime. The repo
  already had the pattern — the database lives at `join(__dirname, '..', 'database', …)` — so the
  catalog is read from `join(__dirname, '..', '..', 'data', 'exercises.json')`. No `nest-cli.json`
  asset config needed.
- **free-exercise-db's vocabulary is coarser than ours in exactly three places:** it has one `chest`,
  one `shoulders` and one `abdominals` where we have upper/mid/lower chest, front/side/rear delt and
  abs/obliques. The split therefore comes from the *exercise name* (`incline` → upper chest,
  `lateral|upright row` → side delt, `oblique|twist|wood chop` → obliques, …). That heuristic is the
  only judgement in the import, so the build script asserts eight named anchor exercises land on the
  right muscle and refuses to write the file otherwise.
- Upstream also has `abductors`, which the Bodygraph has no region for — mapped to `glutes`.
  `other` (sleds, tyres) → `machine` and `foam roll` → `bodyweight`, because two more equipment
  glyphs for ~20 exercises isn't worth drawing.
- The v1 database has exactly **31 distinct `exerciseName` values across 785 sets**, so the legacy →
  catalog mapping is a hand-checked table in the build script, not a fuzzy matcher. All 31 map to
  something sensible except `Core Exercise (User Choice)`, which has no catalog equivalent by design.
  Check current names with:
  `ssh reezz@blackbox.local "cd /var/www/reprush-dev/backend && node -e \"...select exerciseName, count(*) from workout_sets group by 1\""`
- Cloudflare gzips JSON at the edge, so the 350 KB `/api/exercises/catalog` response goes over the
  wire at ~45 KB. nginx's own `gzip_types` is still commented out on the Pi — if a response ever
  needs compressing *before* Cloudflare, that's the file to edit.
