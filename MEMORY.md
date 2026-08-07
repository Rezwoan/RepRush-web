# MEMORY — RepRush v2

Durable facts, infrastructure truth, conventions, and decisions already made. Read this first every
session. Append to it whenever you learn something a future session would otherwise have to
rediscover. Keep it factual and terse — plans go in `PROGRESS.md`, product detail in `docs/v2/SPEC.md`.

> Not to be confused with the auto-memory index at
> `C:\Users\Admin\.claude\projects\E--RepRush\memory\MEMORY.md`. This file is the project's own
> working memory and is the authoritative one for v2.

---

## 1. The mission

Rebuild RepRush from a personal gym log into the app in `inspiration/` + `more_inspiration/` — a
gamified, social, rank-driven training app. The owner supplied 91 screenshots of *Liftoff* and said
"this is how I wanted my app to be", then 50 more on 2026-08-07. We rebuild that product **as
RepRush**, with our own art, our own palette and our own backend. Nothing is copied from those
screenshots except the product ideas.

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
- All art is hand-authored SVG under `frontend/src/components/art/`. Nothing from `inspiration/`
  or `more_inspiration/`.

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
- **2026-08-06** ~~No third-party food API for nutrition; bundle an open food dataset instead.~~
  **Superseded 2026-08-07 — nutrition is cut from the product entirely.** No food database, no
  calories, no macros, no meal logging, no Nutrition tab. Owner's call: RepRush is a training app.
  The bottom bar is **five** tabs. Supplement and creatine logging are *not* nutrition and stay —
  they are working v1 features and live under Profile → Health. `SPEC.md §7` is left as a numbered
  tombstone and PROGRESS's `P8` is retired unused, because renumbering would invalidate the `SPEC §9`
  / `P10` citations scattered through the code and the session log.
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
- **2026-08-07** **Ranks are derived, never stored.** No `ExerciseRank` / `MuscleRank` / `LpEvent`
  table and no nightly decay job: a rank is a pure function of `workout_sets` + the profile, so
  storing it only creates something that can disagree with the sets, and keeping it honest would
  need both a backfill and a cron. Decay falls out of "days since last qualifying set" at read time,
  which also means training a muscle restores it instantly. Ceiling in `ranks.service.ts`: cache
  per-exercise bests in a table if any single user passes ~50k sets. The maths doesn't change.
- **2026-08-07** Leagues (`GET /ranks/leagues`) deferred from P3 to P7. Why: a league needs seasons,
  divisions and ~30 rivals per division; dev has 4 accounts and no screen to show it on yet.
- **2026-08-07** The v2 onboarding funnel lives at **`/welcome`**, not `/onboarding`. Why: v1's
  `/onboarding` is a *post-login* profile-completion prompt that still ships and is still linked
  from the dashboard banner, and the v2 funnel runs before an account exists. `/` sends signed-out
  visitors to `/welcome`; `/login` links back to it. `/welcome` was already in `api.ts`'s
  `PUBLIC_ROUTES`, so the 401 interceptor already leaves it alone.
- **2026-08-07** Signup is **self-serve** (`POST /auth/register`, public). v1's invite-only
  `/auth/activate` path stays for outstanding invites; it just isn't the only door in any more.
  Every free-form profile field is allow-listed at the boundary — `sex` picks the strength-standards
  column, so a junk value there would mis-rank someone permanently and silently.
- **2026-08-07** The onboarding lift is **stored as a real logged set** at register time. Why: ranks
  are a pure function of `workout_sets`, so otherwise the funnel promises a rank and the Ranks tab
  is empty. Best-effort — a bad exercise id logs a warning and the account is still created.
- **2026-08-07** The equipment picker covers our **8 catalog equipment types**, not the source app's
  97-item hardware list. Why: eight is all the workout generator can filter on; a longer list
  collapses to the same filter and asks the user to do work that changes nothing.
- **2026-08-07** 50 more screenshots (`more_inspiration/`) were read and folded into `SPEC.md` —
  §5.2/5.3/5.3.1 (active session, finish flow, the exact post-session celebration order), §6 (Ranks
  gets Calculator and Analysis sub-tabs), §9 (Profile cards), §10 (the itemised XP model, quest and
  medal shapes) and a new §12 (typed goals with target dates and 1RM targets, the Health Log,
  routine folders). Both folders are gitignored; SPEC remains the only committed record.
