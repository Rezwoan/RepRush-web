# PROGRESS — RepRush v2

Single source of truth for what is done and what is next. Update it before ending every session.

**Status legend:** `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED`

**Rule:** work the phases in order. A phase is `DONE` only when both builds pass, it is deployed to
https://dev-reprush.rezwoan.codes, and its exit check below is verified in the browser.

| Phase | Title | Status |
|---|---|---|
| P0 | Dev environment & isolation | **DONE** |
| P1 | Design system, art, app shell | TODO |
| P2 | Data model & exercise catalog | TODO |
| P3 | Rank engine | TODO |
| P4 | Onboarding funnel | TODO |
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

## P1 — Design system, art, app shell · `TODO`

- [ ] Tailwind theme: CSS-variable token layer (bg/surface/elevated/border/text/primary/gold/
      success/danger/warm + 7 tier colours), dark + light
- [ ] Theme engine: `data-theme` on `<html>`, provider, persisted preference, all named themes from
      SPEC §1 defined as variable sets
- [ ] Typography scale, chunky button (`Button` variants: primary/gold/outline/ghost/danger)
- [ ] Core kit: Card, Sheet/BottomSheet, SegmentedControl, Chip, RulerPicker (vertical + horizontal),
      WheelPicker, StatTile, ProgressBar, Ring, Toggle, Avatar, EmptyState, CelebrationOverlay
      (rays + confetti + spring), CoachMark
- [ ] Art: mascot SVG with 6 poses
- [ ] Art: `Bodygraph` component — front/back SVG, ~22 addressable muscle regions, props for
      per-region colour + tap handler
- [ ] Art: rank badge SVG (7 tiers × I/II/III + locked), medal SVG, equipment glyphs
- [ ] App shell: 6-tab bottom nav, global top bar (avatar+level+XP, streak, currency, bell), safe-area
      handling, route transitions
- [ ] `prefers-reduced-motion` respected everywhere
- [ ] **Exit check:** a `/kitchen-sink` dev route renders every component in every theme

---

## P2 — Data model & exercise catalog · `TODO`

- [ ] Back up dev DB before any schema change (`cp reprush.db reprush.db.bak-YYYYMMDD`)
- [ ] Exercise catalog: vendor [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db)
      (Unlicense / public domain) — 800+ exercises with name, force, level, mechanic, equipment,
      primary/secondary muscles, instructions **and images**. Write an import script that maps its
      muscle vocabulary onto `lib/muscles.ts` and its equipment onto ours; add per-exercise
      defaults (rep range, rest) we need and it doesn't carry. **Do not hand-author exercises.**
- [ ] Muscle taxonomy matching the Bodygraph's 22 regions, with size weights for Bodyrank
- [ ] New entities: `Exercise`, `Muscle`, `Routine`, `RoutineExercise`, `ExerciseRank`, `MuscleRank`,
      `LpEvent`, `UserStats` (xp/level/currency/streak/freezes), `Medal`, `UserMedal`, `Quest`,
      `UserQuest`, `Friendship`, `Referral`, `Post`, `Reaction`, `Comment`, `FoodItem`, `MealEntry`,
      `MuscleFatigue`, `Cosmetic`, `UserCosmetic`, `UserPreferences`
- [ ] Extend `User` (username, displayName, bio, sex, birthDate, avatarId, borderId, bannerId,
      titleId, equipment[], limitations[], goal, experience, trainingLocation)
- [ ] Extend `WorkoutSet` (exerciseId FK, rpe, isWarmup already exists, lpAwarded)
- [ ] Backfill: map existing `workout_sets.exerciseName` strings onto catalog ids; log unmatched
- [ ] Seed script for catalog + medals + quests + cosmetics, idempotent, runs on boot like v1's seed
- [ ] **Exit check:** dev app boots, existing v1 history still renders, catalog queryable via
      `GET /api/exercises/catalog`

---

## P3 — Rank engine · `TODO`

- [ ] `backend/src/ranks/e1rm.ts` — Epley with rep cap + self-check
- [ ] `backend/src/ranks/standards.ts` — per-exercise coefficient table (sex-split), ratio →
      percentile, percentile → tier/division/LP + self-check on known anchor points
- [ ] Age coefficient curve
- [ ] `RanksService`: score a set, award LP, recompute exercise rank, muscle ranks, Bodyrank
- [ ] Placements: first 10 ranked exercises gate the real Bodyrank; predicted rank before that
- [ ] Decay job (`@nestjs/schedule`, nightly): LP bleed after 30 days of inactivity per muscle
- [ ] Endpoints: `GET /ranks/me`, `GET /ranks/exercises`, `GET /ranks/bodygraph`,
      `GET /ranks/exercise/:id`, `POST /ranks/calculate` (the standalone rank calculator),
      `GET /ranks/leagues`
- [ ] Recompute historical ranks from existing v1 sets on first run
- [ ] **Exit check:** a known lift (e.g. 100 kg × 5 bench at 82 kg bodyweight, male, 25) produces a
      sane, documented tier; the assert self-checks pass

---

## P4 — Onboarding funnel · `TODO`

- [ ] Route group `/(onboarding)` with a step machine, client-side answer store, resumable
- [ ] Welcome + 4-slide value carousel
- [ ] All 20 question screens from SPEC §3.3 (mascot bubble, progress bar, back, skip)
- [ ] Ruler pickers (height/weight), wheel picker (age), press-and-hold commitment
- [ ] Avatar picker + reveal
- [ ] First-rank flow: exercise carousel → weight/reps → `GET MY RANK` → rank reveal celebration
- [ ] Profile-building progress screen
- [ ] Bodyrank explainer (3 coach marks) + streak explainer
- [ ] Signup at the end; one `POST /auth/register` carrying the whole payload
- [ ] First medal + welcome screens
- [ ] Post-signup coach-mark tour of the 6 tabs
- [ ] **Exit check:** a brand-new account can be created end-to-end on dev and lands on Home with a
      populated profile, a starting rank and a medal

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
