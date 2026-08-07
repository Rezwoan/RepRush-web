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
| P5 | Home tab | **DONE** |
| P6 | Workout tab | **DONE** |
| P7 | Ranks tab | **DONE** |
| P9 | Friends & social | **DONE** |
| P10 | Profile & settings | **DONE** |
| P11 | Gamification glue | **DONE** |
| P12 | Offline & PWA hardening | **DONE** |
| P13 | Polish pass | **DONE** |
| P14 | Cutover to production | TODO |

**P8 was the Nutrition tab and has been removed** — the owner cut nutrition from the product
entirely. The number is left unused rather than renumbering P9–P14, which are cited all over the
codebase and the session log.

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
      and gitignore `inspiration/` + `more_inspiration/` + `.claude/`
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
- [x] App shell: bottom tab nav, global top bar (avatar+level+XP, streak, currency, bell)
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

## P5 — Home tab · `DONE` (2026-08-07)

- [x] **The recovery model** (`backend/src/ranks/recovery.ts`) — the one piece of real new logic.
      Fatigue is counted in *hard sets*, not kilograms, decaying exponentially with a size-scaled
      48h–72h half-life. Boot self-check runs beside e1rm and standards.
- [x] For You / Friends / Discovery sub-tabs
- [x] Today's Workout card + resume-session variant. Until P6's generator exists the card names the
      muscles that generator *would* pick — recovered and lowest-ranked — so it is honest rather
      than a placeholder, and P6 inherits the shape.
- [x] Recovery Zone card — Bodygraph tinted warm by fatigue, vertical battery, status pill, and a
      sentence naming the fresh muscles
- [x] Your Goal card + add-goal sheet (reuses v1 `goals/`) + log-bodyweight sheet
- [x] Last 14 Workouts: volume + sparkline + trend label, duration / records / calories, bodyweight
- [x] Discover 2×2 tile grid
- [x] Friends + Discovery feed shells (posts land in P9)
- [x] `GET /home/summary` — one call, cached in localStorage so the tab paints instantly and offline
- [x] The v2 tab shell as a route group, so it does not collide with v1's `/workout` and `/profile`;
      `/ranks` and `/friends` get honest placeholders so no tab 404s. `/` and the funnel land on
      `/home`.
- [x] **Exit check — verified on dev, in the browser and against the API:**
      - A fresh account: readiness 100%, everything fresh, "Legs, Chest & Back" suggested, no goal.
      - The same account after 6 squat sets: quads **0.69** fatigued, the secondaries (glutes,
        hamstrings, lower back, calves) at **0.34**, readiness 86% / `ready`, quads correctly
        excluded from the suggestion, streak **1**, records **1**, volume **6,460 kg**.
      - Goal card, resume-session variant and the bodyweight sheet all render and round-trip.
      - Home rendered in a browser: Bodygraph warm on the trained legs, battery at 86%, five tabs.

Three real bugs, all caught before they shipped:
- The boot self-check **refused to start the backend** — correctly. Chasing it down showed the
  constant was wrong, not the assertion: six sets of squats read as 31% fatigued, so the app would
  have offered you legs an hour after leg day. Capacity is no longer scaled by muscle size (the
  half-life already models that) and is now *derived* from the two promises the model makes, so they
  hold by construction.
- `logSet` never wrote `exerciseId`, so **every newly logged set was invisible to ranks and
  recovery**. P2 backfilled the history and then new rows went in the same broken way. Fixed once in
  `logSet`, where every caller routes through.
- The volume sparkline drew backwards — sessions finishing in the same second come back unordered,
  so reversing the query's order was not the same as oldest-first.

---

## P6 — Workout tab · `DONE` (2026-08-07)

- [x] **The generator** (`backend/src/workouts/generator.ts`) — the one piece of real new logic.
      Recovered + lowest-ranked muscles, round-robin so a short session still touches everything the
      Target Muscles cards promised, equipment- and limitation-aware, fitted to the requested
      duration. Pure maths with a boot self-check beside e1rm/standards/recovery.
- [x] Recovery moved from `HomeService` to `RanksService`. The Recovery Zone card and the generator
      disagreeing about which muscles are fresh would read as a bug in both.
- [x] `standards.ts` gains the **inverse** of the population curve (Acklam's normal inverse) and
      `nextDivisionPercentile`, which is what the rank strip needs to name the exact set that
      promotes you.
- [x] Builder: duration / difficulty / regenerate chips, Target Muscles cards (mini Bodygraph with
      the muscle lit + its share), exercise rows with swap / remove / reorder / rest, floating
      `Start Workout`. ~~Routine selector, split and equipment chips~~ — routines are SPEC §12.3 and
      belong with P10's Routines card; the equipment filter is a profile setting the generator
      already reads, so a chip that duplicates it is a second place to be wrong.
- [x] Exercise picker sheet over the cached 873-exercise catalog: search, sort chips
      (Alphabetical / By Rank / Performed / Muscle), muscle-group and equipment filters, tier badge
      and set count on lifts the user has ranked. ~~Create Exercise~~ — user-authored exercises need
      their own table; deferred to P10 with the rest of the profile-owned data.
- [x] Active session: sticky header (elapsed → blue `REST mm:ss`), notes, per-exercise card with
      collapse and overflow, **rank progress strip** (`TO NEXT RANK 102.5×7` + progress bar), set
      grid `SET | PREV | KG | REPS | ✓`, PREV as a lookup of last session, warm-up rows marked `W`,
      whole-row green on completion, add set, add exercise, Tracker Settings sheet, How-to-Log sheet.
- [x] **Custom keypad**, not the OS keyboard: ±2.5 / ±1 steps, digits, `.`, backspace, duplicate
      previous set, plate calculator ("Per side: 25 + 15 kg on a 20 kg bar"), `NEXT`, and the blue
      "log the total weight" banner. Self-checked plate maths.
- [x] Rest timer: **background-safe by construction** — it stores the instant the rest ends and
      derives the remaining seconds from `Date.now()`, so a locked phone cannot drift it. Persisted
      to localStorage, synthesised WebAudio chime + vibration on finish, docked mini-bar with +30s
      and skip that survives leaving the session screen.
- [x] Every write goes through the extended outbox, now carrying `exerciseId`, `rpe`, the plan and
      the finish payload. `completeSession` is idempotent — a replayed completion cannot stretch the
      recorded duration.
- [x] Finish flow: caption, consumables link, bodyweight, Tracker toggle, Post in Discovery,
      privacy accordion, confirm dialog. ~~Add Media, Tag Friends~~ — both need P9's posts, and a
      control that opens nothing is worse than one that is not there yet.
- [x] Post-session chain: Summary (confetti, duration / records / XP) → Ranking (per-exercise badge
      + LP bar) → Streak → Your Progression (seven-flame week, itemised XP breakdown per SPEC §10).
      Medals and Level Up are P11's — it owns the medal engine and the XP ledger, so the chain is a
      list of steps they drop into. XP is computed and shown, never *awarded*, and the copy says so.
- [x] **Exit check — verified on dev, in the browser:**
      - Boot self-checks green: `e1rm ok, standards ok, recovery ok, generator ok`.
      - Builder → tracker → keypad → green row → rest timer → finish → four-step chain, end to end.
      - The rank strip's prescription **actually promotes**: bench at Diamond II p86.5 was told to
        beat 102.5×5; `POST /ranks/calculate` on exactly that set returns Diamond I p88.1.
      - Generator respects equipment (`?equipment=bodyweight` returned only bodyweight movements),
        duration (30 min → 2 exercises / 28 min; 60 min → 4), difficulty (2 vs 4 sets per exercise),
        and stopped offering quads once they had been trained.
      - **Offline:** with XHR and fetch blocked, a session started (temp id `-1786093663020`), three
        sets logged and rendered green, outbox held `startSession + 3 × logSet`. On reconnect the
        queue drained to 0, the temp id mapped to real id **69**, and the server had the session
        with its stored plan and exactly three sets — no duplicates, nothing lost.
      - Prod 200 and untouched throughout. Test accounts deleted; dev is back to its 2 real users.

Four real bugs, all found by running it rather than by reading it:
- **The generator prescribed box jumps and a treadmill.** The catalog is 873 exercises across seven
  categories and only three are resistance training; nothing filtered on that, so a 60-minute
  strength session came back as *Alternate Leg Diagonal Bound*, *Backward Drag* and *Box Jump* —
  all legitimate quad exercises, none loadable, so every weight field was blank and the rank engine
  had nothing to score. The synthetic fixture could not catch it because it had no categories; it
  has them now, named so the wrong answers sort first alphabetically.
- **The rank strip named the division you were already in.** `nextDivisionPercentile` returns the
  boundary exactly and `rankFromPercentile` floors, so at 87.333 the multiply-by-three landed on
  1.9999999. The self-check's ladder walk missed it because it compared `rankValue`, which rises
  inside a division too.
- **A session logged offline never synced on reconnect.** `startAutoSync` was only ever called by
  `OfflineBanner`, which lives inside the tab shell — and the active session screen is deliberately
  outside it. The one screen where offline logging actually happens was the one with no reconnect
  listener. Now mounted in the root layout, plus a 30s retry, because `online` does not fire when
  gym wifi stays associated but stops routing.
- **Typing a weight blanked the reps ghost.** Focusing the kg column creates a draft whose `reps` is
  `''`, read with `??`; a row about to log 7 reps displayed `100 / —`. The value logged was always
  right, which is worse — the row lied about it.

---

## P6 addendum — equipment icons (owner-prompted, 2026-08-07)

Owner: *"fix the equipment icons, these looks shit."* Correct, and the same instinct as the P1 and
badge corrections: **search before drawing.** The originals were hand-drawn 2px strokes in a 32-unit
box that went spindly and characterless at the ~17px they actually render at inside a list row.

Replaced with filled game-icons.net artwork (CC BY 3.0, already vendored), chosen by rendering every
candidate at 64 / 28 / 17px and picking on silhouette rather than on how it looked large —
`lorc/lever` and `delapouite/spring` both read beautifully at 64px and dissolved into hairlines at
list size, so machine is `lorc/gears` and band is `delapouite/bouncing-spring`. game-icons has no
dumbbell anywhere in its 4,239-icon index, so that one stays hand-authored, redrawn as filled shapes
in the same 512-unit box. A self-check asserts every equipment type resolves to a real glyph.

---

## P7 — Ranks tab · `DONE` (2026-08-07)

- [x] **The two open ladder decisions are settled — the ladder now matches the owner's reference.**
      Eight tiers: Bronze → Silver → Gold → Platinum → Diamond → **Champion** → Titan →
      **Olympian**, where Olympian is a single apex band with no divisions. Divisions **ascend**
      `I → II → III`, so Titan III is the best Titan. `divisionsIn(tier)` is the one place the apex
      is special-cased, and `nextDivisionPercentile` derives its edges from it, so the two cannot
      disagree. New `TIER_FLOOR`: 0 / 25 / 45 / 65 / 79 / 88 / 94 / 98.5.
- [x] Champion's emblem is `lorc/crown`, already vendored — no new asset needed. Olympian keeps the
      winged emblem and the old Legend cyan; Champion is magenta (`--tier-champion`).
- [x] Your Rank: hero badge (greyed + `Predicted Rank` before placements), rainbow-bordered
      Placements card with ten hexes, Rank Standings tiles, per-exercise list with LP bar and
      percentile
- [x] Bodygraph: front/back tinted by each muscle's own tier, tap-a-muscle sheet (rank, LP, decay,
      contributing exercises, `Train this`), scrollable tier legend