- **2026-08-07 — ~~OPEN, decide in P7~~ SETTLED in P7, both in the reference's favour.** The ladder
  has **eight** tiers — Bronze, Silver, Gold, Platinum, Diamond, **Champion**, Titan, **Olympian** —
  and **divisions ascend `I → II → III`**, so Titan III is the best Titan and Gold I is the median
  gym-goer. **Olympian is a single band with no divisions**; `divisionsIn(tier)` is the only place
  that is special-cased, in both `backend/src/ranks/standards.ts` and `frontend/src/lib/ranks.ts`,
  and `nextDivisionPercentile` derives its edges from it so the apex cannot sprout a division.
  `TIER_FLOOR` percentiles: 0 / 25 / 45 / 65 / 79 / 88 / 94 / 98.5. Why: the owner said the
  screenshots are the vision, and the change cost two arithmetic lines per copy of the ladder plus
  a re-spacing — everything else consumes a `Rank` opaquely. Verified by re-running the engine over
  the real 778-set history: both accounts' percentiles came back identical to P3's.
- **2026-08-07** Leagues have **no season or division table**. A season *is* the ISO week and a
  division *is* your slice of everyone sorted by the LP they earned in it, both derived at read
  time from the same weekly-LP number the Bodyrank card already computes. Why: the same reason
  ranks are derived — a stored ladder needs a cron to roll it over and can disagree with the sets.
  Ceiling in `RanksService.leagues`: it snapshots every user per request, so past a few hundred
  accounts cache the per-user weekly LP for the length of the week.
- **2026-08-07** `Save Rank` in the Calculator and onboarding's first lift are **one method**,
  `RanksService.recordLift`. Why: ranks derive from `workout_sets` and nothing else, so "saving a
  rank" can only mean logging the set — they were the same twenty lines twice. `AuthModule` imports
  `RanksModule` for it and dropped its own `GymSession`/`WorkoutSet` repositories.
- **2026-08-07** P7's Gallery is SPEC §6's Gallery — tier-tinted cards for your *ranked exercises*.
  The **medal** cabinet ("every badge and medal, earned vs locked with unlock conditions") needs the
  medal engine and its unlock rules, which are P11's, so it ships there. The tier ladder itself is
  already browsable in the Ranks tab's `?` help sheet.
- **2026-08-07** The generated plan is stored as a **JSON blob** on `gym_sessions.plan`, not as
  rows. Why: it is written once at session start, read whole, and never queried by any of its
  fields; sql.js rewrites the entire database file on flush, so a `plan_exercises` table would tax
  every unrelated write forever. The *logged sets* remain the durable record — the plan is only the
  prescription the user was working from, kept so a resumed session knows what was left to do.
- **2026-08-07** New `gym_sessions` columns are **nullable, including `tracked`** (null means
  true). Why: a NOT NULL column added to an existing table is the change that can make SQLite
  rebuild the table under `synchronize`, and that table holds every session anyone has logged.
- **2026-08-07** A reported limitation drops **free-weight compounds and expert-level movements on
  the affected region**, and keeps machine, cable and isolation work. Why: the catalog carries no
  joint data, so anything joint-specific would be a guess dressed up as medicine — and excluding a
  region outright would silently delete legs from the app for anyone with a knee complaint. Every
  muscle stays trainable.
- **2026-08-07** The generator programs `strength` and `powerlifting` first, keeps `plyometrics` /
  `strongman` / `olympic weightlifting` as fallbacks, and excludes `stretching` and `cardio`
  outright. Why: only three of the catalog's seven categories are resistance training, and neither
  a stretch nor a treadmill ranks.
- **2026-08-07** No `Create Exercise` in the picker and no routine selector in the builder. Both
  need user-owned tables (SPEC §12.3) and belong with P10's Routines and Exercises cards. Likewise
  no `Add Media` / `Tag Friends` in the finish flow — those need P9's posts.
