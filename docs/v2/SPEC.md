# RepRush v2 — Product Spec

Distilled from **`inspiration/` (91 screenshots) and `more_inspiration/` (50 more, added
2026-08-07)**. **This file replaces both folders.** Do not re-read them; opening all 141 costs
~250k tokens. Open one only if this file is genuinely silent on a detail you need.

Both folders are gitignored — this repo is public and they are a third-party app's screenshots.
The second batch is the source for §5.2, §5.3, §6, §9, §10 and §12, which are much more specific
than the first pass could be.

Everything below is the *product*, expressed as RepRush. Art, palette and copy are ours.

---

## 0. The core idea

Strength is scored like a competitive ladder. Every set you log is measured against strength
standards for your bodyweight, sex and age, and converted into a **rank** and **LP** (ladder points)
for that exercise. Exercise ranks roll up into **muscle ranks**, muscle ranks paint an anatomical
**Bodygraph**, and the whole thing rolls up into one **Bodyrank**. Weak muscles are visibly weak, so
the app can point you at them. Streaks, XP levels, medals, quests, friends and leaderboards wrap the loop.
**Food, calories and macros are out of scope** — see §11.

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
  Diamond `#8B8CF7`, Champion `#EE5CC4`, Titan `#E33B3B`, Olympian `#96E3FA` + animated sheen.