- [x] Leagues: `GET /ranks/leagues` — weekly division table, promotion/demotion zones, season
      countdown. **No season or division table**: a season *is* the ISO week and a division *is*
      your slice of everyone sorted by the LP they earned in it. Deferred from P3 for exactly this
      screen.
- [x] Gallery: search + tier filter over your ranked lifts, two-up tier-tinted cards with badge,
      Kg/Reps boxes and an LP bar — SPEC §6's Gallery.
      ~~every badge and medal, earned vs locked~~ — the *medal* cabinet needs the medal engine and
      its unlock conditions, which are P11's. The ladder itself is browsable now: the `?` help sheet
      renders all eight tier badges beside the rules.
- [x] Rank Calculator: exercise carousel + picker, weight/reps rulers, **`Save Rank`** toggle
      (`POST /ranks/record`), result card with rays and LP bar, localStorage Calculator History
- [x] ~~Rank-up celebration screen~~ — `components/ui/celebration.tsx` already is one and P6's
      post-session chain already uses it. Writing a second would be two things to keep in step.
- [x] Analysis: Average Ranks per catalog category (averaged server-side, where the ladder lives),
      Predictions with the same prescription the session's rank strip shows, Statistics with a
      Su–Sa rank-up week row, and a tier Rank Distribution donut filterable by muscle group
- [x] `GET /ranks/me` now also carries `next` per exercise, `rankUps` and `categories`, so the four
      data-driven sub-tabs are one request between them
- [x] **Exit check — verified on dev, in the browser and against the API:**
      - Boot self-checks green: `e1rm ok, standards ok, recovery ok, generator ok`. Zero ERROR lines.
      - **The real v1 history, both accounts, unchanged in shape:** user5 27 ranked exercises
        `{champion 1, diamond 1, platinum 6, gold 6, silver 8, bronze 5}`, Bodyrank **Silver I**
        (p31.5, placements 10/10, 12/21 muscles, 72 rank-ups); user6 29 exercises
        `{diamond 1, gold 1, silver 9, bronze 18}`, Bodyrank **Bronze II** (p12.7). Identical
        percentiles to P3 — only the labels moved, which is what a relabelling should do.
      - A fresh account with 13 recorded lifts: placements 10/10, `predicted` false, Bodyrank
        **Gold I** p45.1, 11/21 muscles lit on the Bodygraph, donut across four tiers.
      - Bench 100×5 @82 kg male 25 → **Diamond III p86.5** — P3's worked example, same percentile.
        Its `next` is `102.5×5 → Champion I`, i.e. crossing a tier boundary, named correctly.
      - Calculator: bench 60×5 → **Silver I, 31st percentile, est. 1RM 70 kg**; history recorded.
      - `POST /ranks/record`: 201 on five real lifts, **400** on `reps: 0`, **404** on a junk
        exercise id.
      - Leagues: season `2026-W32`, resets in 2d 12h, five rows, `YOU` highlighted.
      - Prod 200 and untouched throughout. Test accounts deleted; dev is back to its 2 real users.

Two real bugs, both found by looking at the deployed screen rather than the code:
- **Every row in the league table showed a promotion chevron.** `promoteTop` and `demoteBottom` were
  flat 5s, so in a five-person division every row was in both zones at once and promote won the
  ternary. Each zone is now capped at a third of the table, and the copy drops out entirely when the
  division is too small for either.
- **`Best 0 kg × 8`.** A pull-up is logged with `weightKg` 0 — that is the *added* weight, not the
  load — so the obvious template read as a bug on every bodyweight lift. `bestLabel` / `targetLabel`
  say `8 reps`, and the Gallery card shows `BW` instead of `0 KG`.

One deliberate deletion: signup's `recordFirstLift` and the Calculator's `Save Rank` were the same
twenty lines, for the same reason — a rank you show but never store a set for evaporates. They are
now one method, `RanksService.recordLift`, and `AuthModule` imports `RanksModule` instead of
carrying its own repositories.

---


## P9 — Friends & social · `DONE` (2026-08-07)

