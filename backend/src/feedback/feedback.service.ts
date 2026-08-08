import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TOPICS,
  Feedback,
  type FeedbackStatus,
  type FeedbackTopic,
} from './feedback.entity';
import { MAX_IMAGES, deleteFiles, readFile, saveDataUrl } from './attachment.store';

/** Longest report accepted. Long enough for a real bug report, short enough to store. */
const MAX_MESSAGE = 4000;

/** Longest client-context string kept. Display-only, never parsed. */
const MAX_CONTEXT = 300;

/** Payload accepted by `POST /feedback`. Everything but `message` is optional. */
export interface CreateFeedbackDto {
  message: string;
  topic?: string | null;
  /** `data:image/…;base64,…` strings, already downscaled by the client. */
  images?: string[];
  context?: string | null;
}

const parseImages = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Feedback: submit, read your own, and (as an admin) read and triage everyone's.
 *
 * ## Why this exists at all
 *
 * P10 removed a `Feedback` tile from the Profile grid because it opened a
 * "coming soon" for a form with no backend, on the rule that *a control which
 * opens nothing is worse than one that is not there*. This is that feature
 * built for real, and it ships with its reader in the same change — the admin
 * list — because a feature that only writes is the defect this project has
 * shipped four times (`docs/ENGINEERING.md` §1).
 *
 * ## Trust boundary
 *
 * Everything here arrives from a user. `topic` and `status` are allow-listed
 * against their const arrays; `message` and `context` are length-capped;
 * attachments are type- and size-checked in `attachment.store.ts`. Unknown
 * fields are ignored rather than stored.
 */
@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback) private reports: Repository<Feedback>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /**
   * Store one report.
   *
   * @throws BadRequestException when the message is blank or there are too many
   *         images. A blank report is the one thing that cannot be salvaged:
   *         a screenshot with no words does not say what is wrong with it.
   *
   * Images are written to disk **before** the row is saved, so a failed upload
   * fails the whole submission rather than leaving a report that references
   * files that were never written. The opposite order would produce a row whose
   * attachments 404 — which reads as data loss.
   */
  async create(userId: number, dto: CreateFeedbackDto) {
    const message = String(dto?.message ?? '').trim().slice(0, MAX_MESSAGE);
    if (!message) throw new BadRequestException('Tell us what happened first');

    const incoming = Array.isArray(dto?.images) ? dto.images : [];
    if (incoming.length > MAX_IMAGES) {
      throw new BadRequestException(`Up to ${MAX_IMAGES} images per report`);
    }

    // Anything not on the list is dropped rather than rejected: a stale client
    // sending a retired topic should still get its report through. The words
    // matter less than the report.
    const topic = FEEDBACK_TOPICS.includes(dto?.topic as FeedbackTopic)
      ? (dto.topic as FeedbackTopic)
      : null;

    const stored: string[] = [];
    try {
      for (const image of incoming) stored.push(saveDataUrl(image, userId));
    } catch (err) {
      // Do not leave half an upload on disk for a report that will not exist.
      deleteFiles(stored);
      throw err;
    }

    const row = await this.reports.save(
      this.reports.create({
        userId,
        message,
        topic,
        images: stored.length ? JSON.stringify(stored) : null,
        status: 'new',
        context: dto?.context ? String(dto.context).slice(0, MAX_CONTEXT) : null,
      }),
    );

    return this.shape(row);
  }

  /** The reporter's own history, newest first, so a report is not a shout into a void. */
  async listMine(userId: number) {
    // `id` breaks the tie: `createdAt` is second-granular, so three reports
    // sent in the same second come back in insertion order — which reads as a
    // random shuffle on a screen that claims to be newest-first.
    const rows = await this.reports.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return rows.map((r) => this.shape(r));
  }

  /**
   * Every report, newest first, with its author — admin only.
   *
   * A full scan on purpose: feedback is low-volume, and paginating a table that
   * will hold tens of rows would be scaffolding for a problem that does not
   * exist. ponytail: add a cursor if this ever passes a few hundred rows.
   */
  async listAll(user: User) {
    this.assertAdmin(user);
    const rows = await this.reports.find({ order: { createdAt: 'DESC', id: 'DESC' } });
    const authors = new Map(
      (await this.users.find()).map((u) => [u.id, { name: u.name, username: u.username ?? null }]),
    );
    return rows.map((r) => ({ ...this.shape(r), author: authors.get(r.userId) ?? null }));
  }

  /** Triage. Admin only; the reporter cannot mark their own report done. */
  async setStatus(user: User, id: number, status: string) {
    this.assertAdmin(user);
    if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
      throw new BadRequestException('Unknown status');
    }
    const row = await this.reports.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Report not found');
    row.status = status;
    await this.reports.save(row);
    return this.shape(row);
  }

  /**
   * Delete a report and its files.
   *
   * The reporter may delete their own (they may have attached something they
   * did not mean to); an admin may delete any. Files go **after** the row, so a
   * failure mid-way leaves an orphaned file rather than a row pointing at
   * nothing — a wasted byte beats a broken screen.
   */
  async deleteReport(user: User, id: number) {
    const row = await this.reports.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Report not found');
    if (row.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('That is not your report');
    }
    const files = parseImages(row.images);
    await this.reports.remove(row);
    deleteFiles(files);
    return { ok: true };
  }

  /**
   * Read one attachment, with both checks that make it safe.
   *
   * 1. **Ownership** — the requester authored the report, or is an admin.
   * 2. **Membership** — the filename is actually listed on *that* report.
   *
   * The second is not redundant. Without it, anyone with one valid report id
   * could read any file on disk by naming it, because `readFile` deliberately
   * performs no authorisation of its own.
   */
  async readImage(user: User, id: number, filename: string) {
    const row = await this.reports.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Report not found');
    if (row.userId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('That is not your report');
    }
    if (!parseImages(row.images).includes(filename)) {
      throw new NotFoundException('No such attachment on that report');
    }
    const buf = readFile(filename);
    if (!buf) throw new NotFoundException('Attachment is no longer on disk');
    return buf;
  }

  private assertAdmin(user: User) {
    if (user?.role !== UserRole.ADMIN) throw new ForbiddenException('Admins only');
  }

  /**
   * The wire shape.
   *
   * `images` becomes a list of **URLs**, not filenames: the client should never
   * need to know how an attachment is addressed, and the route is the only
   * thing that will let it read one.
   */
  private shape(r: Feedback) {
    const files = parseImages(r.images);
    return {
      id: r.id,
      userId: r.userId,
      topic: r.topic ?? null,
      message: r.message,
      status: r.status ?? 'new',
      context: r.context ?? null,
      createdAt: r.createdAt,
      images: files.map((name) => `/api/feedback/${r.id}/image/${name}`),
    };
  }
}