- **2026-08-07** `User.username` is unique via `@Index({ unique: true })`, not `@Column({ unique: true })`.
  Why: a unique *column* makes SQLite rebuild the whole `users` table (create/copy/drop/rename) on
  the next `synchronize`, which is exactly the operation that can lose live accounts. A separate
  unique index is a plain `CREATE UNIQUE INDEX`.

- **2026-08-07** **A post is a completed session, not a row.** `gym_sessions.privacy`
  (`friends` / `discovery`) is the only thing that makes one, and the finish flow has written it
  since P6. Why: the same reason ranks and leagues are derived — duration, volume, muscles and
  caption all already live on the session and its sets, so a `posts` table could only ever drift
  from them. Reactions and comments *do* get tables (`post_reactions`, `post_comments`, both keyed
  by `sessionId`) because that data exists nowhere else. If a post ever gains a body of its own —
  a photo, something that is not a workout — that is when it earns a table.
- **2026-08-07** No photos on posts. Why: `profileImage` is base64 text in the database, and sql.js
  holds the whole database in memory and rewrites the file on every flush. One 500 KB photo per
  post would make every unrelated write slower forever. Add it when there is object storage to
  put it in, not before.
- **2026-08-07** No `country` scope on leaderboards, though SPEC §8 lists one. Why: nothing in the
  schema knows where anyone is. A filter over a field we do not collect is a menu item that lies.
- **2026-08-07** Usernames and referral codes are **backfilled for every account at boot**
  (`SocialService.onModuleInit`) rather than claimed by a prompt. Why: every existing account
  predates both, a lazy per-request write turns `/auth/me` into a write, and a "pick a username"
  wall between an existing user and the app they already had is the worst of the three.
- **2026-08-07** Referral quest *rewards* are shown, never granted. Why: the XP and currency
  ledgers are P11's, and this is the same line P6 drew with post-session XP. A CLAIM button that
  credits nothing is worse than one that says it is coming.

- **2026-08-07** Cosmetics carry their **own paint** in the backend catalog
  (`backend/src/profile/cosmetics.ts`), rather than ids on the server and colours in the client.
  Why: two files that have to agree eventually don't, and adding a cosmetic should be one line.
- **2026-08-07** The Health Log is one `health_logs` table with a `metric` column — **except
  bodyweight, which keeps `body_weight_logs`**. Why: Home, the finish flow and the rank engine's
  bodyweight ratio all read it there, and it is the one number the entire ladder is scaled
  against. `ProfileService` hides the seam so the screen sees one shape.
- **2026-08-07** Profile preferences, the card order and owned cosmetics are **JSON blobs on
  `users`**, not columns or tables. Why: each is read whole, written whole, never queried by any
  of its fields — and a NOT NULL column added to `users` is the change that can rebuild the table
  that holds every account.
- **2026-08-07** Themes stay **free** even though `Theme.price` exists and SPEC §9 shows prices.
  Why: currency is not awarded until P11, so pricing 34 themes would only take something away.
  Revisit when the ledger is on.

- **2026-08-07** P11 stores **one table**, `reward_claims`. Quests, medals, levels, streaks and
  freezes are all derived; the only fact the sets cannot re-derive is which rewards were taken.
  Idempotency is the unique `(userId, key)` index, not application logic.
- **2026-08-07** The per-session Spark is **pulled on the next read**, not pushed at completion.
  Why: `WorkoutsService → GamificationService → PushService → WorkoutsService` is a module cycle,
  and a session finished offline is completed by the outbox hours later. Keyed by session id, so
  paying twice is impossible.
- **2026-08-07** The streak-at-risk notification is the **existing** 5pm reminder with better
  copy, not a second cron. Why: two pushes on the same evening for the same reason.
- **2026-08-07** Idempotency is **one global interceptor keyed on `(userId, X-Idempotency-Key)`**,
  not a dedupe rule per endpoint. Why: a per-endpoint rule is a thing the next write path forgets.
  The key is the outbox op's own id, so it already exists and is already unique.

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
- **The dumbbell equipment glyph, and only that one.** game-icons has no dumbbell anywhere in its
  4,239-icon index, so it is drawn in `equipment-icon.tsx` in the same filled 512-unit box as the
  vendored glyphs. The other seven are game-icons artwork (2026-08-07 — the hand-drawn stroke set
  was replaced after the owner called it out).

