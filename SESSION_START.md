# SESSION_START — RepRush v2

**Paste this file's path (or its contents) into a fresh session. Nothing else is required from the user.**

You are continuing an autonomous, multi-session rebuild of RepRush into the product described in
`inspiration/` (91 screenshots of the app *Liftoff*, which the owner has said is his actual vision).

The owner has explicitly delegated **all** decisions. Do not ask questions, do not request
permission, do not ask for resources, do not present options. Decide, act, verify, record, continue.
If something is ambiguous, pick the option that best matches `docs/v2/SPEC.md`, write the decision
into `MEMORY.md` under *Decisions*, and move on.

---

## 0. Boot sequence (do this every session, in order)

1. Read `MEMORY.md` — durable facts, infra truth, conventions, decisions already made.
2. Read `PROGRESS.md` — find the first phase whose status is not `DONE`. That is your work.
3. Read the relevant section of `docs/v2/SPEC.md` for that phase.
4. Read `AGENTS.md` — the production-safety rules still apply to anything under `main`.
5. `git fetch --all && git checkout v2 && git pull` (create `v2` from `main` if it does not exist).
6. Work. Then run the **Definition of Done** below before you stop.

Do **not** re-read the `inspiration/` screenshots. `docs/v2/SPEC.md` is the distilled output of
reading all 91 of them; re-reading costs ~150k tokens and adds nothing. Only open a specific
screenshot if `SPEC.md` is genuinely silent on a detail you need, and then open only that one.

---

## 1. Hard rules (violating any of these breaks the live app)

- **All v2 work happens on branch `v2`.** Never commit v2 work to `main`.
- `main` → https://reprush.rezwoan.codes (live, real users). It must keep working, unchanged.
- `v2` → https://dev-reprush.rezwoan.codes (the rebuild).
- Prod ports **3100/3101**. Dev ports **3120/3121**. Every other port on that Pi belongs to another
  project — see the verified port map in `MEMORY.md §2`.
- Never commit `.env` / `.env.local`.
- Backend keeps `app.setGlobalPrefix('api')`. nginx routes `/api/` → backend, `/` → frontend.
- TypeORM runs `synchronize: true`. **Adding** columns/entities is safe. **Removing or renaming**
  columns destroys data — back up the dev DB first, and never do it to prod's.
- Git commits: conventional commits, **no AI attribution / co-author trailers** (owner's standing
  preference).

---

## 2. Definition of Done — run before ending ANY session

Never end a session with the repo in a half-state. In order:

```bash
cd backend  && npm run build     # must exit 0
cd ../frontend && npm run build  # must exit 0
```

Then:

1. Fix anything red. A broken build on `v2` blocks the next session.
2. Update `PROGRESS.md`: tick completed tasks, update the phase status line, append a dated entry
   to the **Session Log** (what you did, what you learned, what is next, and any blocker).
3. Append any new durable fact or decision to `MEMORY.md`.
4. Commit and push to `v2`. This auto-deploys to dev-reprush via the Pi runner.
5. Verify the deploy: `curl -s -o /dev/null -w '%{http_code}' https://dev-reprush.rezwoan.codes`
   → expect 200/302/307. If the deploy failed, fix it *now*, in this session.

If you are running out of context mid-phase, stop at the next clean boundary, run the steps above,
and leave a precise "resume here" note in the Session Log. Never leave a phase mid-edit without a
note.

---

## 3. Working style

- Small, verifiable increments. Build after every meaningful change, not at the end.
- Reuse what exists (`frontend/src/components/ui/*`, `lib/offline.ts`, `lib/api.ts`) before writing new.
- Prefer one file over three. Prefer stdlib/native/already-installed over a new dependency.
- Non-trivial logic (rank math, recovery decay, streak rules, e1RM) gets one runnable assert-based
  self-check next to it. No test frameworks.
- Every deliberate shortcut gets a `ponytail:` comment naming the ceiling and the upgrade path.
- **Search for a free, openly-licensed asset before authoring one.** This was got wrong once
  already — see `MEMORY.md §9` for the sourcing policy and what is already adopted. Hand-authoring
  is the fallback, not the default.
- Do not copy any asset from `inspiration/` — those are another company's.

---

## 4. If you get stuck

| Symptom | Do this |
|---|---|
| SSH to the Pi fails | `ssh reezz@blackbox.local 'echo ok'`. If it fails, note it in PROGRESS.md, skip infra tasks, and continue with code-only phases. Do not block. |
| Dev deploy red | `ssh reezz@blackbox.local 'sudo journalctl -u reprush-dev-backend -n 60 --no-pager'` |
| A phase is bigger than one session | Split it. Add the sub-tasks to PROGRESS.md, do the first ones, note where you stopped. |
| Something in SPEC.md is impossible/wrong | Change SPEC.md, log why in MEMORY.md → Decisions, proceed. You own the spec. |

---

## 5. Owner-facing summary

At the end of each session, print 5 lines max to the user: phase, what shipped, what's next, dev
URL, any blocker. No essays.