**The ladder (settled in P7, matching the owner's reference):**

Bronze → Silver → Gold → Platinum → Diamond → **Champion** (magenta, crowned) → Titan (red) →
**Olympian** (a single apex band with no divisions). Eight tiers.

**Divisions ascend `I → II → III`** — I is the entry to a tier, III its top, so Titan III is the
best Titan. Olympian has no divisions and its label is just `Olympian`.

`TIER_FLOOR` percentiles: Bronze 0, Silver 25, Gold 45, Platinum 65, Diamond 79, Champion 88,
Titan 94, Olympian 98.5. The median gym-goer is Gold I.

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

Bottom tab bar, 5 tabs, always visible except during onboarding, an active session's fullscreen
moments, and celebration screens:

`Workout` · `Home` · `Ranks` · `Friends` · `Profile`

Active tab gets a tinted panel behind it plus a 2px top rule in the primary colour.

Global top bar (on Home / Ranks / Friends / Profile): avatar chip with `Lv.N` + XP progress bar on
the left; streak flame + count; currency globe + count; and a right-hand slot whose icon is
contextual — a **bell** on Home, a **`?` help** button on Ranks, a **gear** on Profile.

The currency globe carries a small `+` badge. Tapping the avatar chip opens Profile.

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
4. "Everything in one place" — split screen: an active session logger + the streak counter.

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

1. **Getting Started** — a horizontally scrolling row of onboarding-challenge cards, each fully
   tinted by state (green = complete, gold = in progress) with a ring showing percent and a
   `Claim Reward` / `Continue` button. Two exist:
   - **Welcome Quest** — *"Wrap up your first day and earn a special reward!"* Opening it shows a
     checklist with green ticks: Complete Onboarding & Join · Enable Push Notifications ·
     Set your Profile Picture · Complete your 1st workout. Footer: *"Press to claim your reward!"*
     with a 100% bar and a 🎁. Claiming pops a `Well Done!` reward carousel — a title, currency, XP
     — with `Nice` / `Equip Title`.
   - **First Week Challenge** — *"Keep working out for a week to earn even more rewards!"*
     Add a Friend · Complete your 2nd Workout · Share your Workout with 1 Person · Achieve a 3 day
     streak · Achieve 10 Ranks. Rows are tappable `›` shortcuts; done rows show a gold tick.
   The row disappears once both are claimed.
2. **Today's Workout** — large primary-blue card: eyebrow chip, illustration, title (the generated
   split's name), one-line motivation, white `START WORKOUT` button. Replaced by a "resume session"
   card if one is in progress.
3. **Recovery Zone** — a **vertical battery on the left** (a real battery silhouette, cap and all,
   filled with an amber gradient), then the front+back Bodygraph tinted by fatigue: warm/amber where
   worked, pale where fresh. Below, a status pill — `READY TO TRAIN` / `RECOVERING` / `REST DAY` —
   and a sentence naming the fresh muscles: *"Your middle delt, forearms and lower back are fully
   recovered. Let's workout!"*
4. **Your Goal** — the active goal, or an empty state: *"Challenge yourself / Define your next goal
   to lock in."* + `+ ADD GOAL`. A strength goal renders as a compact card: `Bench Press 1RM →`,
   the current 1RM, a semicircular percent gauge, the projection chart, `Target 1RM` and
   `Days Remaining`. See §12.1.
5. **Last 14 Workouts** — Volume as a big number with the trend label (`Progressive Overload`) and a
   `↗` chip, beside a **vertical bar sparkline** (one bar per session, not a line). Then a 3-up row:
   `Duration` · `Records` · `Burned` (`29 cal`). Then a Bodyweight card: big number, trend label
   (`Stable Weight`), `→` through to the chart, `+` to log, and a mini dot plot.
6. **Discover** — 2×2 tile grid: Leaderboards, Social Feeds, Streak Calendar, Rank Calculator.

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

Sticky header, one row: collapse chevron · timer icon · the clock · a blue circular `→`.
Idle it reads the elapsed session time (`00:00:45`); while resting it turns blue and reads
`REST 01:26`. The `→` advances/finishes.

Free-text `Your workout notes…` at the top.

Per-exercise card:
- Illustrated thumbnail + name + collapse chevron + overflow (`⋮`).
- `Rest Timer 1m 30s ✎` with an on/off toggle.
- **Rank progress strip**: the tier badge on the left with its label beneath it (`SILVER III`), then
  `TO NEXT RANK:` with the exact prescription to beat on the right (`82.5x3`), a progress bar, and a
  `?`. This is the single best motivator on the screen — it names the set that promotes you.
- Set grid, columns `SET | PREV | KG | REPS | ✓`:
  - `PREV` shows last session's actual for that set index (`80 x 2`), or `-`.
  - KG/REPS are pre-filled from PREV (a lookup, never a prediction — v1 rule, keep it).
  - Tapping ✓ turns **the whole row green** with a filled green check, fires haptic + sound, and
    starts the rest timer. Incomplete rows show a dim outline check.
  - Warm-up sets are marked `W` and excluded from volume and ranking.
  - `+ ADD SET`.
- `+ Exercise` button below the list.

**Number entry is a custom keypad, not the OS keyboard.** A docked pad with: `+2.5` / `-2.5`
increment keys, digits, `.`, backspace, a duplicate-previous-set key, a plate-calculator key, a
`NEXT` key that jumps to the next field, and a toggle back to the system keyboard. A blue banner
above it reads *"Log the total weight (bar included if applicable)"*, and a `How to Log?` dialog
explains it: *log the total lifted, so a 20 kg bar plus 10 kg a side is 40 kg*. Reps have the same
pad plus a horizontal ruler alternative.

Bottom utility bar: `?` How To · heart-rate · Settings.

**Tracker Settings** (the gear) is a sheet:
Weight Units `Kg`/`Lbs` · Distance Units `Km`/`Mi` · **Auto Rest Timer** ("will auto start on set
completion") · **Default Exercise Rest Timer** + `Edit` · **Next Button Set Change** ("the keypad's
next button will/will not focus the next set") · **Rank Calculator** ("will/will not show up in the
tracker") · **Use previous set from previous routine** · **RIR or RPE** selector, where RIR mode is
labelled *"How many reps you had left"*.

Rank-ups and PRs detected mid-session queue up and fire as full-screen celebrations *after* the
session is finished, not during it.

### 5.3 Finish flow

Header: `×` · the final duration with a `✎` · a blue `✓`. Then:
- `Add Media` tile beside a `Caption: …` field
- `Consumables ›` (what you took — links to the v1 supplements module)
- `Tag Friends ›`
- `Bodyweight` with an inline number and its unit
- `Tracker` toggle (count toward stats)
- `Post in Discovery` toggle, sub-label `Only friends can see your post` when off
- `Privacy Settings` accordion
- `Finish Workout` primary button → a confirm dialog: *"🏁 Finish Workout — Are you ready to finish
  this workout session and post it?"* `Cancel` / `Yes`.

A **rest-timer mini-bar** stays docked above the tab bar throughout, with a circular countdown, so
the timer survives leaving the session screen.

(No `Post to Strava` — see §11.)

### 5.3.1 The post-session chain, in order

This sequence is the payoff of the whole app. Each step is full-screen; each has a share button.

1. **Summary** — a headline (`Huge Gains!`), the mascot, and three coloured stat cards:
   `Duration` (purple) · `Records` (gold, star icon) · `XP` (blue). Confetti. `CONTINUE`.
2. **Ranking** — header shows the greyed hero badge and `Predicted Rank: BRONZE III`, then the 10
   placement hexes, then one row per exercise trained: thumbnail · name · LP bar · `+66 LP` · tier
   badge. Exercises not yet ranked show a `?` hexagon. Sub-tabs `Recap | Ranking` at the bottom.
   Each newly earned rank **animates in place**: the `?` hex flips to the tier badge, then takes
   over the screen as a tier-coloured reveal — exercise name, `GOLD III`, rays, `LET'S GO!` in the
   tier colour. Then `CONTINUE`.
3. **Streak** — a huge `2 🔥` over `workout streak!`.
4. **Your Progression** — the mascot, a seven-flame week row with an `+1 Egg Bonus` note, a
   `🌐 200 Eggs Earned!` banner, and a level card: `Lv.1` · `+215 XP` · progress bar ·
   `Show XP Breakdown ⌄`, which expands to the itemised award (see §10). `FINISH`.
5. **Medals**, if any — a dialog per medal: *"New Medal Acquired! 🎉"*, the unlock condition
   (`Complete 1 workout`), the medal, a flavour line (*"A journey of a thousand miles begins with a
   single step"*), `‹ ›` arrows when several landed at once, and `Nice` / `Equip Medal`.
6. **Level up**, if it happened — a full-screen `LEVEL UP!` with chevron banners sweeping in from
   both edges and the level hex, then `LET'S GO!`.

### 5.4 Exercise picker

Search field with a clear `×`, a filter icon and a `+`; sort chips `Alphabetical · By Rank ·
Performed · Muscle`; a `Create Exercise` button. Rows are a circular illustrated thumbnail, an
optional blue category label above the name (e.g. `Weighted Support`), the name, and — for exercises
you have ranked — the tier badge plus how many times performed.

## 6. Ranks tab

**Five** sub-tabs: **Your Rank** · **Bodygraph** · **Leagues** · **Gallery** · **Calculator** ·
**Analysis** — six in the source; ours drops nothing but may merge Bodygraph into Your Rank if the
strip gets crowded. Top-bar right slot is a `?` help button here.

### Your Rank
- Hero: your Bodyrank badge, huge, with tier colour wash. Before placements are complete it is
  greyed out and reads `Predicted Rank: BRONZE II`.
- **Placements** card (rainbow border): "Rank N more exercises to get your RepRush rank", a row of 10
  hexes filling in as exercises get ranked, `RANK EXERCISES` button.
- **Rank Standings** — your global position once placements are done.
- Per-exercise rank list below: exercise, badge, LP bar, percentile.

### Bodygraph
Front/back figure, every muscle tinted by its rank colour. Tap a muscle → sheet with that muscle's
rank, contributing exercises, LP, and a "train this" shortcut. A legend strip of the tiers sits at
the bottom.

### Leagues
Seasonal ladder. Weekly LP earned puts you in a division with ~30 others; top promote, bottom
demote. Shows the division table, your row highlighted, and a countdown to the reset.

### Gallery
Search + filter over your ranked exercises, laid out **two-up as tier-tinted cards**: tier name and
`31 LP` at the top, the badge, the exercise name, then the best set as `Kg` / `Reps` boxes, then an
LP progress bar. The whole card is washed in the tier colour, which makes the grid read as a
trophy cabinet.

### Calculator
The standalone rank tool, also reachable from Home's Discover grid.
- A `‹ ›` carousel of exercises with illustrations, plus `Search for another exercise…`.
- `WEIGHT` and `REPS` horizontal ruler pickers.
- A **`Save Rank` toggle** — on, the result is recorded as a real rank for that exercise without a
  logged workout. This matters: it is how someone ranks a lift they did before installing the app.
- `GET MY RANK!`, disabled until both values are non-zero.
- `Calculator History` beneath.

### Analysis
- **Average Ranks** — one card per exercise category (`Weightlifting: GOLD II`,
  `Calisthenics: UNRANKED`), `View All ›`.
- **Predictions** — per exercise: thumbnail, current best (`70kg x 7`), badge, and a
  `Next Rank  72.5x8` row with a progress bar. Same prescription the session's rank strip shows.
- **Statistics** — `Number of Rank Ups`, with a Su–Sa week row of counts and today ringed.
- **Rank Distribution** — a donut of your ranks by tier (`2 Ranks` in the hole), filterable by
  `Body Regions` and `Muscle Groups` with `‹ All ›` steppers.

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


## 7. ~~Nutrition tab~~ — removed

Cut by the owner: RepRush does not do food, calories or macros. The section is left as a numbered
tombstone rather than renumbered away, because comments across the codebase cite `SPEC §9` and
`SPEC §10`. See §11.

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
Top-bar right slot is a gear here.

**Shortcut grid** (2 rows of 5): Store · Inventory · Quests · Medals · Health · Reactions · Routines ·
Exercises · Stats · Feedback. (No "Pro".)

Cards, in order, and **reorderable by the user** (`Edit Profile Layout` at the bottom):
1. **Memories** — a two-week calendar, `Su`–`Sa`, one rounded cell per day. Days with a workout
   replace the number with **mini Bodygraph figures** of what was trained (two figures if both
   front and back were worked); today is ringed in the primary colour. `View All ›` → full
   month/year calendar.
2. **Last 7 Days** — front/back Bodygraph tinted by volume in the window (blue, not the amber the
   Recovery Zone uses — different meaning, different scale).
3. **Totals** — headline reads `Total 2m 47s`, with a `Duration | Volume | Reps` segmented control
   over a chart and a `Last 7 Days ⌄` window selector (7 days / 30 days / 6 months / year).
4. **Streaks** — weekday letters with filled amber day circles and today ringed, `🔥 N Best`, and
   the mascot with a contextual speech bubble (*"You're on a roll! Keep it up!"*). `View More ›`.
5. **Levels** — level hex, `60 / 522 XP` with the next level named on the right (`Lv.3`), a bar,
   `◈ 565 Total XP`, and a claim button that reads `Nothing to claim` when empty, plus a `?`.
6. **Ranks** — current Bodyrank + best-ever, `View All ›`.
7. **6-Month Activity** — workouts-per-week line chart.
8. **Routines** / **Exercises** / **Reactions** — lists with empty states.

### Edit Profile
A live preview of the header at the top (avatar with crown and gradient ring, gradient title,
display name, username, title hex), then cosmetic pickers as buttons — `Avatar` full width, then
`Picture` | `Title` and `Border` | `Banner` — then **Display Info**: Username, Display Name,
Bio (max 200), and `Preview Public Profile`. Saved with a `✓` in the header.

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
  posts, rank card layout); Haptic Feedback; Audio & SFX (rest-timer alert, soundscape).

---

## 10. Cross-cutting systems

### Streaks
A day counts if a tracked workout was completed. Weekday dot row; flaming mascot whose intensity
scales with streak length; best-ever streak. One "freeze" earned per 7-day streak, auto-spent to
cover a single missed day (max 2 banked). Streak screens are full-screen celebrations.

**A session with no logged sets is not a workout.** It counts towards nothing — not the streak,
not the workout total, not a medal, not Spark — because there is nothing in it. Tapping *start*
and then walking away used to record a training day, which is how a five-day streak displayed as
six. The rule is enforced where sessions are written rather than where they are counted, so no
counter has to remember it: `completeSession` discards an empty session instead of finishing one,
and `deleteSet` discards a finished session whose last set has just been removed. There is
therefore no such thing as a stored completed session with nothing in it, and every count over
`completedAt` is honest by construction.

For the same reason, **starting** a workout changes nothing: the session records which routine it
came from and finishing it is what stamps `routines.lastUsedAt`, so a day you began and abandoned
does not rotate your split.

### XP & Levels

**The award is itemised, and the user can see the itemisation.** `Show XP Breakdown` on the
post-session Progression screen expands to exactly these lines:

| Line | Observed | Meaning |
|---|---|---|
| `Workout` | 200 | the base award for completing a session |
| `Time Bonus` | 1 | scaled by duration |
| `PR Bonus` | 10 | per personal record set |
| `Streak Bonus` | 4 | scaled by current streak |

Other XP: claiming quests, referrals, logging bodyweight, first-time exercises.

Level curve: observed `Lv.2 → Lv.3` costs **522 XP** at a running total of 565, so level 2 begins
around 505 total XP. `xpForLevel(n) = 250 + 256n^1.4` rounded fits that closely enough — keep it and
check level 2 lands near 505.

Level-ups award currency and cosmetics, and fire the full-screen `LEVEL UP!` moment (§5.3.1).

### Currency
One soft currency (the "globe"), ours named **Spark**. Earned from level-ups, quests, referrals,
medals, and a per-session award shown as its own banner on the Progression screen (`200 Eggs
Earned!` in the source), with a small streak-scaled bonus (`+1 … Bonus` beside the week's flame
row). Spent on themes, borders, banners, titles, avatars. Nothing is purchasable with money.

### Medals
Achievement engine, evaluated after every session and every nightly job. v1's `achievements/`
module is the base — replace its rules, keep the module.

Shape, from the source's Medals screen:
- **Categories are rows, each with exactly five tiers.** Observed categories: `Total Workouts`,
  `Total Volume`, `Level Up!`, `On Fire!` (streak), `Quest Master`. Earned tiers render in their
  material; the next one is greyed but shows its emblem; the rest are `?`.
- **`Your Display` — three equip slots at the top**, shown on your public profile. Empty slots are
  dashed outlines with a `+`. This is what `Equip Medal` in the award dialog fills.
- Each medal carries an unlock condition (`Complete 1 workout`) and a flavour line.
- Header has a grid/list view toggle.

### Quests

Screen header: `Your Quests`, a `2 / 7` completion counter, and a strip with the level hex, the XP
bar and the currency balance.

Three groups, each with its own countdown:
- **Daily Quest** — one, with a `34 Minutes`-style timer. Observed: *Start a streak!* → 50 XP + 3.
- **Weekly Quests** — three, `6 Days`. Observed: *Rank up once!* → 300 + 5 ·
  *Workout with 3 different routines* → 300 + 20 · *Hit 3 personal records!* → 500 + 20.
- **Referral Quests** — no timer. *Refer 1 friend* → 100 + 25 · *Refer 3 friends* → 300 + 100 ·
  *Refer 5 friends* → 500 + 200.

Each row: icon, title, a progress bar labelled `1/1`, and a button that is `CLAIM` (blue) when
claimable, greyed when not, and `COMPLETE` once taken. Rewards sit under the button as
`◈ XP` + `🌐 currency`. Claimed rows keep a coloured border.

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
write paths (set logging with rank preview, reactions, quest claims). Rank/LP is computed
server-side on sync; the client shows an optimistic estimate and reconciles.

---

## 11. Explicit non-goals

**Nutrition in every form** — no food database, no calorie or macro tracking, no meal logging, no
Nutrition tab. The owner cut it outright: RepRush is a training app. Supplement and creatine
logging are *not* nutrition and stay — they are existing v1 features and live under
Profile → Health.

Also out: subscriptions, ads, trials, "Pro" tiers, Google/Apple sign-in, Strava, Discord,
real-money purchases, illustrated per-exercise artwork, and multi-language content beyond an i18n
scaffold with English filled in. All are in `MEMORY.md → Decisions` with reasons.

---

## 12. Subsystems the first pass missed

All three are visible in `more_inspiration/` and have no home in the sections above.

### 12.1 Goals — typed, dated, and 1RM-based

v1's `goals/` module has `type: 'bodyweight' | 'lift'` and a bare target number. The real thing is
bigger, and P5's Home card already leaves room for it.

**`New Goal` picks a type first**, as three description cards:
- **Strength Goal** — *"Crush your personal records and get stronger!"*
- **Bodyweight Goal** — *"Transform your body and reach your target weight!"*
- **Consistency Goal** — *"Build momentum with workout streaks!"* ← v1 has no equivalent

A strength goal then asks for `Target Exercise` (`Choose Exercise`), `KG` and `REPS`, and a
`Target Date`. Both numbers use the ruler/keypad pair from §5.2. The footer previews what it
computed — `Target 1RM  100 kg` and `Days Remaining  19 days` — before `Set New Goal`.

**The target is an estimated 1RM, not a working weight.** `100 kg × 1` becomes a 100 kg target;
entering reps converts through the same Epley e1RM the rank engine uses. That is the right call and
we should copy it: it makes "get to 100 kg bench" mean one thing regardless of how you test it.

The **Goals screen** lists one card per goal: title, overflow, `Current 1RM` with its tier marker, a
semicircular percent gauge, and a chart with a **dashed horizontal target line** plus a **dotted
projection curve** from today's point to the target date — so you can see whether you are on pace.
Then `Target 1RM`, `Days Remaining`, and `+ Add Goal`. The header carries a history icon.

### 12.2 Health Log

`Profile → Health`. A horizontally scrolling metric chip row — `Bodyweight · Height · Waist ·
Body Fat · Neck · Shoulder · Chest · Left Bicep · Right Bicep · …` — then `<Metric> Chart` with a
window selector (`1M`), an area chart, and a `Data Entries` list of `value + date` rows. `+` in the
header adds an entry. Empty metrics show a ghost chart behind a `No Data…` chip.

This supersedes v1's bodyweight-only logging: same idea, one table with a `metric` column.
Supplement and creatine tracking live here too (§11).

### 12.3 Routines and folders

`Profile → Routines`. `All Routines` with a folder icon and a `+`; routines live in **folders**
(`My Routines 0`) that expand, each with an overflow menu. `Create Folder` is a small titled dialog
with one text field and a `✓`.

`Create > New Routine` is deliberately bare: `Routine Name`, then `Workout Content` with a single
`+ Exercise` button. Everything else about a routine is set per-exercise afterwards.

### 12.4 Smaller things worth copying

- **The rest timer is global, not modal.** It docks above the tab bar and keeps counting while you
  browse other screens during a session.
- **Set rows go green as a whole row**, not just the checkbox. It is the clearest possible progress
  signal on a phone at arm's length in a gym.
- **Every celebration screen has a share button** beside its primary action.
- **`Predicted Rank:` prefixes the Bodyrank everywhere** until placements are done — never a bare
  tier that later changes meaning.
- A second reference app in the folder (`…gymworkout.gym.gymlog.gymtrainer…`) shows a simpler set
  logger worth remembering for P6: a per-exercise `0/3 Done` counter, a green ▶ marker on the active
  set row, and one big `LOG NEXT SET` button instead of per-row checkmarks. Lower friction than the
  grid when you are mid-set; possible fallback if the grid tests badly.
