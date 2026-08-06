# PROGRESS — RepRush v2

Single source of truth for what is done and what is next. Update it before ending every session.

**Status legend:** `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED`

**Rule:** work the phases in order. A phase is `DONE` only when both builds pass, it is deployed to
https://dev-reprush.rezwoan.codes, and its exit check below is verified in the browser.

| Phase | Title | Status |
|---|---|---|
| P0 | Dev environment & isolation | **DONE** |
| P1 | Design system, art, app shell | **DONE** |
| P2 | Data model & exercise catalog | **DONE** |
| P3 | Rank engine | **DONE** |
| P4 | Onboarding funnel | **DONE** |
| P5 | Home tab | TODO |
| P6 | Workout tab | TODO |
| P7 | Ranks tab | TODO |
| P8 | Nutrition tab | TODO |
| P9 | Friends & social | TODO |
| P10 | Profile & settings | TODO |
| P11 | Gamification glue | TODO |
| P12 | Offline & PWA hardening | TODO |
| P13 | Polish pass | TODO |
| P14 | Cutover to production | TODO |

---

## P0 — Dev environment & isolation · `DONE` (2026-08-06)

Goal: `v2` branch auto-deploys the *current* app to a fully separate stack at
dev-reprush.rezwoan.codes, with prod provably untouched.

- [x] `ssh reezz@blackbox.local 'echo ok'` — **works**, and `sudo` is passwordless. Port map surveyed
      and written into `MEMORY.md §2` (3110/3111 turned out to be ClassMate; dev moved to 3120/3121).
- [x] Create branch `v2` from `main`, push it
- [x] `scripts/pi-setup-dev.sh` — clone to `/var/www/reprush-dev`, branch `v2`, ports 3120/3121,
      `/var/log/reprush-dev`, own `.env` with a fresh JWT secret and
      `FRONTEND_URL=https://dev-reprush.rezwoan.codes`, own `frontend/.env.local`, own admin account.
      Refuses to run if 3120/3121 are held by anything else.
- [x] systemd units `reprush-dev-backend.service`, `reprush-dev-frontend.service` — both active
- [x] nginx vhost `reprush-dev` (+ `X-Robots-Tag: noindex` so the rebuild stays out of search)
- [x] Cloudflare: DNS CNAME + tunnel ingress rule added, `cloudflared` restarted.
      **Must be run as root** — see `MEMORY.md §8`.
- [x] `scripts/deploy-dev.sh` — dev dirs/ports/services only, resets to `origin/v2`, snapshots the
      dev DB (keeps 5), and asserts prod is still up at the end
- [x] `.github/workflows/deploy-dev.yml` — push to `v2`, runner `reprush`, group `reprush-dev-deploy`
- [x] Seed dev DB from a copy of prod's (942 KB, real history for testing the rank engine)
- [x] Update `DEPLOYMENT.md` and `AGENTS.md` with the dev stack; add `.gitattributes` (LF for `*.sh`)
      and gitignore `inspiration/` + `.claude/`
