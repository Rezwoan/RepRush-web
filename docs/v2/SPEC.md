# RepRush v2 — Product Spec

Distilled from all 91 screenshots in `inspiration/`. **This file replaces the screenshots.** Do not
re-read them; opening all 91 costs ~150k tokens. Open one only if this file is genuinely silent on a
detail you need.

Everything below is the *product*, expressed as RepRush. Art, palette and copy are ours.

---

## 0. The core idea

Strength is scored like a competitive ladder. Every set you log is measured against strength
standards for your bodyweight, sex and age, and converted into a **rank** and **LP** (ladder points)
for that exercise. Exercise ranks roll up into **muscle ranks**, muscle ranks paint an anatomical
**Bodygraph**, and the whole thing rolls up into one **Bodyrank**. Weak muscles are visibly weak, so
the app can point you at them. Streaks, XP levels, medals, quests, friends and leaderboards wrap the
loop.

Three motivational systems run in parallel and must not be confused:
- **Rank / LP** — *how strong you are*. Derived from lifted weight vs standards. Can go down.
- **XP / Level** — *how much you've done*. Accumulates from any activity. Never goes down.
- **Streak** — *how consistent you are*. Daily, breakable.

---

## 1. Visual language

Dark-first. Near-black background `#0B0A10`, cards `#16141F`, elevated `#1E1B29`, hairline borders
`rgba(255,255,255,.07)`.

Palette (RepRush's own blue+gold identity, not the inspiration's):
- Primary `#3FA9F5` (actions, active tab, links). Pressed state = 4px darker bottom edge, no shadow.
- Gold `#F5B841` (streaks, medals, celebration).
- Success `#3DD68C`, danger `#FF5C5C`, warm `#FF8A3D` (fatigue/recovery).
- Rank tier colors: Bronze `#C8794A`, Silver `#B8C2CC`, Gold `#F2C438`, Platinum `#3FD6B0`,
  Diamond `#8B8CF7`, Titan `#E33B3B`, Legend `#5AC8FA` + animated sheen.

Type: one geometric sans, heavy weights for numbers. Screen titles 28–32px/800. Section headers
22px/700. Body 16px. Big stat numbers 44–72px/800 with tabular figures.

Shape: 16px radius on cards, 14px on buttons, full-round on chips and pills. Primary buttons are
full-width, 56px tall, uppercase, letter-spaced, with a solid darker bottom edge (a "chunky" 3D
button, not a shadow).

Motion (framer-motion, reuse `frontend/src/lib/motion.ts`): 200ms ease-out for entrances, spring
`{stiffness:300,damping:24}` for anything that "pops" (badges, checkmarks, celebrations), staggered
40ms list entrances. Every celebratory moment has a rays-burst + confetti-shard layer. Respect
`prefers-reduced-motion`.

Themes: the app ships a theme engine, not just dark/light. Themes are CSS-variable sets:
`Dark`, `Light` (free); named themes (`Retro`, `Twilight`, `Darkest`, seasonal set, gradient
"prismatic" set, 8 color pairs light/dark) unlocked with earned currency. All themes must keep AA
contrast on text.

Art to hand-author as SVG in `frontend/src/components/art/`:
1. **Mascot** — RepRush's own character (v1 already has a blue+gold logo; extend it into a
   character). Needs poses: idle, cheering, flexing, on-fire (streak), sleeping (rest day), sad
   (streak lost). Used in onboarding, celebrations, empty states, streak screens.
2. **Bodygraph** — front and back anatomical figure, one `<path>` per muscle region, each addressable
   by id so it can be tinted per rank or per fatigue. ~22 regions: upper/mid/lower chest, front/mid/
   rear delt, biceps, triceps, forearms, traps, lats, upper back, lower back, abs, obliques, glutes,
   quads, hamstrings, adductors, calves, neck.
3. **Rank badges** — 7 tiers × hex-shield shape, with I/II/III variants and a locked/greyed state.
4. **Medals** — heptagon body + emblem, ~6 emblem shapes reused with different tints.
5. **Exercise icons** — one glyph per equipment type (barbell, dumbbell, cable, machine, bodyweight,
   kettlebell, band, plate) tinted per primary muscle. Not illustrated figures.