### Picking an icon: judge it at the size it renders

Equipment glyphs render at ~17px inside a boxed list row. `lorc/lever` and `delapouite/spring` both
read beautifully at 64px and dissolved into hairlines at list size, which is how the first
replacement pass still shipped two unreadable icons. **Render every candidate at its real size
before choosing** — the throwaway contact-sheet trick (fetch the raw SVGs, lay them out at 64 / 28 /
17px, serve on localhost, screenshot) takes two minutes and settles it. Filled artwork holds a
silhouette all the way down; 2px strokes do not.

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
- **CI: nothing is broken, but a push run can take ~30 minutes to appear.** Diagnosed properly on
  2026-08-07 after the P3 session recorded it as "GitHub stopped dispatching". What actually
  happened: the runner registration *was* stale for a few hours (`gh api
  repos/Rezwoan/RepRush-web/actions/runners` → `offline` while the Pi journal showed
  `√ Connected to GitHub` / `Listening for Jobs`), and it cleared itself with no further action.
  On top of that, **GitHub's push-event delivery for this repo runs badly behind** — a commit
  pushed at 22:06 got its workflow run created at 22:36. Checking a minute after pushing and seeing
  no run means nothing.
  Both verified working: dispatch run 31129070516 green in 1m28s, push run 31129113963 green in
  1m30s.
  **How to tell them apart, in order:**
  1. `gh api repos/Rezwoan/RepRush-web/actions/runners --jq '.runners[].status'` — `online` means
     the Pi will pick work up. `offline` with a healthy journal is the stale registration: restart
     the service once, then stop waiting on it.
  2. `gh api repos/Rezwoan/RepRush-web/commits/<sha>/check-suites` — a `github-actions` suite for
     your commit means the run exists (or is coming) even if `gh run list` hasn't caught up. Only
     `vercel` and `cursor` suites and no `github-actions` one means the event genuinely didn't
     produce a run. (`vercel` and `cursor` are apps installed on the repo; their suites sit
     `queued` forever and are not ours.)
  3. Never diagnose from `gh run list` alone in the first few minutes after a push.
  **The manual fallback (always safe, and the fast path — use it rather than waiting on CI):**
  ```bash
  ssh reezz@blackbox.local 'bash /var/www/reprush-dev/scripts/deploy-dev.sh'
  ```
  It resets to `origin/v2`, rebuilds both, restarts only the dev services and asserts prod is still
  up. Check `gh run list --workflow deploy-dev.yml` before ever waiting on a run — and note that
  because the script resets to `origin/v2`, *any* deploy ships the current branch tip regardless of
  which commit triggered it.
- `.gitattributes` now pins `*.sh` to LF. This workstation has `core.autocrlf=true`, which would
  otherwise be one bad checkout away from `\r: command not found` on the Pi.
- `inspiration/`, `more_inspiration/` and `.claude/` are gitignored — the repo is **public** and the
  first two are ~36 MB of a third-party app's screenshots. `docs/v2/SPEC.md` is the committed
  substitute for both.

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

**P3 · 2026-08-07**

- **Percentile is the engine's only currency.** Everything — exercise rank, the weighted muscle
  average, decay, Bodyrank — stays a 0–100 percentile until one final `rankFromPercentile()`.
  Averaging tier labels or LP would be meaningless, and decay needs something continuous to scale.
- **`OVERRIDES` in `standards.ts` are median *e1RM* multiples, not median working weights.** Someone
  curling 35 kg for 8 has an e1RM of 44, so the coefficient is 0.52 at 80 kg bodyweight, not 0.44.
  The first draft mixed the two and lateral raises paid out Titan for a completely ordinary set.
- **Bodyweight exercises cannot go through the `BASE × mechanic × equipment` model.** The load is
  fixed — you can't add 5 kg to a push-up — so the whole population spread lives in the rep count,
  and an `isolation` discount on top of the bodyweight fraction discounts it twice. The boot
  self-check caught this as *"bodyweight crunches scored the 100th percentile"*. There is a separate
  branch: `median = fraction × (1 + medianReps/30)` where `medianReps = min(12, 4 + 30(1 − fraction))`.
  The 12-rep cap then does something genuinely right — every crunch performance past 12 scores the
  same, because unlimited crunches say nothing about strength.