- [x] **Exit check — all verified:**
      - dev `https://dev-reprush.rezwoan.codes` → **200**, `/api/auth/me` → **401**, title
        `RepRush — Train. Track. Rush.`
      - prod `https://reprush.rezwoan.codes` → **200**, `/api/auth/me` → **401**, services still
        showing their pre-P0 uptime (never restarted)
      - push to `v2` → run 31080617234 green in 1m27s, touched only the dev stack
      - push to `v2` did **not** trigger the prod workflow (branch-filtered; `main`'s newest run is
        still yesterday's)

---

## P1 — Design system, art, app shell · `DONE` (2026-08-06)

- [x] Token layer extended (the existing logo-derived cobalt/volt palette was already right):
      added rank tier tokens, page wash vars, light-mode defaults
- [x] Theme engine (`lib/themes.ts`): **34** themes derived from a small seed each rather than
      hand-written CSS; `data-theme` on `<html>`, persisted, pre-paint boot script so a light theme
      never flashes dark
- [x] Chunky button family (`chunky` / `chunkyGold` / `chunkyLight` / `chunkyOutline` + `cta` size)
- [x] Core kit: Sheet (on the installed radix dialog — free focus trap + scroll lock), Segmented,
      TabBarLinks, Chip, Toggle, OptionCard, RulerPicker (h+v), WheelPicker, Ring, RingStack, Bar,
      StatTile, EmptyState, Celebration (+ `useCelebrationQueue`), Rays, Confetti, CoachMark
- [x] Art: Volt the mascot, 6 poses (hand-authored — a mascot must be original to the brand)
- [x] Art: **`Bodygraph` now renders `body-muscles` (Apache-2.0)** — 89 anatomical regions, front
      and back, left/right split, mapped onto our 21 trainable muscles. Replaced the hand-drawn
      version; see `MEMORY.md §9` for why and for the sourcing policy
- [x] Art: rank badges (7 tiers × I/II/III + locked + sheen), medals (6 emblems × 4 materials),
      equipment glyphs
- [x] App shell: 6-tab bottom nav, global top bar (avatar+level+XP, streak, currency, bell)
- [x] `prefers-reduced-motion` respected globally
- [x] **Exit check:** `/kitchen-sink` renders every primitive in every theme and runs four assert
      self-checks in the browser — all green

Caught and fixed along the way (each has a note in `MEMORY.md §8`):
- `rankValue` was not strictly monotonic at band boundaries — Gold I at 100 LP and Platinum III at
  0 LP scored identically, so a real promotion compared as "no change" and would have silently
  swallowed the rank-up celebration. **The self-check caught this on first render.**
- The global 401 interceptor bounced *every* route to `/login`, which would have thrown users out
  of the pre-auth onboarding funnel in P4.
- Picker scroll re-rendered the entire page tree per snapped tick and froze the renderer outright.
- Next.js document caching served a stale HTML shell — see the ⚠️ prod note in `MEMORY.md §8`.

---

## P2 — Data model & exercise catalog · `DONE` (2026-08-07)

- [x] Back up dev DB before the schema change — `reprush.db.bak-p2-20260807` on the Pi
- [x] Exercise catalog: `scripts/build-exercise-catalog.js` pulls
      [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) (Unlicense) at a
      pinned commit, maps its 17 muscles onto our 21 and its 12 equipment types onto our 8, adds
      rep-range/rest defaults, and writes `backend/data/exercises.json` — **873 exercises**.
      Images stay on jsDelivr (1,746 JPEGs ≈ 90 MB is not going in this repo).
- [x] Muscle taxonomy — already shipped in P1 (`frontend/src/lib/muscles.ts`, 21 muscles with `size`
      weights and recovery half-lives). The build script parses that file and asserts every muscle
      the catalog emits exists in it, so the two can't drift.
- [x] ~~New entities: `Exercise`, `Muscle`, …~~ **Reduced deliberately** — see `MEMORY.md` Decisions
      2026-08-07. The catalog is a JSON file loaded into memory, not a table; the rest of that list
      is built by the phase that first needs it, when its fields are actually known. Additive
      columns are safe under `synchronize: true`, so there is nothing to gain by guessing now.
- [x] Extend `User`: `username` (unique **index**, not a unique column — see the comment in the
      entity), `bio`, `sex`, `birthDate`, `avatarId`, `experience`, `goal`, `trainingLocation`,
      `equipment`, `limitations`. Cosmetic ids (border/banner/title) wait for P10.
      `displayName` skipped — `name` already exists.
- [x] Extend `WorkoutSet`: `exerciseId`, `rpe`, `lpAwarded`
- [x] Backfill in `SeedService.backfillExerciseIds()` — idempotent, only touches null `exerciseId`,
      logs every unmatched name with its set count
- [x] ~~Seed script for catalog + medals + quests + cosmetics~~ — the catalog needs no seeding;
      medals/quests/cosmetics belong to P10/P11
- [x] **Exit check, verified on dev:**
      - `GET /api/exercises/catalog` → 873 exercises, unauthenticated (public — P4's pre-signup rank
        flow needs it), 25 KB over the wire after Cloudflare's gzip; filters by `q`/`muscle`/`equipment`;
        `GET /api/exercises/catalog/:id` returns instructions + working image URLs
      - Backfill: **772 of 778 sets mapped**. The 6 misses are all `Core Exercise (User Choice)`,
        which has no catalog equivalent by design. A restart maps 0 more — idempotent.
      - v1 data intact after `synchronize`: 4 users, 48 sessions, 778 sets, every original column
        still present, and `username`'s uniqueness landed as a separate index (`IDX_fe0bb3f…`) with
        no table rebuild.
      - All app routes 200, authed API routes still 401 (not 500), zero ERROR lines in the backend log.
      - *Not* verified: an authenticated history page rendered in a browser. Reading the dev admin
        password off the Pi was blocked, so this was checked at the database and HTTP layers instead.
        No workouts code changed in this phase.

---

## P3 — Rank engine · `DONE` (2026-08-07)

- [x] `backend/src/ranks/e1rm.ts` — Epley, reps capped at 12, plus `effectiveLoad` so bodyweight
      movements carry the athlete instead of scoring zero. Self-check included.
- [x] `backend/src/ranks/standards.ts` — `BASE[muscle] × mechanic × equipment`, a ~28-line override
      list for the lifts people actually rank on, sex split, and a log-normal population curve
      (σ = 0.32) turning a bodyweight multiple into a percentile. Self-check with named anchors.
- [x] Age coefficient curve — flat 23–33, credit either side, capped
- [x] `RanksService`: score a lift, exercise ranks, muscle ranks, Bodyrank, weekly LP
- [x] Placements: 10 ranked exercises gate the real Bodyrank; before that it is flagged `predicted`
      and averages only what has been trained
- [x] ~~Decay job (nightly)~~ — **decay is computed at read time instead.** A stored rank plus a
      cron is a thing that can disagree with the sets; a derived one can't. Training a muscle
      restores it instantly because nothing was written down. See `MEMORY.md` Decisions.
- [x] Endpoints: `GET /ranks/me` (bodyrank + bodygraph + exercise list in one call),
      `GET /ranks/exercises`, `GET /ranks/bodygraph`, `GET /ranks/exercise/:id`,
      `POST /ranks/calculate` (public — onboarding ranks a lift before the account exists)
- [x] ~~`GET /ranks/leagues`~~ — deferred to **P7**, which builds the screen. A league needs seasons,
      divisions and ~30 rivals; there are 4 accounts on dev. Nothing else depends on it.
- [x] Recompute historical ranks from v1 sets — automatic. Ranks *are* a function of the sets, so
      there is no "recompute": the first request already reflects all 772 backfilled sets.
- [x] **Exit check — the documented ladder** (all via `POST /api/ranks/calculate`, male 25 @ 82 kg
      unless noted; self-checks green at boot: `RanksService: e1rm ok, standards ok`):

      | Lift | Rank | Percentile |
      |---|---|---|
      | Bench 60 × 5 | Silver III | 31 |
      | **Bench 100 × 5** (SPEC's worked example) | **Diamond II** | **86.5** |
      | Bench 140 × 1 | Titan I | 96.2 |
      | Bench 100 × 5, age 55 | Titan II | 93.9 |
      | Squat 100 × 5 | Gold II | 56.5 |
      | Deadlift 180 × 3 | Diamond I | 90.1 |
      | Barbell curl 35 × 8 | Gold II | 54.8 |
      | Pec deck 60 × 8 | Platinum III | 69.5 |
      | Leg extension 60 × 10 | Gold I | 60.0 |
      | Pull-up × 8 bodyweight | Gold I | 63.6 |
      | Pull-up × 1, female @ 65 kg | Diamond II | 85.5 |
      | Crunches × 40 | Gold III | 50.0 |

- [x] **Exit check, against the real v1 history on dev** (the 772 backfilled sets, read-only):
      both accounts produce a spread across tiers rather than a pile at one end — user5
      `{titan 1, diamond 1, platinum 6, gold 6, silver 8, bronze 5}` over 27 ranked exercises,
      Bodyrank **Silver III**; user6 `{diamond 1, gold 1, silver 9, bronze 18}` over 29, Bodyrank
      **Bronze II**. Both have trained 12 of 21 muscles, and the nine empty ones are what hold the
      Bodyrank down — which is the intended, honest behaviour, and exactly what the Bodygraph in P7
      will be showing them.

---

## P4 — Onboarding funnel · `DONE` (2026-08-07)

- [x] ~~Route group `/(onboarding)`~~ — **one route, `/welcome`**, with a 32-screen machine, a
      client-side answer store and localStorage resume. Not `/onboarding`: v1's route of that name
      is a *post-login* profile-completion prompt that still ships and is still linked from the
      dashboard banner. `/` now sends signed-out visitors to `/welcome`; `/login` links back to it.
- [x] Welcome splash + 4-slide value carousel (badge ladder, Bodygraph, sample plan, macros+logger)
- [x] All 20 question screens from SPEC §3.3 — mascot bubble, progress bar, back, skip. The ones
      that are only a list of options are **data** in `app/welcome/config.ts`; only the screens that
      need real UI are hand-written.
- [x] Ruler pickers (height cm/ft·in, weight kg/lb), wheel picker (age), press-and-hold commitment
- [x] Avatar picker + reveal — the mascot's six poses are the avatar set
- [x] First-rank flow: exercise carousel → weight/reps → `GET MY RANK` → rank reveal with rays,
      percentile line and share
- [x] Profile-building progress screen (three bars in sequence)
- [x] Bodyrank explainer (3 coach marks over the Bodygraph) + streak explainer
- [x] Signup at the end; one `POST /auth/register` carrying the whole payload. Public, allow-listed:
      every enum, equipment id and limitation is checked against a whitelist, height/weight against
      a range, and anything unrecognised is dropped rather than stored. `sex` in particular picks
      the strength-standards column, so junk there would mis-rank someone forever.
- [x] First medal + welcome screens
- [x] Post-signup coach-mark tour of the 6 tabs, over a real `<TabBar/>`
- [x] **The onboarding lift is stored as a real logged set.** Ranks derive from `workout_sets` and
      nothing else, so without it the funnel promised a rank and then handed over an empty Ranks tab.
- [x] **Exit check — verified on dev, in the browser, end to end:**
      - Splash → carousel → 20 questions → first rank → reveal → build → explainers → signup →
        medal → welcome → 6-step tab tour → `/dashboard`, signed in.
      - `POST /api/ranks/calculate` from the funnel returned **Silver III · 31st percentile** for
        bench 60 × 5 (male, 25, 82 kg) — the same numbers as P3's documented ladder.
      - The new account's `/api/auth/me` carries name, sex, birthDate, height, weight, avatar,
        experience, goal, training location, equipment JSON and limitations JSON.
      - `/api/ranks/me` on that account: Bodyrank **Silver III** (predicted), placements **1/10**,
        Bench Press Silver III p31, `mid_chest` tinted on the Bodygraph.
      - Rejections: duplicate email 409, short password 400, malformed email 400, blank name 400,
        junk equipment/limitation values silently dropped, junk `firstRank.exerciseId` still 201.
      - Prod 200 and untouched throughout; zero ERROR lines in the dev backend log.
      - Test accounts created during the check were deleted afterwards — dev is back to its
        2 non-admin users.

---

## P5 — Home tab · `TODO`

- [ ] For You / Friends / Discovery sub-tabs
- [ ] Today's Workout card (+ resume-session variant)
- [ ] Recovery Zone card (Bodygraph + battery + status copy) — needs P3's fatigue model
- [ ] Your Goal card + add-goal sheet (reuse v1 `goals/`)
- [ ] Last 14 Workouts stat block (volume + sparkline + trend, duration/records/calories, bodyweight)
- [ ] Discover 2×2 tile grid → Leaderboards, Social Feeds, Streak Calendar, Rank Calculator
- [ ] Friends feed + Discovery feed shells (posts land in P9; render empty states now)
- [ ] `GET /home/summary` — one endpoint, everything the tab needs, cached client-side
- [ ] **Exit check:** Home renders fully for both a new account and an account with v1 history

---

## P6 — Workout tab · `TODO`

- [ ] Builder: routine selector, filter chips (duration/difficulty/equipment/rest/split)
- [ ] Generator: recovered + lowest-ranked muscles, equipment- and limitation-aware, duration-fitted
- [ ] Target Muscles cards with per-muscle share
- [ ] Exercise list rows + overflow (swap/remove/reorder/rest)
- [ ] Exercise picker sheet (search, filter by muscle/equipment, recent, favourites)
- [ ] Active session: sticky rest timer, notes, per-exercise card, rank progress strip, set grid with
      PREV lookup, warm-up sets, green completed rows, add set, add exercise
- [ ] Rest timer: background-safe, audio + haptic on finish, skip, per-exercise override
- [ ] All writes go through the extended offline outbox — never call the API directly from a component
- [ ] Finish flow (media, caption, consumables, tag friends, bodyweight, tracker, privacy) → post
- [ ] Post-session celebration chain: XP → rank-ups (+LP) → medals → streak → summary
- [ ] **Exit check:** a full session can be logged start-to-finish with the network off, and syncs
      correctly on reconnect

---

## P7 — Ranks tab · `TODO`

- [ ] Your Rank: hero badge (greyed + predicted before placements), Placements card, Rank Standings,
      per-exercise rank list
- [ ] Bodygraph: tinted front/back, tap-a-muscle detail sheet, tier legend
- [ ] Leagues: weekly division table, promotion/demotion, season countdown
- [ ] Gallery: every badge and medal, earned vs locked with unlock conditions
- [ ] Rank-up celebration screen (reusable from P6's chain)
- [ ] Rank Calculator standalone tool
- [ ] **Exit check:** an account with v1 history shows a populated Bodygraph and a real Bodyrank

---

## P8 — Nutrition tab · `TODO`

- [ ] Bundle a trimmed open food dataset (name, brand, per-100g macros) as a seeded table
- [ ] Calorie/macro targets from profile (Mifflin-St Jeor × activity × goal), editable
- [ ] Rings header (calories remaining + P/C/F)
- [ ] Add Meal: search, recent, my foods, custom entry, portion sizing
- [ ] Recently Logged list, edit/delete
- [ ] Fold in v1 `supplements/` + `creatine/` + water
- [ ] Optional "calories burned adjusts target" toggle
- [ ] **Exit check:** a day of meals can be logged and the rings + targets are correct

---

## P9 — Friends & social · `TODO`

- [ ] Usernames (unique, claimed at signup), user search
- [ ] Friendships: request / accept / decline / remove, friend list
- [ ] Referral codes, `CLAIM REFERRAL`, referral quests with rewards
- [ ] Invite share link (Web Share API)
- [ ] Posts: created from the finish flow, privacy scopes (private / friends / discovery)
- [ ] Reactions (emoji set) + comments
- [ ] Friends feed + Discovery feed (two layouts)
- [ ] Leaderboards: scope (friends/global) × metric (Bodyrank, weekly LP, volume, streak, workouts),
      folding in v1's relative-strength / Wilks / progress-rate
- [ ] **Exit check:** two dev accounts can befriend each other, see each other's posts, react, and
      appear on a shared leaderboard

---

## P10 — Profile & settings · `TODO`

- [ ] Profile header (banner, avatar + border + crown, name, username, title hex)
- [ ] Shortcut grid (Store, Inventory, Quests, Medals, Health, Reactions, Routines, Exercises, Stats,
      Feedback)
- [ ] Cards: Memories calendar, Last 7 Days Bodygraph, Totals (duration/volume/reps × window),
      Streaks, Levels, Ranks, 6-Month Activity, Routines, Exercises, Reactions
- [ ] Reorderable card layout (`Edit Profile Layout`), persisted
- [ ] Edit Profile: avatar/picture/title/border/banner pickers, username, display name, bio, preview
- [ ] Public profile view (what friends see)
- [ ] Store + Inventory (cosmetics bought with earned currency)
- [ ] Settings tree from SPEC §9: Account, Statistics, Import Data, Units, Themes, Languages,
      Notifications, Analysis, Calendar, Other Preferences, Resources, Legal, Logout
- [ ] Keep v1 `/admin` working, moved under settings
- [ ] **Exit check:** every settings screen exists and its preference actually takes effect

---

## P11 — Gamification glue · `TODO`

- [ ] XP awards + level curve + level-up rewards + claim flow
- [ ] Currency ledger
- [ ] Streak service: day rules, freezes (earn 1 per 7 days, max 2, auto-spend), best streak,
      streak-at-risk push
- [ ] Medal engine: rules per category, tiered, evaluated post-session + nightly
- [ ] Quests: daily (3, rotating) + weekly (3), progress tracking, claim
- [ ] Notification triggers: workout reminder at usual training time, streak at risk, friend
      activity, quest expiry, rank decay warning
- [ ] Celebration queue so multiple simultaneous rewards play in a sensible order, once
- [ ] **Exit check:** completing a workout on dev fires XP → rank → medal → streak in order, and each
      reward is idempotent (no double-award on outbox retry)

---

## P12 — Offline & PWA hardening · `TODO`

- [ ] Extend `lib/offline.ts` to cover nutrition entries, reactions, quest claims, bodyweight
- [ ] Optimistic rank/XP preview client-side, reconciled with the server on sync
- [ ] Idempotency keys on every queued write
- [ ] Service worker: precache the shell, stale-while-revalidate for catalog/art, offline fallback page
- [ ] Install prompt + updated manifest/icons/splash
- [ ] Background sync where supported
- [ ] **Exit check:** airplane mode → full session + meal logged → reconnect → everything syncs once,
      with no duplicates and no lost sets

---

## P13 — Polish pass · `TODO`

- [ ] Animation and haptics pass over every interactive element
- [ ] Sound design: set complete, rest done, rank up, medal (respect the Audio & SFX settings)
- [ ] Empty states everywhere, with the mascot
- [ ] Loading skeletons; no layout shift
- [ ] Accessibility: focus rings, labels, contrast in every theme, reduced motion, screen-reader pass
      on the main flows
- [ ] Performance on the Pi: bundle audit, image/SVG optimisation, `.next/cache` reuse in CI if the
      deploy is slow
- [ ] Error boundaries + a real offline banner
- [ ] i18n scaffold with English filled in
- [ ] **Exit check:** Lighthouse PWA + a11y ≥ 90 on mobile against the dev URL

---

## P14 — Cutover to production · `TODO`

Only start when P0–P13 are all `DONE`.

- [ ] Full prod DB backup: `cp /var/www/reprush/backend/database/reprush.db ~/reprush-prod-backup-YYYYMMDD.db`
- [ ] Dry-run the v1→v2 migration against a copy of the prod DB; verify no history is lost
- [ ] Merge `v2` → `main`
- [ ] Watch the prod deploy; verify login, an existing user's history, and a full session
- [ ] Keep the dev stack alive as the ongoing staging environment
- [ ] Write `docs/v2/ROLLBACK.md`: one command to reset `main` to the pre-cutover commit, restore the
      DB backup and restart the services
- [ ] **Exit check:** reprush.rezwoan.codes runs v2, every existing account still works with its full
      history, and rollback is documented and tested

---

## Session Log

Newest entries at the bottom. One entry per session: date · phase · what shipped · what's next ·
blockers.

### 2026-08-06 — Planning
Read all 91 inspiration screenshots and the current codebase. Wrote `SESSION_START.md`, `MEMORY.md`,
`docs/v2/SPEC.md` (the distilled product spec — screenshots need never be re-read) and this file.
Chose the isolation strategy: branch `v2` + a parallel Pi stack on ports 3110/3111 at
dev-reprush.rezwoan.codes, prod untouched on 3100/3101.
**Next:** P0 — verify SSH to the Pi, create the `v2` branch, stand up the dev stack.
**Blockers:** none known. SSH access to `blackbox.local` is assumed but unverified.

### 2026-08-06 — P0 complete
Dev stack live at https://dev-reprush.rezwoan.codes, fully isolated from production: own checkout,
ports 3120/3121, systemd units, nginx vhost, JWT secret, admin account and database (seeded from a
copy of prod's). `v2` → `deploy-dev.yml` → `scripts/deploy-dev.sh` deploys on push and passed green.
Production verified untouched throughout — its services never restarted.

Two things bit us and are now written into `MEMORY.md §8`: `cloudflared tunnel route dns` needs
`sudo` (the user's cert is scoped to a different zone and fails *silently*), and a local resolver
negative-cached the pre-creation NXDOMAIN for 30 minutes, so new hostnames must be verified via
Cloudflare DoH + `curl --resolve`, not `dig`.

**Next:** P1 — design tokens and theme engine, the component kit, the hand-authored SVG art
(mascot, Bodygraph, rank badges), and the 6-tab app shell. Exit check is a `/kitchen-sink` route
rendering everything in every theme.
**Blockers:** none.

### 2026-08-06 — P1 complete
Design system, component kit, art and the six-tab shell are live on dev. `/kitchen-sink` renders
everything in all 34 themes with four green self-checks.

**Course correction, prompted by the owner mid-phase:** the art was being hand-authored without
anyone checking what already exists, which was the wrong default. Researched and adopted
`body-muscles` (Apache-2.0, 89 anatomical regions) for the Bodygraph, replacing 21 hand-drawn
blobs, and switched P2's exercise catalog from "hand-author 200 exercises" to importing
`yuhonas/free-exercise-db` (public domain, 800+ exercises **with images**) — which also reverses
the earlier "no exercise images are possible" decision. `MEMORY.md §9` now holds the sourcing
policy, what was adopted, what was evaluated and rejected, and the short list of things that stay
hand-authored on purpose.

**Next:** P2 — import the exercise catalog, extend the schema, backfill v1 history onto catalog ids.
**Blockers:** none.
**⚠️ For P14:** production still serves `s-maxage=31536000` on documents; apply the dev vhost's
`no-cache` fix at cutover.

### 2026-08-07 — P1 follow-up: animated badges and medals
Owner: *"try to find more animated and better badges/medals instead of these static boring ones."*
Correct on both counts, and the same instinct as the P1 correction: search first.

Adopted **game-icons.net** (CC BY 3.0, 4,100+ SVGs) — 23 glyphs vendored as raw path data by
`scripts/fetch-game-icons.js`. Each tier now carries its own emblem, so the ladder reads as a
picture without the label: lifting → flexed arm → biceps → laurels → crystal → cut diamond →
Thor's fist → winged emblem. Medals went from 6 hand-drawn blobs to 15 real emblems.

Motion is SMIL in the SVG: breathing halo everywhere, sheen sweep on the crest, orbiting sparks
from Gold, a rotating ray halo from Platinum, wings from Diamond, plus a framer spring entrance for
promotion moments. `animated={false}` for dense lists; `prefers-reduced-motion` is honoured.

Rejected, with reasons in `MEMORY.md §9`: LottieFiles/IconScout animated badge packs (fixed
colours, ranks 1–10, per-asset licensing), Rive (200 KB WASM + needs the Rive editor), Lottie
(same colour problem). All three lose to the one hard constraint — 8 tiers × 3 divisions × locked
is 48 states that must be tinted at runtime.

Two real bugs found and fixed on the way, both now asserted or documented:
- Branching SSR markup on `useReducedMotion` blew up hydration for anyone with reduced motion on —
  React discarded the whole root. Fixed by `lib/use-idle-motion.ts` (mount gate first).
- The winged tiers hung 13 units below the viewBox and painted over the labels beneath them. The
  badge self-check now asserts every ornament's extents stay inside the box.

Attribution obligation met: `ATTRIBUTIONS.md` plus `components/art/attribution.tsx`, rendered at
the bottom of Profile. Move it to Profile → About when P11 rebuilds that screen.

**Next:** P2 — import the exercise catalog, extend the schema, backfill v1 history onto catalog ids.
**Blockers:** none.

### 2026-08-07 — P2 complete
873 public-domain exercises are in, served from `GET /api/exercises/catalog`, and every v1 set now
carries a catalog id.

`scripts/build-exercise-catalog.js` fetches `yuhonas/free-exercise-db` at a pinned commit and does
all the vocabulary mapping ahead of time, so the running backend translates nothing. The one piece
of judgement in it — upstream has one `chest`, one `shoulders`, one `abdominals` where we have six
regions, so the split is inferred from the exercise name — is pinned down by eight anchor asserts
that block the write if the heuristic drifts. It also parses `frontend/src/lib/muscles.ts` and
refuses to emit a muscle id that file doesn't declare, so the taxonomy can't fork.

**Three things were deliberately made smaller than the plan said**, each recorded in
`MEMORY.md` → Decisions:
- The catalog is a **file in memory, not a table**. sql.js holds the whole DB in RAM and rewrites it
  on flush; 873 static rows would tax every unrelated write forever and buy nothing.
- **Images stay on jsDelivr.** 1,746 JPEGs ≈ 90 MB would dwarf the app and every Pi deploy.
- The **25-entity list shrank to what P2 and P3 use**. Entities designed for phases that don't exist
  yet get their fields guessed and then rewritten; adding columns later is the safe direction under
  `synchronize: true`, removing them is the one that loses data.

One real hazard caught before it shipped: `username` as a `unique: true` *column* would have made
SQLite rebuild the entire `users` table on the next `synchronize`. It's a separate unique index now,
which is a plain `CREATE UNIQUE INDEX` and touches no rows.

**Next:** P3 — the rank engine: e1RM, the standards table, LP/tier/division maths, muscle ranks and
Bodyrank, decay, and recomputing history from the v1 sets that P2 just mapped.
**Blockers:** none.

### 2026-08-07 — P3 complete
The ladder works: e1RM → age-adjusted bodyweight ratio → percentile on a log-normal curve →
tier/division/LP, with muscle ranks and Bodyrank stacked on top of it.

**Ranks are derived, never stored.** No `ExerciseRank`/`MuscleRank`/`LpEvent` table and no nightly
decay job, because a rank is a pure function of `workout_sets` plus the profile — a stored copy
could only ever disagree with the sets, and keeping it honest would need both a backfill and a cron.
Decay falls out of days-since-last-set at read time, so training a muscle restores it instantly.
"Recompute historical ranks from v1 sets" stopped being a task at all: the first request already
reflects all 772 sets P2 mapped.

**Three real bugs, all caught by checks rather than by luck:**
- The boot self-check refused to start the service with *"bodyweight crunches scored the 100th
  percentile"* — bodyweight movements were being discounted twice, once by the bodyweight fraction
  and again by the isolation factor. They now have their own branch, where the spread lives in the
  rep count and the 12-rep cap correctly says that unlimited crunches prove nothing.
- The isolation overrides had been written from working weights instead of e1RMs, paying out Titan
  for an ordinary lateral raise. The distinction is now stated in the file, since I got it wrong.
- Running the engine over the **real 778-set history** — the thing the synthetic anchors couldn't
  tell me — showed pec deck, seated leg curl and overhead cable extension all handing out Legend. A
  machine stack isn't a free-weight load, so isolation now scores against 0.75 of the compound
  baseline on machines and cables versus 0.4 on free weights. Two new anchors pin it.

Deferred: `GET /ranks/leagues` → **P7**, which builds the screen and needs rivals to fill a division.

**Next:** P4 — the onboarding funnel. `POST /ranks/calculate` is already public and is what step 21's
`GET MY RANK` will call.
**Blockers:** none, but see the CI note below.

**⚠️ CI is degraded — read `MEMORY.md §8` before waiting on a deploy.** Partway through this session
GitHub stopped dispatching jobs to the `reprush` runner: first pushes to `v2` created no workflow run
at all, then manual `workflow_dispatch` runs stuck in `queued` forever. The Pi side stayed healthy
throughout (`√ Connected to GitHub`, `Listening for Jobs`) while GitHub's API reported the runner
`offline`; restarting the runner service re-registered it without restoring dispatch. This looks
like a stale registration on GitHub's side, not a repo or workflow problem.

Everything in this session is deployed and verified — the last two deploys went out via the
documented manual path, `ssh reezz@blackbox.local 'bash /var/www/reprush-dev/scripts/deploy-dev.sh'`,
which resets to `origin/v2`, rebuilds both, restarts only the dev services and asserts prod is up.
Dev is at branch tip with green self-checks; prod verified 200 and untouched. Use that path next
session if CI is still dead, and don't wait on a run that will never appear.

### 2026-08-07 — P4 complete
The funnel is live at `/welcome`: 32 screens, all client-side until one `POST /auth/register` at the
end carries the whole payload. `/` now sends signed-out visitors there instead of to `/login`, and
`/login` links back — v2 is self-serve, so v1's invite-only path stops being the only door in
(`/auth/activate` still works for outstanding invites).

**It is not at `/onboarding`.** That route is v1's post-login profile-completion prompt, still linked
from the dashboard banner; the two can't share a URL. Registering through the funnel also marks v1's
checklist done, so nobody who just answered twenty questions lands on a "Profile 0% complete" nag.

The questions that are only a list of options live as **data** in `app/welcome/config.ts` — with a
module-load self-check that every step writes a field the answer store declares, and that every
option value is one `/auth/register` will actually accept. That last assert is the one worth having:
a value on the UI list but not the backend allow-list is silently dropped, which looks exactly like
an answer that never saved.

**Four bugs, and the honest thing is that only the end-to-end run in a browser found them:**
- The "already signed in? go to the dashboard" guard reacted to `user` becoming set — which is
  precisely what signup does — so the first medal, the welcome screen and the tab tour were skipped
  every time. The API said 201 and the profile was perfect; nothing but walking the funnel showed it.
- The tab tour's coach mark highlighted empty space. A transformed ancestor becomes the containing
  block for its `position: fixed` descendants, so inside the sliding step wrapper the real bottom tab
  bar laid itself out within the funnel's 512px column. Waiting for the animation to settle just
  moved the race; the two coach-marked steps now fade instead of slide, and write no transform at all.
- `Rays` painted a hard-edged square instead of a halo — `fill` sits on the `<g>`, so the default
  `objectBoundingBox` gradient faded each wedge along its own box. Fixed in the shared component,
  which means every celebration in the app gets it.
- The funnel progress bar animated *down* from full on first mount (framer needs an explicit
  `initial` width), and the vertical ruler's centre indicator covered its own tick labels.

**One thing the spec didn't say but the product needs:** the onboarding lift is now stored as a real
logged set. Ranks are a pure function of `workout_sets`, so telling someone they are Silver III on
bench press and then showing them an empty Ranks tab would have been a lie by omission. It is
best-effort — a bad exercise id logs a warning and the account is still created.

**Deliberately smaller than SPEC:** the equipment picker is over our eight catalog equipment types,
not the source app's 97-item hardware list, because eight is all the generator can filter on. The
first medal is a screen, not a stored award — P11 owns the medal engine and will grant it for real.
The mindshare / energy / relatability / has-a-plan answers are asked and shown but not persisted;
nothing in the spec reads them, and columns for phases that don't exist get guessed and rewritten.

**Next:** P5 — the Home tab. `/home` does not exist yet; the tab bar already points at it and the
tour already describes it.
**Blockers:** none. Every deploy this session went out via
`ssh reezz@blackbox.local 'bash /var/www/reprush-dev/scripts/deploy-dev.sh'` because CI looked dead.

### 2026-08-07 — CI, properly diagnosed
P3 recorded "GitHub stopped dispatching to the `reprush` runner" and P4 worked around it. Both were
half right, and the workaround was the correct call, but the note was wrong enough to mislead the
next session — so it has been rewritten in `MEMORY.md §8`.

Two separate things were happening. The runner registration really was stale for a few hours
(GitHub's API said `offline` while the Pi journal said `Listening for Jobs`) and **it cleared itself
with no further action**. Underneath that, GitHub's push-event delivery for this repo is running
badly behind: a commit pushed at 22:06 had its workflow run created at **22:36**. Checking a minute
after pushing and seeing nothing is not evidence of anything.

Both paths verified green: dispatch run 31129070516 (1m28s) and push run 31129113963 (1m30s).
`gh api repos/.../commits/<sha>/check-suites` is the reliable check — a `github-actions` suite means
the run exists or is coming. The `vercel` and `cursor` suites that sit `queued` forever belong to
apps installed on the repo and are not ours.

The manual deploy script stays the fast path; it is not a fallback for a broken CI so much as the
way to not wait half an hour.