---

## 2. Navigation

Bottom tab bar, 6 tabs, always visible except during onboarding, an active session's fullscreen
moments, and celebration screens:

`Workout` · `Home` · `Ranks` · `Nutrition` · `Friends` · `Profile`

Active tab gets a tinted panel behind it plus a 2px top rule in the primary colour.

Global top bar (on Home / Ranks / Friends): avatar chip with `Lv.N` + XP progress bar on the left;
streak flame + count; currency globe + count; a bell (notifications) or context action on the right.

---

## 3. Onboarding

A long, mascot-guided funnel. Account creation happens at the **end**, after the user has already
invested — this is deliberate. All answers are held client-side until then, and the whole payload is
submitted on signup.

### 3.1 Welcome
Splash with wordmark, tagline, an illustrated row of lifters, `GET STARTED` (primary) and
`I ALREADY HAVE AN ACCOUNT` (outline). Language selector top-right.

### 3.2 Value carousel (4 slides, skippable, dot indicator)
1. "Climb the ranks" — the seven rank badges laid out ascending.
2. "See your whole body" — Bodygraph with per-muscle rank labels.
3. "A plan built for you" — a sample generated plan card with target-muscle percentages.
4. "Everything in one place" — split screen: nutrition rings + an active session logger.

### 3.3 Question funnel
Mascot in the corner with a speech bubble; a thin progress bar at the top; back arrow. One question
per screen, `NEXT` disabled until answered, some screens have `SKIP`.

Order:
1. Mascot intro — "I just have a few questions."
2. **Name** (text)
3. **Experience** — Never trained / Beginner / Intermediate / Advanced
4. **Primary goal** — Build muscle / Get stronger / Lose fat / Stay healthy / Athletic performance
5. **Commitment** — press-and-hold the mascot to "commit". Haptic + fill animation.
6. **Sex** — two cards (drives strength standards; label it as such)
7. **Height** — vertical ruler picker, ft/in ↔ cm toggle
8. **Weight** — horizontal ruler picker, kg ↔ lb toggle, note explaining bodyweight is required for
   ranking
9. **Age** — wheel picker
10. Interstitial — "This journey is all about you."
11. **Avatar** — intro screens, then a 2×3 avatar grid, then a reveal with rays
12. **Mindshare** — "How often do you think about getting in shape?" 4 options
13. **Limitations** — multi-select: sensitive back / knees / shoulders / wrists / none. Drives
    exercise exclusions.
14. **Energy levels** — 4 battery-illustrated options
15. Two relatability statements — quote card, Yes/No, skippable
16. Narrative interstitial — "Motivation doesn't last. Systems do." (red gradient)
17. Narrative interstitial — "The path to building muscle" (mountain + top-rank badge, blue gradient)
18. **Has a plan?** — Yes / No
19. **Where do you train?** — Big gym / Small gym / Home / Outdoors / Travelling
20. **Equipment** — grouped multi-select with icons (Small weights / Bars & plates / Benches & racks /
    Machines / Cables / Accessories). Defaults preset by answer 19. Header shows `n/97 selected`.
21. **First rank** — pick one exercise from a carousel, dial in weight and reps on ruler pickers,
    `GET MY RANK`.
22. **Rank reveal** — badge + rays + "Bench Press · SILVER III · stronger than 55% of lifters",
    share button, `ONWARDS & UPWARDS`.
23. **Building your profile** — three progress bars filling in sequence: "Compiling profile",
    "Calculating strength levels", "Generating Bodyrank".
24. **Bodyrank explainer** — 3 coach-marked steps over the Bodygraph: what it is → it fills as you
    train → target the low-ranked muscles. `GOT IT`.
25. **Streak explainer** — flaming mascot, `0 workout streak`, weekday dots, `CHALLENGE ACCEPTED`.
26. **Sign up** — "A stronger you is closer than you think." Email + password. Submits the whole
    onboarding payload. (No Google/Apple — see MEMORY decisions.)
27. **First medal** — "You've earned your first medal!" heptagon medal + rays + share.
28. **Welcome, {name}** — mascot cheering, `LET'S GO` → Home.

After signup, a coach-mark tour highlights each of the 6 bottom tabs in turn.

