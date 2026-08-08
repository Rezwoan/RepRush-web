# ROLLBACK — undoing the v2 cutover

If production is broken after the v2 cutover, this page gets it back to v1. Read the whole thing
once before running anything; it is short on purpose.

**The pre-cutover state, pinned:**

| Thing | Value |
|---|---|
| Last v1 commit on `main` | **`82f2a1317921c8d6a3c872b0c7ad409cad9e19c5`** (`feat: offline workout logging, last-session ghosts, progress page, 30d login`) |
| Prod DB backup | `reezz@blackbox.local:~/reprush-prod-backup-20260808.db` (942,080 bytes, md5 `a490d373b806c7fc9014e2c18b35c72a`) |
| Prod nginx vhost backup | `/etc/nginx/sites-available/reprush.bak-precutover-20260808` |
| Prod checkout | `/var/www/reprush` |
| Prod services | `reprush-backend` (3101), `reprush-frontend` (3100) |

---

## Decide first: is it the code or the data?

Two different failures, two different rollbacks. Check in this order.

```bash
ssh reezz@blackbox.local 'sudo journalctl -u reprush-backend -n 80 --no-pager'
curl -s -o /dev/null -w '%{http_code}\n' https://reprush.rezwoan.codes
curl -s -o /dev/null -w '%{http_code}\n' https://reprush.rezwoan.codes/api/auth/me   # want 401
```

- **App is down, or a screen is broken, but people's history is right** → §1. Code only. The
  database is *not* restored, so anything logged since cutover survives.
- **History is wrong, missing, or attached to the wrong account** → §2. Full restore. This
  **discards every workout logged since the cutover** — see the warning there.

The v2 schema is purely additive over v1's (nine new tables, new columns on `users`, `gym_sessions`
and `workout_sets`, none removed — verified in the P14 dry run). So a v1 build reads a
v2-migrated database perfectly happily and simply ignores the columns it does not know about.
**That is why §1 works without touching the data**, and it is the reason to try it first.

---

## §1 — Code rollback (the usual one, ~4 minutes, no data loss)

Point `main` back at the last v1 commit and let the normal deploy pipeline rebuild it.

```bash
# From a clone of the repo, not the Pi:
git fetch origin
git checkout main
git revert --no-edit -m 1 <merge-commit-sha>     # preferred: keeps history honest
git push origin main
```

`-m 1` is not optional — it tells git the first parent (v1 `main`) is the side to keep.

If the revert conflicts or you need production up *now*, force the branch instead and reconcile
later:

```bash
git checkout main
git reset --hard 82f2a1317921c8d6a3c872b0c7ad409cad9e19c5
git push --force-with-lease origin main
```

Either push triggers `.github/workflows/deploy.yml`. **GitHub's push-event delivery for this repo
runs badly behind — up to 30 minutes** (`MEMORY.md §8`). Do not wait on it in an outage. Deploy by
hand instead, which is the fast path and always safe:

```bash
ssh reezz@blackbox.local 'bash /var/www/reprush/scripts/deploy.sh'
```

That script resets to `origin/main`, rebuilds both, restarts both services and health-checks them —
so it ships whatever `main` currently points at, which is why the push has to land first.

**Verify:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://reprush.rezwoan.codes          # 200
curl -s -o /dev/null -w '%{http_code}\n' https://reprush.rezwoan.codes/api/auth/me  # 401
ssh reezz@blackbox.local 'cd /var/www/reprush && git log --oneline -1'          # the v1 commit
```

Then open the site, sign in, and confirm a session's history renders.

---

## §2 — Full restore, code **and** database

> **⚠️ This throws away every workout logged since the cutover.** The backup is a snapshot from
> 2026-08-08 05:36. Only do this if the data itself is wrong — a broken screen is §1.
>
> Before restoring, snapshot the current (post-cutover) database too, or you lose the only copy of
> whatever was logged in between and can never reconcile it.

```bash
ssh reezz@blackbox.local '
  set -e
  cp /var/www/reprush/backend/database/reprush.db ~/reprush-postcutover-$(date +%Y%m%d-%H%M%S).db
  sudo systemctl stop reprush-backend reprush-frontend
  cp ~/reprush-prod-backup-20260808.db /var/www/reprush/backend/database/reprush.db
  ls -la /var/www/reprush/backend/database/
'
```

Stopping the backend first is **required**, not tidiness: sql.js holds the entire database in
memory and rewrites the file on every flush, so a file swapped underneath a running service is
overwritten by the in-memory copy within seconds (`MEMORY.md §8`, P4).

Then do §1's code rollback, and start the services again:

```bash
ssh reezz@blackbox.local 'sudo systemctl start reprush-backend reprush-frontend'
```

**Sanity-check the restored file before trusting it** — a truncated database looks exactly like
data loss, and a freshly *seeded* one is ~127 KB where a real one is ~940 KB:

```bash
ssh reezz@blackbox.local 'ls -la /var/www/reprush/backend/database/reprush.db'   # ~942,080 bytes
```

Sign in and confirm the history is back: at the backup point production held **3 users, 51
sessions, 827 workout sets, 31 personal records** (user 5: 26 sessions / 433 sets / 16 PRs;
user 6: 25 / 394 / 15).

---

## §3 — The nginx change

The cutover also removed Next's year-long `Cache-Control` from production documents. It is
independent of the app rollback and almost certainly not your problem, but to undo it:

```bash
ssh reezz@blackbox.local '
  sudo cp /etc/nginx/sites-available/reprush.bak-precutover-20260808 /etc/nginx/sites-available/reprush
  sudo nginx -t && sudo systemctl reload nginx
'
```

Do **not** restore it reflexively. Without it, a returning browser serves a year-old HTML shell
that points at `/_next` chunks the deploy has already deleted — a white screen until a hard
refresh. That bug is the reason the change exists.

---

## §4 — What rolling back does *not* undo

- **Usernames and referral codes.** `SocialService` backfills one for every account at boot. They
  are new columns v1 ignores, so they are harmless, and they persist through a code rollback.
- **`exerciseId` on workout sets.** The v2 backfill writes it on first boot; v1 does not read it.
  Also harmless.
- **The orphan sweep.** v2's first boot deletes rows belonging to accounts that were already
  deleted — on this database, 3 `onboarding_progress` and 15 `user_plans` rows owned by long-gone
  users 2, 3 and 4. This is the fix for a real v1 bug (`MEMORY.md §8`, P9: SQLite reuses a deleted
  account's id, so orphans get *adopted* by the next signup). Only §2's full restore brings those
  rows back, and bringing them back reinstates the bug.
- **Anything a user's browser cached.** Service workers persist. If a rolled-back production still
  looks like v2 to someone, have them hard-refresh once; `skipWaiting` is on, so the next load
  takes the new worker.

---

## §5 — Dev is still there

The v2 stack at https://dev-reprush.rezwoan.codes is deliberately kept running after the cutover as
the ongoing staging environment (branch `v2`, ports 3120/3121, `/var/www/reprush-dev`). Reproduce
the failure there before rolling forward again — it has its own database and cannot affect
production.