- [x] **A post is a completed session, not a row.** `gym_sessions.privacy` (`friends` /
      `discovery`) is what makes one, and it has been written by the finish flow since P6. Same
      call ranks (P3) and leagues (P7) made: a copy of the session could only ever drift from the
      sets it describes. The three new tables carry data the session genuinely does not have —
      `friendships`, `post_reactions`, `post_comments`.
- [x] Usernames: `User.username` claimed at signup (allow-listed `^[a-z0-9_]{3,20}$`, 409 on a
      taken one, derived from the name when left blank) and **backfilled for every existing
      account at boot**, so search finds v1 users without a migration or a nag screen.
- [x] `GET /social/search?q=` — username or name, with the friendship status per hit
- [x] Friendships: `POST /social/friends/:id` (auto-accepts if they already asked — otherwise two
      people who both tap Add deadlock), `/accept`, `/decline`, `DELETE`, `GET /social/friends`
      returning friends + incoming + outgoing with each person's Bodyrank
- [x] Referrals: `User.referralCode` (unique index, backfilled), `GET /social/referral` with the
      invite link and the 1/3/5 quests, `POST /social/referral/claim` — claiming also opens a
      friend request, and `/welcome?ref=CODE` carries the code through the whole funnel.
      ~~Reward claim~~ — XP and currency ledgers are P11's; the quests show progress and the
      reward, and say so. A CLAIM button that credits nothing is worse than one that waits.
- [x] Invite share link via the Web Share API, clipboard fallback
- [x] `GET /social/feed?scope=friends|discovery` — cursor-paged, privacy enforced in exactly one
      place (`assertVisible`), which every read *and* write route goes through
- [x] Reactions (🔥 💪 👏 😤 🐐, one per user, tap again to clear) + comments with delete
- [x] Friends feed + Discovery feed on Home, Discovery offering the two-up grid (SPEC §4), layout
      remembered
- [x] `GET /social/leaderboard?scope=&metric=` — 8 metrics × 2 scopes: Bodyrank, LP this week,
      volume (30d), streak, workouts, plus v1's relative-strength / Wilks / progress-rate folded
      in as metrics rather than rewritten. **No country scope** — nothing in the schema knows
      where anyone is, and a filter over a field we do not collect is a menu item that lies.
- [x] The streak rule is now one exported function shared by Home and the leaderboard. Two
      implementations of "how long is your streak" is a bug the user sees before we do.
- [x] **Exit check — verified on dev against the API, end to end:**
      - Signup claims a username; duplicate → **409 "That username is taken"**, malformed → **400**.
      - Referral: code `8K8RYV`, link `/welcome?ref=8K8RYV`, beta claimed it → quest 1/1 done,
        second claim **400**, junk code **404**.
      - Search found beta with status `incoming` (the claim had opened the request), accept →
        `accepted`, friend list carries the rank; adding yourself **400**.
      - Two sessions posted (alpha `friends`, beta `discovery`): beta's friends feed showed both
        with volume, sets, PRs and the trained muscles; alpha's discovery feed showed only beta's.
      - **Privacy:** a third account saw **0** friends-feed posts, **1** discovery post, and got
        *"You cannot see this post"* on both reading and reacting to the friends-only one.
      - Reactions: 🔥 → switch to 💪 → tap again clears; unknown emoji **400**. Comment posted and
        counted; blank comment **400**.
      - All 8 leaderboard metrics returned sensible orders; friends scope returned exactly the two
        friends with `you` set. Predicted Bodyranks sort below every placed one.
      - The two real v1 accounts kept all 24 workouts each and got usernames.
      - Test accounts deleted afterwards, and their posts went with them (discovery back to 0).

---

## P10 — Profile & settings · `DONE` (2026-08-07)

- [x] Profile header: banner + avatar with its cosmetic border + level pip, display name,
      username, title hex. Rendered by one `ProfileHeaderCard` that Edit Profile reuses as its
      live preview — a preview that can disagree with the thing it previews is worse than none.
- [x] Shortcut grid (2 × 5): Store · Inventory · Quests · Medals · Health · Reactions · Routines ·
      Exercises · Stats · Feedback. Quests, Medals and Reactions are honest "coming with P11"
      screens rather than dead tiles.
- [x] Cards, all real data from one `GET /profile/me`: Memories (14 days, each trained day drawn
      as a mini Bodygraph of what was worked), Last 7 Days (Bodygraph tinted by *volume*, in blue
      — the Recovery Zone's amber means something else), Totals (Duration | Volume | Reps over a
      7 / 30 / 180 / 365-day window), Streaks, Levels, Ranks, 6-Month Activity, and the Routines /
      Exercises / Reactions counters.
- [x] `Edit profile layout` reorders the cards and persists through `PATCH /profile`. Unknown
      cards are dropped and new ones appended, so a card added later still appears for someone who
      reordered before it existed.