---

## 4. Home tab

Three sub-tabs: **For You** · **Friends** · **Discovery**.

### For You (default)
Vertically stacked sections:

1. **Getting Started / Today's Workout** — large primary-blue card: eyebrow chip, illustration,
   title (`Day 1 Workout` or the generated split's name), one-line motivation, white
   `START WORKOUT` button. Replaced by a "resume session" card if one is in progress.
2. **Recovery Zone** — front+back Bodygraph tinted by fatigue (warm = fatigued, pale = fresh) with a
   vertical battery gauge showing overall readiness, and a status pill: `READY TO TRAIN` /
   `RECOVERING` / `REST DAY` plus a sentence naming which muscles are fresh.
3. **Your Goal** — active goal with progress, or an empty state with `+ ADD GOAL`.
4. **Last 14 Workouts** — a stat block: Volume (big number + sparkline + trend label such as
   "Progressive Overload"), then a 3-up row of Duration / Records / Calories Burned, then Bodyweight
   (big number + trend + `+` to log, tappable through to the weight chart).
5. **Discover** — 2×2 tile grid: Leaderboards, Social Feeds, Streak Calendar, Rank Calculator.

### Friends
Chronological feed of friends' workout posts. Each post: avatar + name + rank chip + time, optional
photo, caption, a stat strip (duration / volume / PRs), the muscles trained rendered as a mini
Bodygraph, reaction row (emoji reactions, not just likes), comment count.

### Discovery
Public feed, same post cards, two layouts (single big column or two-up grid — user preference).

---

## 5. Workout tab

### 5.1 Builder
Top bar: close, routine selector dropdown (`Default ▾`), overflow menu.
A horizontally scrolling row of filter chips: duration (`1h ▾`), difficulty (`Intermediate ▾`),
`Equipment (26/97) ▾`, rest preset, split.

Body:
- **Target Muscles** — horizontal cards, each a mini Bodygraph with the muscle highlighted and its
  share of the session as a percentage.
- **N Exercises** — list rows: icon, `3 × Bench Press`, `40.8 kg · 8 reps`, overflow menu
  (swap / remove / reorder / set rest).
- Floating `Start Workout ▶` button.

Generation rules: pick exercises whose primary muscles are (a) recovered, (b) lowest-ranked, subject
to available equipment, limitations and the requested duration. Volume defaults come from the user's
last performance on that exercise; if never performed, from the strength-standard estimate for their
rank.

### 5.2 Active session
Sticky header: rest timer (`REST 01:29`) with a collapse chevron and a skip arrow; when idle it shows
the elapsed session clock, an edit pencil, and a ✓ to finish.

Free-text `Your workout notes…` at the top.

Per-exercise card:
- Icon + name + collapse chevron + overflow.
- `Rest Timer 1m 30s ✎` with an on/off toggle.
- **Rank progress strip**: current rank badge, `TO NEXT RANK: 82.5 × 3`, a progress bar, `?` help.
- Set grid, columns `SET | PREV | KG | REPS | ✓`:
  - `PREV` shows last session's actual for that set index (`80 × 2`), or `-`.
  - KG/REPS are pre-filled from PREV (a lookup, never a prediction — v1 rule, keep it).
  - Tapping ✓ turns the whole row green, fires haptic + sound, starts the rest timer.
  - Warm-up sets are marked `W` and excluded from volume and ranking.
  - `+ ADD SET`.
- `+ Exercise` button at the bottom of the list.

Bottom utility bar: `How To` (form video/notes), heart-rate, `Settings`.

Rank-ups and PRs detected mid-session queue up and fire as full-screen celebrations *after* the
session is finished, not during it.

### 5.3 Finish flow
Screen with the final duration (editable), then:
- `Add Media` + `Caption`
- `Consumables ›` (what you took — links to supplements)
- `Tag Friends ›`
- `Bodyweight` inline number
- `Tracker` toggle (count toward stats)
- `Post in Discovery` toggle (with a "only friends can see" sub-label when off)
- `Privacy Settings` accordion
- `Finish Workout` primary button

Then, in sequence: XP gained → any rank-ups (badge + rays + `+96 LP`) → any new medals → streak
screen → summary.

---

## 6. Ranks tab

Four sub-tabs: **Your Rank** · **Bodygraph** · **Leagues** · **Gallery**.

### Your Rank
- Hero: your Bodyrank badge, huge, with tier colour wash. Before placements are complete it is
  greyed out and reads `Predicted Rank: BRONZE II`.
- **Placements** card (rainbow border): "Rank N more exercises to get your RepRush rank", a row of 10
  hexes filling in as exercises get ranked, `RANK EXERCISES` button.
- **Rank Standings** — your global position once placements are done.
- Per-exercise rank list below: exercise, badge, LP bar, percentile.

### Bodygraph
Front/back figure, every muscle tinted by its rank colour. Tap a muscle → sheet with that muscle's
rank, contributing exercises, LP, and a "train this" shortcut. A legend strip of the 7 tiers sits at
the bottom.

### Leagues
Seasonal ladder. Weekly LP earned puts you in a division with ~30 others; top promote, bottom
demote. Shows the division table, your row highlighted, and a countdown to the reset.

### Gallery
Every rank badge and medal in the game, earned ones in colour, unearned greyed with their unlock
condition.

### Rank maths (canonical)
- `e1RM = weight × (1 + reps/30)` (Epley), reps capped at 12 for scoring.
- `ratio = e1RM / bodyweight`, adjusted by sex and by an age coefficient.
- A per-exercise standards table maps `ratio` → percentile → tier + division (I/II/III) + LP within
  the division. Tables live in `backend/src/ranks/standards.ts` as coefficients, not a huge dataset.
- LP awarded per set = f(percentile gained), clamped so a single freak set cannot skip a tier.
- Muscle rank = LP-weighted average of the exercises whose primary muscle it is.
- Bodyrank = weighted average of muscle ranks, weighted by muscle size.
- Ranks decay: no qualifying set for a muscle in 30 days → slow LP bleed. This is what makes the
  Bodygraph honest.

---

## 7. Nutrition tab

- Header ring: calories remaining vs target, with three sub-rings for protein / carbs / fat.
- `ADD MEAL` primary. Meal search over a bundled open food dataset + "custom entry" + "recent" +
  "my foods".
- `Recently Logged` list with thumbnails, per-item macros, swipe to delete.
- Targets are computed from profile (Mifflin-St Jeor BMR × activity × goal) and are editable.
- Calories burned from workouts optionally feed back into the daily target (a settings toggle).
- Water and supplement tracking fold in here — v1 already has `supplements/` and `creatine/` modules;
  reuse them rather than writing new ones.

---

## 8. Friends tab

- Header: `LEADERBOARDS` banner button; `add friend` icon top-right.
- Empty state: "Working out is better with friends!" + a referral upsell card + `+ ADD FRIEND`.
- Add Friends sheet: `Invite Your Friends` (share link), `Search` (by username), `Referral Code`.
- **Referrals screen**: enter someone's code (`CLAIM REFERRAL`), your own code displayed large,
  `Invite Friends`, and **Referral Quests** (refer 1 / 3 / 5 friends → XP + currency, with `CLAIM`).
- Search: username search with an empty state that offers Invite / Referrals.
- **Leaderboards**: filterable by scope (friends / global / country) and metric (Bodyrank, LP this
  week, volume, streak, workouts). v1 already has relative-strength / Wilks / progress-rate
  endpoints — fold them in as additional metrics.

---

## 9. Profile tab

Header: banner + avatar (with border + crown cosmetics) + display name + username + a "title" hex.

**Shortcut grid** (2 rows of 5): Store · Inventory · Quests · Medals · Health · Reactions · Routines ·
Exercises · Stats · Feedback. (No "Pro".)

Cards, in order, and **reorderable by the user** (`Edit Profile Layout` at the bottom):
1. **Memories** — a two-week calendar; days with a workout show a mini Bodygraph of what was trained;
   today is ringed. `View All ›` → full month/year calendar.
2. **Last 7 Days** — front/back Bodygraph tinted by volume in the window.
3. **Totals** — `Duration | Volume | Reps` segmented control over a chart, with a window selector
   (7 days / 30 days / 6 months / year).
4. **Streaks** — weekday dots, current + best, mascot with a contextual line.
5. **Levels** — level hex, `0 / 506 XP` bar, `Total XP`, and a claim button for level rewards.
6. **Ranks** — current Bodyrank + best-ever, `View All ›`.
7. **6-Month Activity** — workouts-per-week line chart.
8. **Routines** / **Exercises** / **Reactions** — lists with empty states.

### Edit Profile
Avatar / Picture / Title / Border / Banner pickers (cosmetics from Inventory), username, display
name, bio (200 chars), `Preview Public Profile`.

### Settings (a plain grouped list)
- *Engage*: Leave a Review, Help Us Improve
- *User*: Profile, Account, Referrals, Statistics, Import Data
- *Preferences*: Units, Themes, Languages, Notifications, Analysis, Calendar, Other Preferences
- *Resources*: Request a Feature, FAQ, What's New, Contact Us
- *Legal*: Privacy Policy, Terms of Use
- Logout (danger)

Sub-screens worth calling out:
- **Statistics** — Overview (joined, total workouts, favourite exercise), Chronometry (avg/longest
  duration, workout ratio), Metrics (total/avg volume and reps), Exercise Counter.
- **Themes** — grouped theme picker with prices in the earned currency.
- **Calendar Preferences** — start week on Sunday/Monday + a live preview month.
- **Analysis Preferences** — weekly and monthly windows: "last timeframe" vs "start of week/month",
  with a live explanation line.
- **Notification Settings** — three groups: Reminders (daily workout, streak, feed), Community
  (friends, reactions, comments), Announcements. v1's `push/` module and
  `components/profile/notification-settings.tsx` are the base.
- **Other Preferences** — Routine Update Alert; App Layout (suggested workouts, bigger discovery
  posts, rank card layout); Haptic Feedback; Audio & SFX (rest-timer alert, soundscape); Calories
  (track calories burned).

---

## 10. Cross-cutting systems

### Streaks
A day counts if a tracked workout was completed. Weekday dot row; flaming mascot whose intensity
scales with streak length; best-ever streak. One "freeze" earned per 7-day streak, auto-spent to
cover a single missed day (max 2 banked). Streak screens are full-screen celebrations.

### XP & Levels
XP from: completing a workout (scaled by duration and volume), logging bodyweight, hitting macro
targets, claiming quests, referrals, first-time exercises. Level curve is quadratic
(`xpForLevel(n) = 250 + 256n^1.4` rounded — tune so level 2 lands near 506 XP). Level-ups award
currency and cosmetics.

### Currency
One soft currency (the "globe"). Earned from level-ups, quests, referrals, medals. Spent on themes,
borders, banners, titles, avatars. Nothing is purchasable with money.

### Medals
Achievement engine, evaluated after every session and every nightly job. Categories: onboarding,
volume, streak, rank, social, exploration, consistency. Each medal has tiers. v1's `achievements/`
module is the base — replace its rules, keep the module.

### Quests
Daily (3, rotating) and weekly (3) objectives with progress bars and a `CLAIM` button. Plus
Referral Quests. Rewards in XP + currency.

### Recovery model
Each set adds fatigue to its primary and secondary muscles, scaled by volume and proximity to
failure. Fatigue decays exponentially with a per-muscle-size half-life (large muscles ~72h, small
~48h). Drives the Recovery Zone card, the "Ready to train" copy, and the workout generator.

### Notifications
Web push (v1 `push/` module + `lib/push.ts` already work). Triggers: daily workout reminder at the
user's usual training time, streak-at-risk in the evening, friend activity, quest expiry, rank
decay warning.

### Offline
The existing outbox in `frontend/src/lib/offline.ts` is extended, not replaced, to cover the new
write paths (nutrition entries, set logging with rank preview, reactions). Rank/LP is computed
server-side on sync; the client shows an optimistic estimate and reconciles.

---

## 11. Explicit non-goals

Subscriptions, ads, trials, "Pro" tiers, Google/Apple sign-in, Strava, Discord, real-money purchases,
illustrated per-exercise artwork, and multi-language content beyond an i18n scaffold with English
filled in. All are in `MEMORY.md → Decisions` with reasons.