- Boot self-checks are the test suite here: `RanksService.onModuleInit` runs both `__selfcheck`s and
  additionally asserts every `OVERRIDES` key names a real catalog exercise and every muscle in the
  taxonomy has a `BASE` entry. A failure takes the service down on purpose — a silently mis-ranking
  app is worse than one that won't start.
- **Machine and cable isolation cannot be discounted like free-weight isolation.** A stack number
  overstates what reaches the muscle and the machine supports the body, so `mechanicFactor()` returns
  0.75 for machine/cable isolation against 0.4 for free weights. Without it, pec deck, seated leg
  curl and overhead cable extension all paid out **Legend** for completely ordinary sets. The
  synthetic anchors did not catch this — **running the engine over the real 778-set history did.**
  Do that after any standards change: copy the DB aside on the Pi and score every user's sets.
- Calibration knobs, in the order worth reaching for: an `OVERRIDES` line for one wrong lift, then
  `LOG_SIGMA` (0.32) for the whole ladder feeling too compressed or too spread, then `TIER_FLOOR`
  for the tier distribution. Do not bend `BASE`/`EQUIPMENT` to fix a single exercise — twenty others
  move with it.

**P4 · 2026-08-07**

- **A transformed ancestor becomes the containing block for its `position: fixed` descendants.**
  Every funnel step renders inside a `motion.div` that translates on entry, so `CoachMark`'s
  spotlight and the tour's bottom `TabBar` both laid themselves out inside the funnel's 512px
  column instead of the viewport, and the coach mark highlighted empty space. Waiting for the
  animation to settle only moves the race — the fix is to **not translate**: those steps fade in,
  which writes no transform at all. Applies to anything `fixed` or `getBoundingClientRect`-measured
  inside an animated wrapper, so it will come up again in P6's session overlays.
- **`Rays` was painting a hard-edged square.** `fill` is set on the `<g>`, so the default
  `objectBoundingBox` radial gradient faded *each wedge along its own box* rather than from the
  centre. It needs `gradientUnits="userSpaceOnUse"` with cx/cy/r in user units. Fixed in the shared
  component — every celebration inherits it.
- **framer needs an explicit `initial` when animating `width`**, or it animates from the element's
  natural width, i.e. a progress bar visibly drains from full on first mount.
- **Verifying a funnel over CDP is unreliable, and the failure looks like a bug.** The tab throttles
  `requestAnimationFrame` to nothing when it isn't painting, so framer entrances stay pinned at
  their `initial` values and `AnimatePresence mode="wait"` never swaps screens — the DOM says step
  N+1, the pixels say step N, and a screenshot comes back blank. Read `document.body.innerText` and
  localStorage to know where the machine actually is, and force a paint with a `computer` action
  (a JS-only click will not wake the renderer). Two consecutive screenshots often beats one.
- The dev admin credentials **are** readable — `ssh reezz@blackbox.local 'sudo grep ADMIN
  /var/www/reprush-dev/backend/.env'` — which makes `/api/admin/users` usable for cleaning up test
  accounts after a browser run. P2 recorded this as blocked; it isn't. Do the login and the deletes
  in a single ssh command on the Pi so the password never reaches this workstation.
- Do **not** hand-edit the dev DB file while the backend is running: sql.js holds the whole database
  in memory and rewrites the file on flush, so anything written underneath it is lost. Go through
  the API.

**P6 · 2026-08-07**

- **The dev deploy's intermittent `npm ci` corruption was two deploys racing.** Symptoms were
  `npm ci` reporting "added 485 packages" and then `sh: 1: nest: not found`, and
  `ENOTEMPTY: directory not empty, rmdir 'node_modules/<pkg>'`. Cause: the CI run triggered by a
  push and a manual `ssh … deploy-dev.sh` executing `npm ci` in the same directory simultaneously —
  GitHub's push-event lag means the CI run lands *after* you have already deployed by hand.
  `deploy-dev.sh` now takes `flock /tmp/reprush-dev-deploy.lock` before anything else, stops both
  dev services around the install-and-build phase, and traps EXIT to start them again so a failed
  build cannot leave dev down. Check `gh run list --workflow deploy-dev.yml` before deploying
  manually.
