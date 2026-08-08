# Feedback

In-app feedback: a user writes a report, optionally tags a topic and attaches
screenshots; an admin reads and triages it.

Written to the standard in [`docs/ENGINEERING.md`](../ENGINEERING.md).

---

## 1. Why it exists, and why it looks like this

P10 removed a `Feedback` tile from the Profile grid because it opened a
"coming soon" for a form with no backend, on the rule that **a control which
opens nothing is worse than one that is not there**. This is that feature built
properly.

It ships with its **reader in the same change**. Feedback that nobody can read
is the exact defect this project has shipped four times — settings stored and
never read, routines writable and unrunnable (`ENGINEERING.md` §1) — so the
admin inbox is part of this feature, not a follow-up.

**Only the message is required.** The topic picker and the screenshots are
optional because the most useful report is the one someone actually sends, and
every required field is a reason not to send it.

---

## 2. Data model

`backend/src/feedback/feedback.entity.ts` — table `feedback`.

| Column | Type | Notes |
|---|---|---|
| `id` | pk | |
| `userId` | int, indexed | Author. The index serves "my reports"; the admin list is a full scan by design. |
| `topic` | string, nullable | One of `FEEDBACK_TOPICS`, or null. Optional by design. |
| `message` | text | Required, capped at 4,000 chars. |
| `images` | text, nullable | JSON array of **filenames** — never paths, never URLs. |
| `status` | string, nullable | One of `FEEDBACK_STATUSES`. Null reads as `new`. |
| `context` | text, nullable | Client build/platform, captured automatically. Display-only, never parsed. |
| `createdAt` | datetime | |

Both enums are exported const arrays and are the single source of truth;
`GET /feedback/meta` serves them so no client hardcodes the list.

### Why feedback is stored at all

Nearly everything else in RepRush is *derived* — ranks, leagues, streaks,
medals and posts are pure functions of `workout_sets` plus the profile
(`MEMORY.md` → Decisions). Feedback is the opposite: original user-authored
content that exists nowhere else and cannot be recomputed. So it gets a row.

---

## 3. Attachments

`backend/src/feedback/attachment.store.ts`

**Images go to the filesystem, not the database.** The backend runs sql.js,
which holds the entire database in memory and rewrites the whole file on every
flush — so a base64 screenshot in a column would slow every unrelated write in
the app for as long as the row existed. That is why posts refuse photos outright
(`MEMORY.md`, 2026-08-07). Feedback genuinely needs images, so the bytes go to
disk and the row keeps a filename.

- **Location:** `backend/uploads/feedback/`, gitignored — so `deploy.sh`'s
  `git reset --hard` cannot delete it, the same property that preserves `.env`
  and the database.
- **Naming:** `fb_<userId>_<random>_<contentHash>.<ext>`. Random rather than
  content-addressed: two people attaching an identical screenshot must not
  collide onto one file, or deleting either report would break the other.
- **Limits:** ≤ 6 images per report, ≤ 3 MB each *after* client compression,
  `image/jpeg | image/png | image/webp` only.
- **Not served statically.** Bytes come back through an authenticated endpoint
  so attachments cannot be enumerated by guessing URLs.
- **Not in the DB backup.** `deploy-dev.sh` snapshots the database, not the
  upload directory. Losing an attachment loses a screenshot, not a workout —
  an acceptable asymmetry, stated so nobody assumes otherwise.

### Client-side compression

`frontend/src/lib/image-compress.ts`

A phone screenshot is 2–5 MB. Six of them, base64 encoded (+33%), is ~40 MB —
past nginx's `client_max_body_size 12M`, over a gym's mobile connection, onto a
Pi's SD card. Compressed to 1600px on the long edge at JPEG q0.82 they land at
~200–400 KB each.

Client-side rather than server-side because the bytes that never leave the phone
are the cheapest in the system, and the Pi has no image library (adding `sharp`
means a native ARM build on every deploy for something `<canvas>` already does).
The canvas round-trip also **drops EXIF**, which is a privacy gain — phone
photos carry GPS coordinates.