- [x] Edit Profile: avatar picker (the mascot's six poses), picture upload through v1's existing
      cropper, and title / border / banner pickers over what you own. **Ownership is checked
      server-side** — equipping something unowned is the one cheat this screen could enable.
- [x] Public profile at **`/u/:username`** — outside the tab shell and `@Public()`, because a
      profile link has to open for someone who is not signed in.
- [x] Store + Inventory over one cosmetic catalog (`backend/src/profile/cosmetics.ts`) that
      carries its own `paint`, so the client has no parallel table of gradients to keep in step.
      Buying spends the earned currency; **P11 awards it**, so balances start at 0 and the screen
      says so.
- [x] Settings tree: Account (password change), Referrals, Statistics, Health, Units, Themes,
      Notifications (v1's push component), Analysis, Calendar (with a live preview month), Other
      Preferences (app layout, haptics, audio, rest alert), About + attributions, Admin for
      admins, Logout. Every preference round-trips through an allow-list — an unknown key is
      dropped rather than stored.
- [x] **Health Log (SPEC §12.2)** — one `health_logs` table with a `metric` column for eleven
      measurements, plus a chart and entry list. **Bodyweight deliberately still writes
      `body_weight_logs`**: Home, the finish flow and the rank engine's bodyweight ratio all read
      it there, and moving it would be a migration on the one number the whole ladder is scaled
      against. The service hides the seam, so the screen sees one shape.
- [x] **Routines and folders (SPEC §12.3)**, and **Create Exercise**, both deferred here from P6.
      Deleting a folder keeps its routines — deleting a drawer is not deleting what was in it. A
      user-authored exercise is emitted in the *catalog's* shape with a `custom:` id, so the
      picker, the generator and the rank engine need to know nothing about it.
- [x] v1's `/profile` page retired — two routes cannot answer to one URL. Its useful parts (image
      cropper, password change, notification settings, art attribution) live on inside settings.
- [x] **Exit check — verified on dev against the API:**
      - `GET /profile/me` on a fresh account: 10 cards, 14 memory days, 26 activity weeks, level 1,
        Rookie title, 0 currency.
      - Edits: name and bio saved; malformed username **400**, taken username **409**, unowned
        cosmetic **400 "You do not own that yet"**, unknown cosmetic **400**; card order persisted;
        preferences saved `units: imperial` and `haptics: false` while **silently dropping** an
        invalid `weekStart` and an unknown key.
      - Store: three free cosmetics owned from the start, buying without currency **400**, junk id
        **404**, re-buying **400**.
      - Health: bodyweight landed in `body_weight_logs` (`GET /body-weight/history` shows it),
        waist in `health_logs`; unknown metric and negative value both **400**; delete works.
      - Routines: folder → routine inside it → deleting the folder left the routine loose;
        unnamed routine **400**. Custom exercise came back as `custom:1` in catalog shape;
        unknown muscle **400**.
      - Public profile of a real v1 account: Rezwoan, 24 workouts, silver Bodyrank, best streak 4 —
        read **without a token**. A missing handle **404s**.
      - `/`, `/home`, `/workout`, `/ranks`, `/friends`, `/profile` all 200 on dev; prod 200 and
        untouched. Test account deleted.

Deliberately not built here, and why:
- **Quests, Medals, Reactions cards and level-reward claiming** — all need P11's engines. The
  screens exist and say what they are waiting for.
- **Theme prices.** `Theme.price` has existed since P1 and SPEC §9 shows priced themes, but the
  currency is not awarded until P11; gating 34 themes behind a balance nobody can earn would make
  the app worse today than it is. Themes stay free until P11 turns the ledger on.
- **Import Data, Leave a Review, Request a Feature, FAQ, Contact Us** — each is a link to
  something that does not exist (a store listing, a form backend). A settings row that opens
  nothing is worse than one that is not there.

---

## P11 — Gamification glue · `DONE` (2026-08-07)

- [x] **`reward_claims` is the only thing this phase stores.** Which quests you have is a hash of
      (user, day); a medal is a threshold over your own history; the streak and its freezes are a
      walk over your training days. All of it re-derives from the sets — the one fact that cannot
      is *what you have already taken*, because the quest rolls over at midnight and the currency
      has been spent. The unique `(userId, key)` index is what makes claiming idempotent.
- [x] XP: training XP (the same itemised model the post-session chain shows) plus claimed XP.
      Level curve in `backend/src/profile/xp.ts`, first level 522 XP, self-checked at the
      boundary.
- [x] Currency (**Spark**): `sessionSpark = 20 + min(10, streak)`, **pulled rather than pushed**.
      `WorkoutsService` does not call gamification — that would be a module cycle, and a session
      finished offline is completed by the outbox hours later. It is paid on the next read, keyed
      by session id, so a replayed completion cannot pay twice.
- [x] Streak with freezes (SPEC §10): one earned per 7 unbroken days, max 2 banked, auto-spent to
      cover a single missed day, and a broken streak banks nothing. Nine assertions in
      `rules.ts` — the boundary cases are exactly where a freeze would silently pay for two days.
- [x] Medal engine: five categories × five tiers (Total Workouts, Total Volume, Level Up!,
      On Fire!, Quest Master), earned tiers in their material, the next greyed, the rest `?`. Two
      new materials in `medal.tsx` so a five-tier ladder has five looks. `Your Display` equips
      three onto the profile.
- [x] Quests: one daily + three weekly, rotating deterministically per user per day/week, plus
      P9's referral quests — whose `CLAIM` buttons are now real. Countdowns derive from the clock.
- [x] Level rewards, claimable once reached.
- [x] **Fixed after the phase closed:** `measure()` returned a hardcoded `rankUps: 0`, so the
      weekly *Rank up once* quest sat at 0/1 forever and its reward could never be claimed. The
      rank engine already records the instant each band is crossed, so the quest counts those,
      windowed by day and ISO week like every other metric. Verified on dev: three progressively
      heavier benches took `rankUps` 0 → **3**, matching `GET /ranks/me`.
- [x] Notification trigger: the **existing** 5pm reminder is streak-aware now
      (`"3 day streak at risk"`, and it mentions a freeze if one is banked). A second nightly cron
      would have meant two pushes on the same evening for the same reason.
- [x] ~~Celebration queue~~ — `components/ui/celebration.tsx` already has `useCelebrationQueue`
      from P1, and P6's post-session chain already uses it. Writing a second is two things to keep
      in step.
- [x] **Exit check — verified on dev against the API:**
      - Boot self-checks green: `GamificationService: streaks ok, medals ok, quests ok`.
      - A fresh account: level 1, 0 Spark, empty streak, one daily quest, three weekly, five medal
        categories at zero.
      - Claiming an unfinished quest **400 "Not finished yet"**; a junk key **404**.
      - After one 14-set session: **+21 Spark** (20 + 1 streak), streak 1, the daily quest
        complete, `Total Workouts` at tier 1.
      - **Paid exactly once:** two further reads awarded 0 and the balance stayed 21; replaying
        the completion left it at 21.
      - Claiming the finished quest: 21 → **26 Spark**, XP rose, the row went `claimed`; claiming
        again **400 "Already claimed"** and the balance did not move.
      - Medals: equipping two stuck, a junk id was dropped, four ids were capped at three.
      - The Spark reached the Store (26), and an unaffordable purchase **400 "Not enough
        currency"**.
      - Prod 200 and untouched. Test accounts deleted.

---

## P12 — Offline & PWA hardening · `DONE` (2026-08-07)

- [x] **Idempotency keys on every queued write.** A request that reached the server, wrote its
      row and then lost the response looks exactly like one that never arrived — so the outbox's
      retry could log a set twice. Every queued write now sends `X-Idempotency-Key` (the op's own
      id) and a **global** `IdempotencyInterceptor` refuses to run the handler again for the same
      `(userId, key)`. One guard at the boundary, not a rule per endpoint, because the next write
      path added would forget to add one. Keys are swept after 30 days, lazily, with no cron.
- [x] Outbox extended to **reactions, quest claims and bodyweight**. The finish flow's bodyweight
      was a fire-and-forget POST that silently dropped the entry for anyone finishing offline —
      the exact user that screen exists for.
- [x] Reactions collapse in the queue (only the newest one per post matters) and claims dedupe
      before they are even sent.
- [x] Service worker fallback fixed: it pointed at v1's `/dashboard`, which no longer exists as
      the app's shell. Manifest `start_url` moved to `/home`, plus app shortcuts for Workout and
      Ranks.
- [x] Install prompt — `beforeinstallprompt` is caught and offered as a settings row. It has to
      be captured when the browser fires it; there is no way to ask for it later.
- [x] **Exit check (idempotency), verified on dev:**
      - The same `logSet` sent three times with one key → **1 set**. A second key → 2. No key at
        all → 3, so nothing else broke.
      - The same bodyweight write twice with one key → **one entry**.
      - Another account reusing the identical key → **their write went through**, so keys are
        scoped per user.
      - Session completion replayed with one key left the Spark award at 21.

- [x] A real **`/offline` page**, and the service worker falls back to it. It previously fell back
      to `/home`, which is worse than an error page in one specific way: it renders a *stale*
      dashboard as though it were live. The new one says what is true — nothing is lost, N changes
      are waiting — and offers a flush.
- [x] The five tab routes and `/offline` are **precached**, not cached on first visit. Someone who
      installs the app and walks into a basement gym has typically opened two of them.
- [x] ~~Optimistic rank/XP preview for sets logged offline~~ — **deliberately not built.** A
      client-side estimate means a second copy of `standards.ts` in the browser, and the moment the
      two disagree the app shows one rank and stores another. The whole ladder is built on a single
      source of truth (MEMORY → Decisions, P3); a preview is not worth breaking it for. The session
      screen already shows the server's real target, and the queued state is visible in the offline
      banner and on `/offline`.
- [x] ~~Background Sync API~~ — **deliberately not built.** It only helps when the app is fully
      closed, Safari does not implement it at all, and next-pwa would need a custom worker to use
      it. `online` + `visibilitychange` + the 30s retry already cover every case where the app is
      open, which is when a gym session is logged.
- [x] **Exit check — verified in a browser on dev, offline and back:**
      - With `fetch` and `XMLHttpRequest` both failing and `navigator.onLine` false, logging a
        bodyweight from Home queued `{kind: 'bodyWeight', weightKg: 84.6}` with its op id, and
        wrote nothing to the server.
      - On reconnect (`online` event) the queue **drained to 0** and the server had **exactly one**
        entry, 84.6. The path that used to lose the entry silently now cannot.
      - Idempotency was verified separately at the API layer: the same write three times with one
        key wrote one row; a different key wrote; no key at all still wrote.
      - `/offline` returns 200; the generated `sw.js` precache manifest contains `/home`,
        `/workout`, `/ranks`, `/friends`, `/profile` and `/offline`.

## P13 — Polish pass · `DONE` (2026-08-08)

Split into two, because the first half turned out to be **correctness, not polish**: six settings
that stored fine and were read by nothing, a feature with no door, and four links pointing into v1.

### P13a — the settings and links that lied · `DONE` (2026-08-08)

- [x] **Haptics, Audio & SFX and Rest alert are real.** All three shipped in P10, round-tripped
      through `PATCH /profile` and were read by no screen. `frontend/src/lib/feedback.ts` is now the
      one place that reads them and the one place that buzzes or makes a noise: four synthesised
      cues over a single shared `AudioContext`, preferences pulled out of the profile blob
      `/auth/me` already returns and `auth-context` already caches — so honouring them costs no
      request and works offline. `cachePref` keeps that copy in step when Settings writes, or a
      flipped switch would only take effect on the next session.
- [x] Wired at the four moments that earn one: a logged set, the rest ending (gated on Rest alert),
      **any `Celebration` opening** — which is every rank-up, medal, streak and level, so one
      `useEffect` covers all of them — and the post-session chain, once rather than per step.
- [x] `biggerDiscoveryPosts` was a Settings switch for the same thing the feed's own toggle kept in
      a private localStorage key. Two controls, one of them lying; one preference now.
- [x] `suggestedWorkouts` hides Today's Workout — **except a session already in progress**, which is
      not a suggestion and would otherwise be stranded with no way back to it.
- [x] **Units is real.** See P13b below — it was big enough to be its own commit.
- [x] `app/error.tsx` — there was no error boundary at all, so a render error anywhere blanked the
      screen, which mid-session reads as "the app ate my sets". It says the opposite, and it is
      true: `OutboxSync` lives in the root layout, *outside* this boundary, and is still draining.
      ~~`global-error.tsx`~~ — the root layout is twenty lines of providers; a boundary above it
      would duplicate the styling to cover a case where the bundle itself is broken.
- [x] `TabSkeleton` — Home, Ranks and Profile rendered `null` until their first response, so the app
      opened blank and then jumped. The `.skeleton` class has existed since P1 and nothing used it.
- [x] Keyboard focus is one zero-specificity `:focus-visible` rule in `globals.css` rather than 73
      call sites that mostly had none.
- [x] **Dropped `user-scalable=no`.** `touch-action: manipulation` on controls kills the double-tap
      zoom delay without blocking pinch zoom, which is WCAG 1.4.4 and is exactly the person who
      most needs it. `viewport-fit=cover` turned on with it — the `safe-top`/`safe-bottom` classes
      have been in the tab bar, top bar, sheets and keypad since P1 and were resolving to zero.
- [x] **A real offline banner** — already shipped in P5 (`components/layout/offline-banner.tsx`).
- [x] **Empty states with the mascot** — already everywhere; `EmptyState` renders `Mascot` and is
      used by twelve screens.
- [x] **`.next/cache` reuse** — nothing to do: `deploy-dev.sh` builds in place and never removes
      `.next`, so the cache already survives every deploy.
- [x] **Bundle audit, first pass.** v1's `/dashboard` is deleted and the URL kept as a redirect —
      it is what every existing account has bookmarked and what v1's own sidebar points at. Its
      heatmap went with it (Profile's `6-Month Activity` is the same picture). 284 kB → 134 kB.
- [x] **Four links pointed at v1.** Signing in sent you to `/dashboard` — outside the tab bar, with
      v1's own bottom nav — and so did finishing v1's onboarding. Home's Discover grid sent
      `Leaderboards` to v1's `/leaderboard` when the v2 boards are a Friends sub-tab, and
      `Bodyweight history` to `/progress` when the chart is Profile → Health. `/friends` reads
      `?tab=` now, the way `/ranks` already did.
- [x] **Creatine and supplements were unreachable.** Kept deliberately (they are not nutrition,
      which was cut), and the only door was `/dashboard`; the finish flow's `Consumables` row
      pointed at `/profile`, which has never had any. They are **Profile → Consumables** now,
      mounted as v1's own components rather than rewritten. The slot came from `Feedback`, a tile
      that opened a "coming soon" for a form with no backend.
- [x] **`platesFor(100, 20)` has been failing its own self-check since P6** — it returns `[25, 15]`,
      two plates and exactly 100 kg, and the assertion said `[20, 20]`. Nothing noticed because the
      check only runs when someone opens `/kitchen-sink`.

### P13b — units · `DONE` (2026-08-08)

The Units setting has existed since P10 and the funnel has asked for lb/ft since P4. Both answers
went nowhere: every screen printed kg, and signing up in pounds silently made you a metric account.

- [x] `frontend/src/lib/units.ts` — **the stored number is always metric.** kg and cm are what the
      database holds, what the ladder is scaled against and what the API speaks; imperial exists at
      the edges, on the way to a screen and on the way back from a keypad. The arithmetic is the
      funnel's, which has self-checked its round-trips since P4; it moved here and
      `welcome/config.ts` re-exports it, so there is still one copy.
- [x] Converted: Home (volume, bodyweight, goal, both log sheets), the session grid, its PREV column
      and rank strip, the finish flow, the summary, the Calculator and its history, the Ranks list,
      sheet and Analysis, Profile totals, Statistics and the Health Log (bodyweight → lb, every
      circumference → in).
- [x] **The keypad could not be a formatter.** A gym in pounds does not stock relabelled 20s — it
      stocks 45s — so imperial gets its own plate set and its own 45 lb bar, and the step is ±5 lb
      rather than a converted ±2.5 kg, which is not a plate anyone owns. `platesFor` takes the plate
      set; the self-check asserts both ladders.
- [x] `POST /auth/register` carries the funnel's answer through as the preference, allow-listed like
      every other field, so the account starts in the units it was created in.
- [x] **Exit check — verified on dev, at the API and in a browser:**
      - Signup with `units: imperial` stored `{"units":"imperial"}`; `metric` stored metric; junk
        (`stones`) was **dropped entirely**, leaving no preferences blob at all.
      - `PATCH /profile` still **merges** — flipping `haptics` left `units: imperial` in place.
      - Home on an imperial account: volume **1,102 lb** (500 kg), bodyweight **180.8 lb** (82 kg).
      - Ranks: `220.5 lb × 5` for the 100 kg bench, `TO NEXT RANK 132.3×7`, column header `LB`.
      - Keypad: **−5 / +5**, and typing 135 printed *"Per side: 45 lb on a 45 lb bar"*.
      - Ticking that set stored **`weightKg = 61.23`** — 135 lb, rounded to 10 g so the column does
        not carry a nine-decimal float.
      - `/kitchen-sink` self-checks: 11 green, including the new `feedback` and `units`.
      - `?tab=boards`, Profile → Consumables and the `/dashboard` redirect all verified.
      - Prod 200 and untouched. The three test accounts were deleted; dev is back to its 2 real users.

### P13c — Reactions, the last dead preferences, accessibility · `DONE` (2026-08-08)

- [x] **Reactions** — `GET /social/reactions/mine`, plus the panel. The rows have been in
      `post_reactions` since P9; nothing read them as "given" and "received", so the tile opened a
      coming-soon for data that was already there. `given` is filtered through the same visibility
      rule as everything else — not because your own reaction is a secret, but because the row names
      *whose* session it was on and a friendship can be removed afterwards. Rows open the person,
      not the post: nothing opens a single post by URL.
- [x] `analysisWindow` decides how the Totals window is measured — `rolling` counts back from now,
      `calendar` starts at the boundary. Computed in the backend, because the client only receives
      the totals and not the sessions behind them. `calendarStart` self-checks at boot, including
      the case a plain subtraction gets wrong: under a Monday start, Sunday belongs to the week that
      began six days ago, not to the one starting tomorrow.
- [x] `weekStart` rotates the Analysis week row, which was hardcoded Su–Sa.
- [x] `routineUpdateAlert` **deleted**. There are no routine-update notifications for it to
      suppress. Removed rather than left, which is the rule this phase has been applying.
- [x] Two push payloads still deep-linked to v1's `/dashboard` — the test notification and the
      creatine reminder, which now points at Consumables.
- [x] **Accessibility.** Eleven icon-only buttons announced nothing; five were real. The worst were
      the set grid's number cells, which announce a bare number — or `—` when empty — so a screen
      reader read the whole tracker as a row of dashes. And no tab had an `<h1>`: every screen is a
      stack of `<h2>`s, so nothing named the page. One visually-hidden heading in the tab shell
      covers all five. Five routes outside the shell gained a `<main>` landmark.
- [x] **Contrast, in all 34 themes.** White on the brand cobalt is 3.87:1 and AA wants 4.5, so the
      app's main CTA has never passed. Darkening `--primary` cannot fix it — at the lightness where
      white passes, `text-primary` on the page background drops to 4.2 — so the two uses needed two
      tokens. `--primary-fill` is derived per theme: blue darkens into AA and still reads as the
      brand, a bright hue keeps its vivid fill and takes **dark** text, which is what a lime or
      amber button wants anyway. The self-check walks every theme; the lowest ratio in the set is
      **4.51:1**. It earned its keep immediately — the first cut drove Spring Blossom's fill to 28%
      lightness and the check refused it.
- [x] A favicon. `/favicon.ico` had never existed, so every page load 404'd for one.
- [x] ~~i18n scaffold~~ — **deliberately not built**, see `MEMORY.md` Decisions. A translation layer
      with one language, no translators and no second locale on the roadmap is a wrapper around
      every string in the app that changes nothing about what renders.
- [x] **Exit check — Lighthouse, mobile, against the dev URL:**

      | Route | a11y | best-practices | perf |
      |---|---|---|---|
      | `/welcome` | **100** | 96 | 77–81 |
      | `/login` | **100** | 96 | — |
      | `/offline` | **100** | 96 | — |

      - a11y went **93 → 100** on the funnel; the two failures were the CTA's contrast and the
        missing `<main>`.
      - **There is no PWA category any more** — Lighthouse dropped it in v12, and this ran on 13.4.
        Verified by hand instead: `manifest.json` 200, `sw.js` 200 with `/`, `/home`, `/workout`,
        `/ranks`, `/friends`, `/profile` and `/offline` in its precache manifest, and `/offline`
        serving a real page.
      - `best-practices` is capped at 96 by one console entry: `/api/auth/me` returning 401 for a
        signed-out visitor. That is the auth context correctly probing for a session, and the token
        can live in an httpOnly cookie as well as localStorage — skipping the probe to quiet a lint
        would sign out anyone holding only the cookie. Left alone deliberately.
      - `seo` is 66 on dev and only on dev: the vhost sends `X-Robots-Tag: noindex` on purpose, so
        `is-crawlable` fails by design. It will not apply to production.
      - Not chased: mobile LCP is ~5 s. FCP is 1.5 s, CLS is 0 and TBT is 10 ms, so the gap is
        hydration — the funnel is entirely client-rendered because it gates on localStorage. Fixing
        it is a rendering-strategy change, not a polish item.
- [x] **Exit check — the Reactions endpoint, verified on dev:** two accounts, one friends-only post
      and one discovery post, a reaction each way. Both saw `received` and `given` with the right
      person and workout; an unknown emoji **400**. After unfriending, the reaction given on the
      *discovery* post survived and the one given on the *friends-only* post disappeared, while both
      kept the reactions on their own posts. Test accounts deleted; dev is back to its 2 real users.

### What is still open after P13

- [ ] Image/SVG optimisation, and the rest of the bundle audit — `/achievements` and `/progress`
      still render inside v1's shell, which drops a v2 user out of the tab bar.
- [ ] Sound design beyond the four cues; an animation pass over the remaining interactive elements.
- [ ] A screen-reader run through the main flows on a real device. Lighthouse is a floor, not a pass.

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

### 2026-08-07 — P5 complete, nutrition cut, second screenshot pass
Home is live at `/home` behind the v2 tab shell, driven by one `GET /home/summary`.

The real work was the **recovery model**. Fatigue is counted in hard sets rather than kilograms —
100 kg × 5 on a squat and 20 kg × 10 on a lateral raise are similar work for the muscle and wildly
different numbers, so a volume model needs a per-exercise normaliser, which is exactly the thing
that would have to be tuned across 873 exercises. A set needs no normalising. It decays
exponentially with a size-scaled 48–72h half-life.

**Its boot self-check refused to start the service, and was right to.** The first constants had six
sets of squats reading 31% fatigued — the app would have offered you legs an hour after leg day.
The fix was not to relax the assertion: capacity stopped being scaled by muscle size (the half-life
already models the size difference, and scaling both put the two calibration targets on a knife
edge — six sets of curls landed *exactly* on the fresh threshold and the check failed on the
boundary twice), and is now derived from the two promises the model makes so they hold by
construction. The self-check asserts those promises for every muscle size instead of one magic
number.

Two more real bugs: `logSet` never wrote `exerciseId`, so every newly logged set was invisible to
both ranks and recovery — P2 backfilled the history and then new rows went in the same broken way.
And a deploy reported **`✓ success` while the backend crash-looped**: `curl -w %{http_code}` already
prints `000` on a connection failure, so the old `|| echo 000` appended a second one and `000000`
sailed past the `== "000"` guard. Both deploy scripts now require a real 401 from `/auth/me` and
retry while the service binds; the new check caught a half-finished `npm ci` on the very next run.

**Nutrition is out of the product**, owner's call — no food database, calories, macros or tab. The
bar is five tabs. Supplement and creatine logging are *not* nutrition and stay, under Profile →
Health. `SPEC §7` and `P8` are tombstones rather than renumbered, because `SPEC §9` and `P10` are
cited throughout the code.

**50 more screenshots** arrived mid-session and are folded into `SPEC.md` — the active session down
to its custom keypad, the exact six-step celebration chain, Ranks' Calculator and Analysis sub-tabs,
the itemised XP model (`Workout 200 / Time 1 / PR 10 / Streak 4`), the medal and quest shapes, and a
new §12 for three subsystems the first pass missed: typed goals with target dates and e1RM targets,
the Health Log, and routine folders.

**⚠️ Two ladder differences from the owner's reference are recorded as open decisions for P7**, not
changed here: it has eight tiers (Champion between Diamond and Titan, Olympian as a division-less
apex) where we have seven, and it numbers divisions `I→II→III` ascending where `lib/ranks.ts` uses
`III→II→I`. Nothing is broken — the engine is self-consistent — but the app disagrees with the
vision on both, and P7 builds the screen that shows it.

CI was also diagnosed properly this session and is healthy again; see the entry above.

**Next:** P6 — the Workout tab. SPEC §5 is now specific enough to build from directly.
**Blockers:** none.

### 2026-08-07 — P6 complete, and the dev deploy finally diagnosed
The Workout tab is live: builder → tracker → finish → the four-step post-session chain, with every
write through the outbox. Full detail in the P6 section above.

The generator is the only real new logic — *train what is recovered and lowest-ranked, with the
equipment you can reach, in the time you have* — and the interesting part is what running it against
the real catalog found that a synthetic fixture could not: it was prescribing box jumps, sled drags
and a treadmill, because only three of the catalog's seven categories are resistance training and
nothing filtered on that. Same lesson as P3's machine-isolation bug. **Run new maths over the real
data, every time.**

Recovery moved out of `HomeService` into `RanksService`. Two implementations of "which muscles are
fresh" is a drift bug waiting to happen, and here the two consumers sit one tap apart.

`standards.ts` now inverts: percentile → required bodyweight multiple → required e1RM → the load at
the reps you train at. That is what makes the rank strip say `TO NEXT RANK 102.5×7` instead of
something vague, and it is verified the only way that means anything — feeding the prescription back
into `POST /ranks/calculate` and checking it lands in the next division.

**⚠️ The dev deploy has been flaky for two sessions and the cause was not what it looked like.**
`npm ci` reporting success and leaving `node_modules/.bin` half-populated ("sh: 1: nest: not found",
`ENOTEMPTY` on rmdir) was **CI and a manual `deploy-dev.sh` running `npm ci` in the same directory
at the same time**. GitHub's push-event delivery for this repo lags, so a run triggered by the push
routinely landed while the manual deploy that followed it was mid-install. CI's concurrency group
only serialises CI against itself. `deploy-dev.sh` now takes an `flock` before doing anything, stops
the dev services for the install-and-build phase, and has an EXIT trap so a failed build cannot
leave dev down. **Do not push and then immediately deploy by hand — the lock will make one wait for
the other, which is the point, but check `gh run list` first anyway.**

**Next:** P7 — the Ranks tab. Two decisions are waiting there and are recorded in `MEMORY.md`: the
reference ladder has eight tiers to our seven, and numbers divisions the other way round. P7 builds
the screen that makes both visible.
**Blockers:** none.

### 2026-08-07 — P7 complete, and the ladder finally matches the vision
Six sub-tabs live at `/ranks`: Your Rank, Bodygraph, Leagues, Gallery, Calculator, Analysis. Full
detail in the P7 section above.

**The two open ladder decisions are closed, both in the reference's favour.** Champion goes in
between Diamond and Titan, Legend becomes **Olympian** and loses its divisions, and divisions now
ascend `I → II → III`. The change was much smaller than the note that recorded it feared: `TIERS`,
`TIER_FLOOR` and two arithmetic lines per copy of the ladder, plus a `divisionsIn(tier)` that
`nextDivisionPercentile` derives its edges from so the apex cannot grow a division by accident.
Everything else consumes a `Rank` opaquely. Champion's emblem was already vendored — `lorc/crown` —
so no asset work either.

**The check that mattered was re-running it over the real 778-set history**, the same move P3 and P6
both needed. Both accounts' percentiles came back *identical* to P3's — user5 p31.5, user6 p12.7 —
with the distribution across tiers unchanged apart from one exercise sliding from Titan into the new
Champion band. A relabelling that moves a percentile is a bug; this one didn't.

Leagues shipped without a `season` or `division` table, which is the P3 decision applied again: a
season *is* the ISO week, a division *is* your slice of everyone sorted by the LP they earned in it,
and both fall out of the weekly-LP number the Bodyrank card already computes. A stored ladder would
need a cron to roll it over and could disagree with the sets.

Two bugs, both visible only on the deployed page: every league row showed a promotion chevron (five
promote and five demote in a five-person division means everyone is in both zones), and every
bodyweight lift read `Best 0 kg × 8`, because 0 is the *added* weight on a pull-up.

`Save Rank` turned out to be the same operation as onboarding's first lift — ranks derive from
`workout_sets`, so the only honest way to keep a calculated rank is to log the set. Both now go
through `RanksService.recordLift`, and `AuthModule` dropped its own repositories to get there.

**Next:** P9 — Friends & social. `User.username` already exists (unique index, P2) and the Friends
tab is still a placeholder. Note that P9's leaderboards and P7's Leagues are different things and
should stay that way: a league is this week's LP among ~30 rivals, a leaderboard is all-time and
global.
**Blockers:** none. CI dispatched both pushes this session within seconds.

### 2026-08-07 — P9 complete, and a bug that predated the whole rebuild
Friends, posts, reactions, comments, referrals and eight leaderboards are live. Full detail in the
P9 section above.

**There is no `posts` table.** A post is a completed session whose privacy is `friends` or
`discovery` — a field the finish flow has been writing since P6. Everything a post shows is
already on the session and its sets, so a row copying them could only ever disagree with them.
That is the third time this call has been made (ranks in P3, leagues in P7) and it keeps being
right. The three tables P9 does add — friendships, reactions, comments — all carry data that
exists nowhere else.

**The real find was not in P9's code.** A brand-new test account turned up holding a deleted
tester's sessions, PRs and Wilks score. `UsersService.deleteUser` had always been
`userRepo.delete(userId)` and nothing else, so every dependent row survived the account — and
SQLite hands the freed id straight to the next signup, which then *adopts* them. The loud symptom
was a 500 on registration (`onboarding_progress` is unique on `userId`), and the quiet one was a
stranger inheriting your training history. Both are fixed: `deleteUser` now sweeps every table
with a `userId`, driven by `sqlite_master` rather than a hand-written repository list — a list is
exactly what went stale — and a boot sweep clears the rows already orphaned by the old behaviour
(dev had 36 of them, plus 21 sets). **This is a `main` bug too, and P14 must carry the fix over.**

**Dev's database was lost and restored during the session.** The service was stopped by a deploy
while sql.js was mid-flush; sql.js rewrites the entire file on every save, so the file was
truncated and the next boot seeded an empty database. `deploy-dev.sh` snapshots before every
deploy, so the fix was restoring the newest `.bak-*` — both real accounts and all 778 sets came
back. Written up in `MEMORY.md §8` because the failure looks like data loss and is not.

**Next:** P10 — Profile & settings. `User.username`, `bio` and `avatarId` exist; cosmetics
(border / banner / title) and the user-owned tables (routines, custom exercises) do not yet.
**Blockers:** none.

### 2026-08-07 — P10 complete
Profile, cosmetics, the Health Log, Routines and the settings tree are live. Full detail in the
P10 section above.

The shape of the phase was *reuse*, not invention: the header component is the same one Edit
Profile previews with, the streak number is the function Home and the leaderboard already share,
the picture upload is v1's cropper, notification settings are v1's component, and the Health Log
keeps bodyweight in the table the rank engine already reads rather than migrating the one number
the entire ladder is scaled against.

Two things worth remembering. A Next.js **page file may only export the default** — exporting the
header component and its hook from `page.tsx` is a build error whose message names a type
constraint rather than the rule, so the fix (move them to `header.tsx`) is not obvious from what
it prints. And retiring v1's `/profile` was mandatory, not tidying: two `page.tsx` files resolving
to one URL is a build failure, which is also how P6 handled `/workout`.

Cosmetics carry their own `paint` in the backend catalog. The alternative — ids in one file,
colours in another — is two files that have to agree, and eventually don't.

**Next:** P11 — Gamification glue. XP, currency, streak freezes, medals, quests and the
notification triggers. Note that `xp.ts` already holds the itemised model and the level curve, the
Store already spends `User.currency`, and the referral quests in P9 are waiting for exactly this
ledger to make their CLAIM buttons real.
**Blockers:** none.

### 2026-08-07 — P11 complete
Quests, medals, streak freezes, XP, Spark and claiming are live. Full detail in the P11 section.

The phase is almost entirely *derived*, which is now the fourth time this call has paid off
(ranks P3, leagues P7, posts P9, and everything here). One table, `reward_claims`, holds the only
fact the sets cannot re-derive: what you have already taken. Its unique `(userId, key)` index is
the whole idempotency story — the outbox can replay a claim, two devices can race, and the second
insert simply fails.

Two design notes worth keeping. The per-session Spark is **pulled, not pushed**: having
`WorkoutsService` call gamification would have made Workouts → Gamification → Push → Workouts a
module cycle, and it would have been wrong anyway, because a session finished in a basement gym is
completed by the outbox hours later. Paying on the next read, keyed by session id, handles both.
And the streak-at-risk notification became *the existing reminder, told better* rather than a
second cron — two pushes on one evening for one reason is a bug, not a feature.

The streak self-check earned its keep: nine assertions around the freeze boundaries, including
that two missed days break a streak even with a freeze banked, and that a broken streak does not
carry its freezes into the next one.

**Next:** P12 — Offline & PWA hardening. The outbox already covers session writes; it needs
reactions, quest claims and bodyweight, plus idempotency keys, a real service worker precache and
an install prompt. Note that quest claims are *already* idempotent server-side, so the outbox only
has to not lose them.
**Blockers:** none.

### 2026-08-07 — P12 in progress: idempotency landed, the rest is noted
The half of P12 that was a *correctness* problem is done; the half that is polish is not, and is
listed under the phase above as the resume point.

The correctness problem: the outbox retries anything it did not get a response to, and a write
that succeeded before the connection dropped is indistinguishable from one that never arrived. It
could log the same set twice. Every queued write now carries its op id as `X-Idempotency-Key` and
a global interceptor drops the second attempt. Verified the way it has to be verified — the same
request three times, then a different key, then no key at all, to prove nothing else broke.

Queuing reactions, claims and bodyweight found one live bug on the way: the finish flow's
bodyweight entry was a fire-and-forget POST with a `.catch(() => {})`, so for anyone finishing a
session with no signal it vanished silently. That is the single most likely moment in the whole
app to be offline.

**Next session:** finish P12's remaining four items (listed above), then P13 — the polish pass.
**Blockers:** none.

### 2026-08-07 — post-phase cleanup
Three small things, all found by re-reading what the last four phases left behind rather than by
new work.

**A quest nobody could ever finish.** P11's `measure()` returned `rankUps: 0` as a placeholder, so
the weekly *Rank up once* quest was permanently 0/1 — visible, promising a reward, and unclaimable.
It counts the rank engine's own rank-up timestamps now. Verified 0 → 3 against `GET /ranks/me`.

**The same offline bug in a second place.** P12 fixed the finish flow's fire-and-forget bodyweight
POST; Home's log-bodyweight sheet had the identical shape and the identical failure — an entry
made on gym wifi that has stopped routing showed an error and vanished. Both go through the outbox
now. Worth remembering as a pattern: when a write path turns out to be wrong, grep for the others.

**Dead weight removed.** `GamificationService` still injected `PushService` after its cron was
dropped in favour of making the existing reminder streak-aware — that injection was the only thing
making Gamification depend on Push (which depends on Workouts). Also gone: unused `Cron`,
`UserRole` and `DAY_MS` imports, and `coming-soon.tsx`, which no tab has used since P9.

### 2026-08-07 — P12 complete
The remaining half of P12 was two builds and two decisions.

Built: a real `/offline` page (the fallback used to be `/home`, which renders a stale dashboard as
though it were live — worse than an error page, because it lies quietly), and precaching for the
five tab routes instead of caching each on first visit.

Not built, on purpose: a client-side rank estimate for sets logged offline would put a second copy
of the strength standards in the browser, and the moment the two disagree the app shows one rank
and stores another — the single source of truth is the entire point of the ladder. And the
Background Sync API only helps when the app is fully *closed*, is absent on Safari, and would need
a custom service worker; `online` + `visibilitychange` + a 30s retry already cover every case where
the app is open, which is when a gym session gets logged.

The exit check was run the only way it means anything: `fetch` and `XHR` both stubbed to fail,
`navigator.onLine` false, log a bodyweight from Home, confirm it is in the outbox and *not* on the
server, then reconnect and confirm the queue drains to zero and the server has exactly one entry.

One thing to note for the next browser check: a Radix dialog left in the DOM with
`data-state="closed"` is the P4 CDP artefact, not a stuck sheet — React has closed it and only
framer's exit animation is waiting on a paint that a non-painting tab never delivers.

**Next:** P13 — the polish pass. Animation and haptics, sound design, empty states, loading
skeletons, accessibility, bundle/Lighthouse work, error boundaries, i18n scaffold.
**Blockers:** none.

### 2026-08-08 — P13a + P13b complete
The polish pass opened by finding that most of the first half was not polish. Six settings had
been stored, validated and round-tripped since P10 and were read by **no screen**: Haptics, Audio
& SFX, Rest alert, Suggested workouts, Bigger discovery posts and Units. A toggle that changes
nothing is worse than a missing one — it tells the user something about the app that is false —
so four of the six are wired up and the remaining three are listed in P13c with the same rule
attached: implement or drop the row.

The shape of the fix was the one this project keeps arriving at: **one place that reads it**.
`lib/feedback.ts` is the only file that touches the preference blob and the only file that buzzes
or makes a noise, and because the blob already rides along on `/auth/me` and is already cached by
`auth-context`, honouring it costs no request and works in a basement. Sound is four synthesised
cues over one shared `AudioContext` — the rest timer's chime generalised, not a second copy of it —
and the *whole* reward system announces itself from a single `useEffect` in `Celebration`, because
every rank-up, medal, streak and level already opens one.

Units was big enough to be its own commit and its own rule: **the stored number is always metric.**
Imperial exists at the two edges — on the way to a screen, and on the way back from a keypad —
because anything deeper puts two units in one column. The keypad is the part that could not be a
formatter: a gym in pounds stocks 45s, not relabelled 20s, so imperial has its own plate set, its
own bar and a ±5 lb step rather than a converted ±2.5 kg, which is not a plate anyone owns.

Three things were found only by clicking, which is now the fourth phase in a row that has been
true. **Signing in landed on `/dashboard`** — v1's shell, outside the tab bar, with v1's own bottom
nav. **Creatine and supplement logging had no door**: kept deliberately, reachable only from that
dashboard, and the finish flow's `Consumables` row pointed at `/profile`, which has never had any.
And `/kitchen-sink` showed **the plate calculator's self-check red since P6** — the assertion was
wrong, not the code, and nothing caught it because that check only runs when someone opens the
page. Worth remembering: a self-check that lives on a route nobody visits is not a test.

One deliberate non-build, recorded in `MEMORY.md` → Decisions: **no i18n scaffold.** A translation
layer with one language, no translators and no second locale on the roadmap is a wrapper around
every string in the app that changes nothing about what renders.

**Next:** P13c — the Reactions screen, the three remaining dead preferences, the accessibility and
image passes, and the Lighthouse exit check.
**Blockers:** none.

### 2026-08-08 — P13c complete, and P13 with it
The last three items were a screen, three preferences and the accessibility pass.

**Reactions** closes the last shortcut tile that opened a coming-soon. The data had been sitting in
`post_reactions` since P9 — the only new thing is a read of it, and the only judgement in that read
is that `given` runs through the same visibility rule as every other social read. Not because your
own reaction is a secret, but because the row names *whose* session it was on, and a friendship can
be removed after the fact. Verified by unfriending mid-test: the reaction given on a discovery post
survives, the one given on a friends-only post disappears, and both people keep the reactions on
their own posts.

**The three dead preferences got the rule this phase has been applying all along** — implement or
delete, never leave. `analysisWindow` and `weekStart` are real now; `routineUpdateAlert` is gone,
because there are no routine-update notifications for it to suppress and there was no honest way to
make one up.

**The accessibility pass found the app's main button had never passed contrast.** White on the brand
cobalt is 3.87:1 against AA's 4.5, in every theme, since P1. The interesting part is that darkening
`--primary` does not fix it: at the lightness where white passes, `text-primary` on the page
background falls to 4.2, so no single value satisfies both and the two uses needed two tokens. And
one *lightness* is not enough either — a bright hue pushed dark enough for white is a different
colour, so those keep their vivid fill and take dark text instead. The generator picks per hue and
the self-check refuses any theme it gets wrong, which it did on the first attempt: Spring Blossom's
fill went to 28% lightness and the check caught it before it shipped.

Lighthouse went 93 → **100** on accessibility, mobile, on every public route. Two notes for whoever
runs it next: **the PWA category no longer exists** (dropped in Lighthouse 12; this ran on 13.4), so
the PWA half of the exit check was verified by hand — manifest, precache manifest and `/offline`.
And `seo` is 66 purely because the dev vhost sends `X-Robots-Tag: noindex` on purpose.

**Next:** P14 — cutover to production. Note three things it must carry across, all recorded above:
`UsersService.deleteUser` still orphans rows on prod (P9), prod still serves `s-maxage=31536000` on
documents (P1), and the prod DB needs a full backup before the merge.
**Blockers:** none.