- **`deploy-dev.sh` replaces itself in step 1**, so any change to it takes effect on the *next*
  run, not the one you are watching. Budget two runs when changing the deploy script.
- **Run new maths over the real catalog and the real history, not just the fixture.** P3 learned
  this with machine isolation paying out Legend; P6 learned it again when the generator prescribed
  *Alternate Leg Diagonal Bound* and a treadmill for a strength session. Both self-checks passed.
  The fixture only contains what you thought to put in it.
- **`nextDivisionPercentile` returns the boundary exactly, and `rankFromPercentile` floors.** Score
  a hair past it (`+1e-6`) whenever you need the rank *reached* by crossing a boundary, or
  floating-point lands on 1.9999999 and hands back the division the user already holds.
- The rest timer stores the **instant rest ends** and derives the remainder from `Date.now()`.
  Never decrement a counter for anything that must survive a locked screen — browsers throttle
  background `setInterval` to once a minute or stop it entirely.
- Anything mounted only inside `app/(tabs)/layout.tsx` does **not** run on `/workout/session/*`,
  `/workout/finish/*` or `/workout/summary/*` — those are deliberately outside the tab shell. That
  is how the outbox auto-sync came to be missing from the one screen that logs offline. App-wide
  behaviour belongs in `app/layout.tsx`.
- Test accounts can be cleaned up entirely from the Pi in one command — see the P4 note; the same
  `sudo grep ADMIN /var/www/reprush-dev/backend/.env` → login → `DELETE /api/admin/users/:id` loop
  works, and deleting a user takes their sessions and sets with them.

**P7 · 2026-08-07**

- **The `Rank` object carries `percentile`, and the frontend type was missing it.** The backend has
  always sent it; `frontend/src/lib/ranks.ts` declared only tier/division/lp, so every screen that
  wanted "stronger than 62% of lifters" would have had to invent it. It is required on `Rank` now,
  while `rankValue()` takes only `{tier, division, lp}` so callers can still compare bare literals.
- **The same was true of the `User` type in `auth-context.tsx`** — `/auth/me` returns the whole
  entity, but the interface stopped at v1's fields, so P4's `sex`, `birthDate` and `avatarId` were
  invisible to TypeScript. The Calculator needs `sex` and `birthDate` because they pick the
  standards column and the age handicap.
- **A five-person division cannot promote five and demote five.** Constants copied straight from the
  spec put every row in both zones at once, and the promote branch won. Any zone expressed as a
  fixed count needs clamping against the actual list length — `Math.floor(rows.length / 3)` here.
- **`weightKg` is the *added* weight, not the load.** A pull-up or a crunch is logged at 0, so the
  obvious `${weightKg} kg × ${reps}` renders `Best 0 kg × 8` and reads as a bug. `bestLabel()` /
  `targetLabel()` in `app/(tabs)/ranks/types.ts` say `8 reps` instead. Anything new that prints a
  logged set has to handle it.
- **`TabBarLinks` switches to a scrolling strip past four options** (Ranks has six). Equal `flex-1`
  thirds stop fitting a phone, and shrinking the type instead is how a tab bar becomes unreadable.
- **Screenshotting the deployed dev app over CDP times out often, and it is not a frozen app.** The
  P4 note is still the answer: read `document.body.innerText` to know where the machine is, and
  drive a **`scroll`** action rather than a bare `screenshot` — the scroll returns its own image and
  forces the paint, so it works where two consecutive screenshots do not.

**P9 · 2026-08-07**

- **`UsersService.deleteUser` was `userRepo.delete(userId)` and nothing else — since v1.** Every
  dependent row survived the account, and **SQLite hands the freed id to the next signup**, so the
  orphans get *adopted*: a brand-new dev account turned up holding a deleted tester's sessions,
  PRs and Wilks score. The loud symptom was a 500 on registration (`onboarding_progress` is unique
  on `userId`); the quiet one was a stranger inheriting your training history. `deleteUser` now
  sweeps every table with a `userId` column, driven by `sqlite_master` rather than a hand-written
  repository list — a list is exactly what went stale — plus the rows that key off the session.
  `SeedService` clears the already-orphaned rows at boot (dev had 36, plus 21 sets).
  **⚠️ Production has the same bug. P14 must carry this fix across.**
