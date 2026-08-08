# Engineering & Documentation Standard

> **Audience: the next agent.** This file is read by AI coding agents and humans
> working on RepRush. It defines how code in this repository is written and
> commented. It is binding on all new code.
>
> Related reading, in order: `AGENTS.md` (production-safety rules),
> `SESSION_START.md` (how a v2 session boots), `MEMORY.md` (durable facts and
> decisions), `PROGRESS.md` (what is done and what is next),
> `docs/v2/SPEC.md` (the product spec).

---

## 1. Why this file exists

Most of the bugs found in this project were not logic errors. They were
**disconnections** — something built correctly and then never wired up:

| Defect | What it looked like | Why it survived |
|---|---|---|
| Six preferences stored and read by nothing (P13) | Toggles that changed nothing | Nobody grepped from the reader's side |
| Routines with full CRUD and no way to run one (P15) | A library you could write to and never use | The consumer was never written |
| Push disabled on dev for want of a config key (P15) | "Permission granted, still not working" | Env drift between stacks, invisible in code |
| Level and Spark passed nowhere (P15) | Numbers absent from the whole app | A TODO comment naming a phase that had shipped |

Comments in this codebase exist to make that class of defect visible while
reading. That is the standard: **a comment earns its place by recording
something the code cannot say about itself.**

---

## 2. The documentation contract

### 2.1 Every file starts with a header comment

State, in this order:

1. **What this is** — one line.
2. **Why it exists / what problem it solves** — especially if it replaced
   something, and what was wrong with what it replaced.
3. **The load-bearing constraint** — the fact that, if forgotten, causes the
   next person to break it.

```ts
/**
 * The routine editor.
 *
 * A routine exercise is an **array of set rows**, each with its own weight and
 * reps — not a set count plus one shared rep range, which is what the first
 * version stored and which cannot express a top set of 3 under two back-offs
 * of 8.
 *
 * Blank is a real value: a row with no numbers means "whatever I did last
 * time", and the tracker fills it from history — a lookup, never a projection.
 */
```

A header that says `// Routine editor component` is worthless. Delete it or
write the real one.

### 2.2 Every exported symbol has a doc comment

Public functions, services, entities, endpoints, React components and hooks
carry a `/** … */` naming their **contract**: what goes in, what comes out, what
they assume, and what they will not do.

Document the **failure modes**, not just the happy path:

```ts
/**
 * Resolve a v1 free-text `workout_sets.exerciseName` to a catalog id.
 * Returns null for names with no catalog equivalent (e.g. "Core Exercise
 * (User Choice)"), which is a legitimate outcome, not a failure.
 */
```

### 2.3 Non-obvious lines carry a `why`, never a `what`

```ts
// BAD — restates the code
// increment the counter
count++;

// GOOD — records what the code cannot say
// `+ 7` before the modulo: under a Monday start, Sunday is six days into the
// week that has already begun, not minus one day of the next.
const column = (d: Date) => (d.getDay() - firstDay + 7) % 7;
```

### 2.4 Record the decision, and the alternative you rejected

When a choice could plausibly have gone the other way, say which way it went and
why. This is the single highest-value comment type for an agent, because it
prevents a well-meaning "improvement" that reintroduces a solved problem.

```ts
// A share is a fork, not shared ownership: "use it, edit it, make their own"
// is a copy. Shared mutable ownership would mean one person's edit silently
// rewriting someone else's training week, and needs a permission model nothing
// else in this app has.
```

Decisions with project-wide reach also go in `MEMORY.md` → *Decisions*, dated,
with a one-line why. **Both, not either.**

### 2.5 Mark deliberate shortcuts with `ponytail:`

Name the ceiling and the upgrade path, so the limit is discoverable before it is
hit rather than after.

```ts
// ponytail: sql.js holds the whole DB in memory and rewrites the file on
// flush — fine at one-user scale. Past ~50 concurrent users or a ~50 MB file,
// switch to better-sqlite3 (same SQL, drop-in for TypeORM).
```

Harvest them with `/ponytail-debt`.

### 2.6 Warn at the trap, not in a file nobody opens

If a value is easy to misuse, say so where it is used:

