import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The subjects a user can optionally tag a report with.
 *
 * Optional by design: forcing a category on someone who just wants to say
 * "the rest timer is too loud" is a question they should not have to answer.
 * `other` exists so the picker never traps a report that fits nothing.
 *
 * **Allow-list.** Anything not in this array is dropped on write, so a stale
 * client cannot store a value no screen knows how to render or filter.
 * Appending is safe; renaming or removing an entry orphans existing rows.
 */
export const FEEDBACK_TOPICS = [
  'bug',
  'idea',
  'workout',
  'ranks',
  'social',
  'design',
  'performance',
  'account',
  'other',
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];

/** Triage state. Set by an admin; the reporter only ever sees their own. */
export const FEEDBACK_STATUSES = ['new', 'read', 'planned', 'done', 'declined'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * One feedback report.
 *
 * ## Why this is a table
 *
 * Most things in this app are derived rather than stored (ranks, leagues,
 * streaks and posts are all pure functions of `workout_sets` plus the profile —
 * see `MEMORY.md` → Decisions). Feedback is the opposite case: it is original
 * user-authored content that exists nowhere else and cannot be recomputed from
 * anything. So it gets a row.
 *
 * ## Why images are NOT in this table
 *
 * `images` holds **filenames**, not image data. sql.js keeps the entire
 * database in memory and rewrites the whole file on every flush, so a single
 * base64 screenshot stored here would make every unrelated write in the app
 * slower for as long as the row exists. That is the same reasoning that keeps
 * photos off posts (`MEMORY.md`, 2026-08-07) — but unlike posts, feedback has a
 * genuine need for images, so the bytes go to disk instead of being refused.
 *
 * See `attachment.store.ts` for where they land and how they are named.
 *
 * ## Retention
 *
 * Deleting a user sweeps their rows via `UsersService.sweepOrphanedRows`, which
 * is driven by `sqlite_master` and so picks this table up automatically because
 * it has a `userId` column. The **files** are swept separately — see
 * `FeedbackService.deleteReport`.
 */
@Entity('feedback')
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Author. Indexed because the only per-user query is "my reports", and the
   * admin list is a full scan by design (feedback is low-volume).
   */
  @Index()
  @Column()
  userId: number;

  /** One of `FEEDBACK_TOPICS`, or null — the picker is optional. */
  @Column({ nullable: true })
  topic: string;

  /** The report itself. Required: an empty report is not a report. */
  @Column({ type: 'text' })
  message: string;

  /**
   * JSON array of stored filenames, e.g. `["fb_12_a1b2c3.jpg"]`.
   *
   * Filenames only — never paths and never URLs. The directory is resolved at
   * read time by `attachment.store.ts`, so moving the upload directory is a
   * one-line change and cannot invalidate existing rows.
   */
  @Column({ type: 'text', nullable: true })
  images: string;

  /** Triage state, one of `FEEDBACK_STATUSES`. Null is treated as `new`. */
  @Column({ nullable: true })
  status: string;

  /**
   * Client build and platform, captured automatically.
   *
   * Not a form field: asking someone to type their browser version is asking
   * them to do work the client already knows the answer to, and they will get
   * it wrong. Free-text and untrusted — it is display-only, never parsed.
   */
  @Column({ type: 'text', nullable: true })
  context: string;

  @CreateDateColumn()
  createdAt: Date;
}