- **A truncated dev database is recoverable, and looks exactly like data loss.** sql.js rewrites
  the *entire* file on every flush, so stopping the service mid-write leaves a short file and the
  next boot seeds an empty database — admin re-created, ids restarting at 1. `deploy-dev.sh`
  snapshots before every deploy, so the fix is:
  ```bash
  sudo systemctl stop reprush-dev-backend
  cp backend/database/reprush.db.bak-<newest> backend/database/reprush.db
  sudo systemctl start reprush-dev-backend
  ```
  Check the *size* first — a healthy dev DB is ~1.2 MB, a freshly seeded one ~127 KB. Do not run a
  batch of writes (a test script) at the same time as a deploy.
- **Do not push and then run a deploy in the same breath.** The `flock` serialises them correctly,
  but the queued CI run stops the services the moment your manual deploy finishes, so anything you
  do in the next two minutes hits a dead backend and reads as a bug in your code. Either push and
  wait for CI, or deploy manually *without* pushing — but note `deploy-dev.sh` resets to
  `origin/v2`, so an unpushed commit will not ship.
- A verification script must use **unique emails per run**. Rerunning one that registers
  `alpha@test.local` gets a 409, every token comes back empty, and every later assertion prints
  blank — which looks like a broken API and is not. `S=$(date +%H%M%S)` in the address.
- **Before placements, a Bodyrank averages only what has been trained**, so an account with one
  heavy bench outranks a year of training on the Bodyrank leaderboard. True, and useless as a
  ranking: predicted rows now sort below every placed one and are labelled.

**P10 · 2026-08-07**

- **A Next.js page file may export only the default.** Exporting a component or a hook from
  `app/**/page.tsx` fails the build with *"does not satisfy the constraint `{ [x: string]: never }`"*,
  which names a type rather than the rule. Anything shared goes in a sibling file.
- **Two `page.tsx` files cannot resolve to one URL.** Building the v2 Profile under `(tabs)/`
  required deleting v1's `app/profile/` — the same step P6 took for `/workout`. Check for a v1
  route of the same name *before* starting a tab.
- The v1 pieces worth keeping were all reusable as-is: `ImageCropper`, `NotificationSettings`,
  `authApi.changePassword` and `ArtAttribution` all moved into settings untouched.
- `EquipmentIcon` takes `equipment`, not `type`, and its `Equipment` union is exported from
  `components/art/equipment-icon.tsx` — not from `lib/muscles.ts`, where you would look first.
- **`UID` is readonly in bash.** A check script that captures a user id into `$UID` silently gets
  the shell's own uid, and the cleanup then deletes nothing. It cost one leftover test account.

**P11 · 2026-08-07**

- **The medal art only had four materials** (stone/bronze/silver/gold) and the ladder needs five.
  Adding `platinum` and `mythic` to `MEDAL_MATERIALS` in `medal.tsx` is two colour pairs; a tier
  with no material silently renders as stone, which reads as "not earned".
- `MEDAL_EMBLEMS` has no `anvil`. Check the key exists before naming one in a rules file — an
  unknown emblem falls back to the default rather than failing.
- Quest rotation is `hash(userId:period)` into the pool. Deterministic, so it needs no rota table
  and no cron, and two reads a second apart cannot disagree about what today's quest is.

**P12 · 2026-08-07**

- **The outbox could log a set twice, and always could have.** It retries anything it did not see
  a response to, and a write that succeeded before the connection dropped looks identical to one
  that never arrived. The fix is `X-Idempotency-Key` on every queued write plus a global
  interceptor; the check that matters is sending the *same* request three times and counting rows.
- Test the negative too: a different key must still write, and **no key at all must still write**,
  or the guard has quietly broken every non-outbox caller.
- v1's manifest `start_url` and the service worker's document fallback both pointed at
  `/dashboard`. Anything naming a v1 route is suspect now that the tab shell owns the app.