```ts
// `weightKg` is the *added* weight, not the load: a pull-up logs 0. The
// obvious `${weightKg} kg × ${reps}` renders "0 kg × 8" and reads as a bug.
```

---

## 3. Rules that produce correct code here

### 3.1 Before building, ask what reads it

Every new table, column, preference or prop needs a named consumer **in the same
change**. If there is no reader yet, do not build the writer. This rule exists
because it was broken four times.

### 3.2 Validate at the trust boundary

Anything a user can type is input, even if today only our own UI writes it.
Clamp ranges, allow-list enums, drop unknown keys, and require foreign ids to
resolve. Prefer dropping a bad row to failing the whole request.

`saveRoutine` was `JSON.stringify(whatever)` for exactly as long as only our
picker wrote to it. The moment sets and reps became editable, it was a hole.

### 3.3 Derive rather than store

Ranks, leagues, streaks, medals and posts are all pure functions of
`workout_sets` plus the profile. A stored copy can disagree with its source and
needs a backfill and a cron to stay honest. Store only what cannot be
re-derived — e.g. `reward_claims`, because a spent reward leaves no trace in the
sets.

### 3.4 Schema changes are additive

`synchronize: true` is on. **Adding** nullable columns and tables is safe.
Removing or renaming loses data. A NOT NULL column added to an existing table
can make SQLite rebuild it. Use `@Index({ unique: true })`, never
`@Column({ unique: true })` — the latter rebuilds the table.

### 3.5 Non-trivial logic ships with one runnable check

An assert-based `__selfcheck()` in the same file, run at boot (backend) or from
`/kitchen-sink` (frontend). No test framework. A failing check should take the
service down: a silently mis-ranking app is worse than one that will not start.

Assert the **boundary cases**, not the happy path — that is where the bugs were.

### 3.6 Preferences and other client state are read in an effect

They come from `localStorage`, which the server pass cannot see. Reading during
render makes the first client render disagree with the server HTML and React
discards the tree. Same rule as `use-idle-motion.ts`.

### 3.7 Writes during a workout go through the outbox

Never call `workoutsApi.logSet` / `deleteSet` / `completeSession` from a
component. Queue it, or an offline user silently loses the set. Every queued
write carries `X-Idempotency-Key`.

### 3.8 Opening a detail view from a live screen is a Sheet, not a route

The session screen holds drafts, a focused cell and a rest timer in local state.
Navigating away and back loses all three.

---

## 4. Writing for an AI agent specifically

Agents read a slice of the repo, not all of it. Optimise for **local
sufficiency** — a reader who opened only this file should not need another to
avoid breaking it.

- **Name the file that holds the other half.** "Mirrors `DEFAULT_PREFERENCES` in
  `backend/src/profile/profile.service.ts`" turns an invisible coupling into a
  greppable one.
- **State invariants as assertions where possible**, prose where not. An
  assertion is a comment that cannot go stale.
- **Say what must NOT be done, and why.** Prohibitions are what an agent most
  often violates, because the reason is usually elsewhere.
- **Prefer one honest paragraph to five hedged ones.** If the explanation is
  longer than the code, the code is probably wrong.
- **Do not write comments that will rot.** A comment naming a future phase
  (`// arrives with P11`) must be grepped for when that phase closes — one such
  comment outlived its phase by four and hid a real gap.

### A feature-level doc under `docs/v2/`

Anything with its own data model, storage or lifecycle gets a page covering:
the data model, the endpoints, the storage decisions and their reasons, the
security and privacy boundary, operational notes (backup, deploy, cleanup), and
what was deliberately not built. `docs/v2/FEEDBACK.md` is the reference example.

---

## 5. Checklist before calling a change done

- [ ] Both builds pass: `cd backend && npm run build`, `cd frontend && npm run build`
- [ ] Every new writer has a named reader, and it exists
- [ ] User input is validated at the boundary
- [ ] Schema changes are additive and nullable
- [ ] Non-trivial logic has one runnable check, asserting boundary cases
- [ ] File headers say *why*, exported symbols state contracts, traps are marked
- [ ] Decisions with reach are in `MEMORY.md` → *Decisions*, dated
- [ ] `PROGRESS.md` updated: tasks ticked, session log appended
- [ ] Verified on dev against real data, not only a fixture
- [ ] Test accounts deleted; production untouched