PNG in, JPEG out. The canvas is filled white before drawing, or a transparent
PNG encodes to black.

---

## 4. Endpoints

All under `/api/feedback`, all authenticated. **There is no anonymous
submission path** — an open form writing files to the Pi is a spam funnel, and
everyone who can reach the screen is signed in anyway.

| Method | Path | Who | Notes |
|---|---|---|---|
| `GET` | `/meta` | any user | Topics, statuses, `maxImages`. |
| `POST` | `/` | any user | `{ message, topic?, images?, context? }`. Images are `data:` URLs. |
| `GET` | `/mine` | any user | The reporter's own history, newest first. |
| `GET` | `/all` | **admin** | Every report with its author. |
| `PATCH` | `/:id/status` | **admin** | Triage. |
| `DELETE` | `/:id` | author or admin | Removes the row, then the files. |
| `GET` | `/:id/image/:filename` | author or admin | Streams one attachment. |

Admin checks live **in the service**, not in a route decorator, so a new route
cannot forget one by omission.

---

## 5. Security boundary

The attachment route is the sharp edge here, and it has three defences:

1. **Path guard** — a filename arrives in a URL, and `../../.env` is a valid
   string. `assertSafeName` allows only `[A-Za-z0-9][A-Za-z0-9_.-]{0,99}` and
   rejects `..`. Verified by a boot self-check, because an assertion is a
   comment that cannot go stale.
2. **Ownership** — the requester authored the report, or is an admin.
3. **Membership** — the filename is listed *on that report*. Not redundant:
   without it, one valid report id plus a guessed filename would read any file,
   because `readFile` deliberately performs no authorisation of its own.

Ordering rules that prevent visible breakage:

- **Create:** files are written *before* the row. A failed upload fails the
  whole submission rather than leaving a report whose attachments 404 — which
  reads as data loss. A partial upload is cleaned up on the way out.
- **Delete:** the row goes *before* the files. A failure mid-way leaves an
  orphaned file rather than a row pointing at nothing — a wasted byte beats a
  broken screen.

`message` and `context` are length-capped, `topic` and `status` are allow-listed,
and an unrecognised topic is **dropped rather than rejected**: a stale client
sending a retired topic should still get its report through.

---

## 6. Screens

`frontend/src/app/(tabs)/profile/feedback.tsx` holds both halves deliberately —
separating them is how a feature ends up write-only.

- **Settings → Send feedback** (`/profile?view=feedback`) — message, optional
  topic chips, optional screenshots with previews and per-image sizes, plus
  *Your reports* underneath with each report's status, so submitting is not a
  shout into a void.
- **Settings → Feedback inbox** (`/profile?view=feedback-admin`, admins only) —
  every report, filterable by status, with attachments, the captured client
  context, a status control and delete.

---

## 7. Operations

- **Backups:** the database snapshot in `deploy-dev.sh` covers the rows.
  Attachments are not snapshotted (§3).
- **Deleting a user:** `UsersService.sweepOrphanedRows` is driven by
  `sqlite_master`, so it picks this table up automatically via its `userId`
  column. ⚠️ **Their attachment files are not swept** — the sweep works at the
  SQL layer and knows nothing about the disk. Low-volume and low-risk, but it is
  a real gap; see §8.
- **Disk:** 6 × ~400 KB per report. A thousand reports is under 2.5 GB, and the
  Pi had 36 GB free at the time of writing.

---

## 8. Deliberately not built

- **Anonymous submission** — see §4.
- **Email notification on a new report.** The mail path exists (`MailModule`),
  but a notification for the first handful of reports is a cron and a template
  for something an admin will see by opening the inbox.
- **Replies / a conversation thread.** A status the reporter can see covers the
  real need ("was this seen?"). A thread needs its own table, notifications and
  a read model — build it when a report actually needs a back-and-forth.
- **Orphaned-file sweep on user deletion** (§7). Wants a small job that lists
  the directory and drops anything with no row. `ponytail:` noted, not urgent at
  this volume.
- **Object storage.** Local disk is correct for one host. Everything routes
  through `saveDataUrl` / `readFile` / `deleteFiles`, so the swap is one file.
