import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from '../ranks/ranks.service';
import type { Rank } from '../ranks/standards';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { streaks } from '../home/home.service';
import { Friendship } from './friendship.entity';
import { PostReaction } from './post-reaction.entity';
import { PostComment } from './post-comment.entity';

/** The reaction set (SPEC §4 — "emoji reactions, not just likes"). */
export const REACTIONS = ['🔥', '💪', '👏', '😤', '🐐'] as const;

/** Ambiguity-free alphabet: no O/0, no I/1. Referral codes get typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const MAX_COMMENT = 500;
const FEED_PAGE = 20;
const VOLUME_WINDOW_DAYS = 30;

/** Referral quests (SPEC §8). Rewards are *shown*; granting them is P11's ledger. */
const REFERRAL_QUESTS = [
  { id: 'refer-1', target: 1, label: 'Refer 1 friend', xp: 250, currency: 100 },
  { id: 'refer-3', target: 3, label: 'Refer 3 friends', xp: 750, currency: 350 },
  { id: 'refer-5', target: 5, label: 'Refer 5 friends', xp: 1500, currency: 800 },
];

export type FeedScope = 'friends' | 'discovery';

export const LEADERBOARD_METRICS = [
  'bodyrank',
  'lp',
  'volume',
  'streak',
  'workouts',
  'relative',
  'wilks',
  'progress',
] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

export interface PublicUser {
  id: number;
  name: string;
  username: string | null;
  avatarId: string | null;
  profileImage: string | null;
}

export interface Post {
  sessionId: number;
  user: PublicUser;
  rank: Rank | null;
  completedAt: string;
  caption: string | null;
  privacy: string;
  durationSec: number;
  volumeKg: number;
  sets: number;
  prs: number;
  muscles: { muscleId: string; share: number }[];
  exercises: string[];
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
  comments: number;
}

const publicUser = (u: User): PublicUser => ({
  id: u.id,
  name: u.name ?? u.email?.split('@')[0] ?? 'Athlete',
  username: u.username ?? null,
  avatarId: u.avatarId ?? null,
  profileImage: u.profileImage ?? null,
});

/** `Rezwoan Fahim` → `rezwoanfahim`. Empty (all-punctuation) names fall back to `athlete`. */
export function slugifyUsername(raw: string): string {
  const slug = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
  return slug.length >= 3 ? slug : `athlete${slug}`;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

@Injectable()
export class SocialService implements OnModuleInit {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(GymSession) private sessions: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private sets: Repository<WorkoutSet>,
    @InjectRepository(Friendship) private friendships: Repository<Friendship>,
    @InjectRepository(PostReaction) private reactions: Repository<PostReaction>,
    @InjectRepository(PostComment) private commentRepo: Repository<PostComment>,
    private catalog: CatalogService,
    private ranks: RanksService,
    private v1Leaderboard: LeaderboardService,
  ) {}

  /**
   * Give every existing account a handle and a referral code.
   *
   * Both are new in P9 and every account predates them. A backfill at boot beats
   * the alternatives: a per-request lazy write turns `/auth/me` into a write, and
   * a "pick a username" nag screen is a wall between an existing user and the app
   * they already had.
   *
   * ponytail: one pass over the users table at startup. Trivial at this scale
   * (sql.js holds the whole DB in memory anyway); if the table ever gets big,
   * make it a one-shot migration flag instead.
   */
  async onModuleInit() {
    const pending = await this.users.find({
      where: [{ username: IsNull() }, { referralCode: IsNull() }],
    });
    if (!pending.length) return;

    for (const user of pending) {
      try {
        if (!user.username) {
          user.username = await this.freeUsername(
            slugifyUsername(user.name || user.email?.split('@')[0] || ''),
          );
        }
        if (!user.referralCode) user.referralCode = await this.freeReferralCode();
        await this.users.save(user);
      } catch (err) {
        // A backfill failure must never stop the app booting — the user simply
        // has no handle yet and search will not find them.
        this.logger.warn(`backfill failed for user ${user.id}: ${err?.message ?? err}`);
      }
    }
    this.logger.log(`backfilled handles for ${pending.length} user(s)`);
  }

  // ── handles and codes ─────────────────────────────────────────────

  /** First free variant of `base`: `rez`, `rez2`, `rez3`… */
  async freeUsername(base: string): Promise<string> {
    const root = slugifyUsername(base);
    for (let n = 1; n < 1000; n++) {
      const candidate = n === 1 ? root : `${root.slice(0, 20 - String(n).length)}${n}`;
      if (!(await this.users.findOne({ where: { username: candidate } }))) return candidate;
    }
    throw new BadRequestException('Could not find a free username');
  }

  async freeReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!(await this.users.findOne({ where: { referralCode: code } }))) return code;
    }
    throw new BadRequestException('Could not allocate a referral code');
  }

  // ── the friend graph ──────────────────────────────────────────────

  /** Accepted friends only, in both directions. */
  async friendIds(userId: number): Promise<number[]> {
    const rows = await this.friendships.find({
      where: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
    });
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }

  private async edge(a: number, b: number) {
    return this.friendships.findOne({
      where: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    });
  }

  async friends(userId: number) {
    const rows = await this.friendships.find({
      where: [{ requesterId: userId }, { addresseeId: userId }],
      order: { createdAt: 'DESC' },
    });
    const otherId = (r: Friendship) => (r.requesterId === userId ? r.addresseeId : r.requesterId);
    const people = await this.byIds(rows.map(otherId));

    const shape = async (r: Friendship) => {
      const u = people.get(otherId(r));
      if (!u) return null;
      return { ...publicUser(u), rank: (await this.ranks.bodyrank(u.id)).rank, since: r.createdAt };
    };

    const accepted = rows.filter((r) => r.status === 'accepted');
    const incoming = rows.filter((r) => r.status === 'pending' && r.addresseeId === userId);
    const outgoing = rows.filter((r) => r.status === 'pending' && r.requesterId === userId);

    return {
      friends: (await Promise.all(accepted.map(shape))).filter(Boolean),
      incoming: (await Promise.all(incoming.map(shape))).filter(Boolean),
      outgoing: (await Promise.all(outgoing.map(shape))).filter(Boolean),
    };
  }

  /**
   * Ask to be friends — or accept, if they already asked you.
   *
   * The auto-accept matters: without it two people who both tap `Add` sit in a
   * deadlock of mutual pending requests, each waiting for the other.
   */
  async request(userId: number, targetId: number) {
    if (userId === targetId) throw new BadRequestException('You cannot add yourself');
    const target = await this.users.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');

    const existing = await this.edge(userId, targetId);
    if (existing?.status === 'accepted') return { status: 'accepted' };
    if (existing) {
      if (existing.requesterId === userId) return { status: 'pending' };
      existing.status = 'accepted';
      existing.respondedAt = new Date();
      await this.friendships.save(existing);
      return { status: 'accepted' };
    }

    await this.friendships.save(
      this.friendships.create({ requesterId: userId, addresseeId: targetId, status: 'pending' }),
    );
    return { status: 'pending' };
  }

  async respond(userId: number, requesterId: number, accept: boolean) {
    const row = await this.friendships.findOne({
      where: { requesterId, addresseeId: userId, status: 'pending' },
    });
    if (!row) throw new NotFoundException('No pending request from that user');
    if (!accept) {
      await this.friendships.remove(row);
      return { status: 'none' };
    }
    row.status = 'accepted';
    row.respondedAt = new Date();
    await this.friendships.save(row);
    return { status: 'accepted' };
  }

  /** Remove a friend, or withdraw a request you sent. Same row either way. */
  async remove(userId: number, otherId: number) {
    const row = await this.edge(userId, otherId);
    if (row) await this.friendships.remove(row);
    return { status: 'none' };
  }

  async search(userId: number, q: string) {
    const term = (q || '').trim().toLowerCase();
    if (term.length < 2) return [];

    // ponytail: an in-memory filter over every account. `LIKE` on two columns
    // would be the same query cost at this scale and would not fold case the
    // same way across engines; swap to a query builder past a few thousand users.
    const all = await this.users.find({ where: { role: UserRole.USER } });
    const hits = all
      .filter(
        (u) =>
          u.id !== userId &&
          ((u.username ?? '').toLowerCase().includes(term) ||
            (u.name ?? '').toLowerCase().includes(term)),
      )
      .slice(0, 20);

    const edges = await this.friendships.find({
      where: [{ requesterId: userId }, { addresseeId: userId }],
    });
    const statusOf = (id: number) => {
      const row = edges.find(
        (e) =>
          (e.requesterId === userId && e.addresseeId === id) ||
          (e.addresseeId === userId && e.requesterId === id),
      );
      if (!row) return 'none';
      if (row.status === 'accepted') return 'friends';
      return row.requesterId === userId ? 'outgoing' : 'incoming';
    };

    return hits.map((u) => ({ ...publicUser(u), status: statusOf(u.id) }));
  }

  // ── referrals ─────────────────────────────────────────────────────

  async referral(userId: number, frontendUrl: string) {
    const me = await this.users.findOne({ where: { id: userId } });
    if (!me) throw new NotFoundException('User not found');
    if (!me.referralCode) {
      me.referralCode = await this.freeReferralCode();
      await this.users.save(me);
    }

    const referred = await this.users.find({ where: { referredByUserId: userId } });
    const referrer = me.referredByUserId
      ? await this.users.findOne({ where: { id: me.referredByUserId } })
      : null;

    return {
      code: me.referralCode,
      link: `${frontendUrl.replace(/\/$/, '')}/welcome?ref=${me.referralCode}`,
      claimedFrom: referrer ? publicUser(referrer) : null,
      referred: referred.map(publicUser),
      // `claimable` is always false until P11 owns the XP and currency ledgers.
      // A CLAIM button that credits nothing is worse than one that says "soon".
      quests: REFERRAL_QUESTS.map((q) => ({
        ...q,
        progress: Math.min(referred.length, q.target),
        done: referred.length >= q.target,
        claimable: false,
      })),
    };
  }

  async claimReferral(userId: number, rawCode: string) {
    const code = (rawCode || '').trim().toUpperCase();
    if (!code) throw new BadRequestException('Enter a referral code');

    const me = await this.users.findOne({ where: { id: userId } });
    if (me?.referredByUserId) throw new BadRequestException('You have already claimed a referral');

    const owner = await this.users.findOne({ where: { referralCode: code } });
    if (!owner) throw new NotFoundException('That code does not exist');
    if (owner.id === userId) throw new BadRequestException('That is your own code');

    me.referredByUserId = owner.id;
    await this.users.save(me);
    // Claiming a code is a statement that you know each other, so it opens a
    // friend request rather than making them strangers who share a number.
    await this.request(userId, owner.id).catch(() => undefined);
    return { referrer: publicUser(owner) };
  }

  // ── posts ─────────────────────────────────────────────────────────

  /**
   * A post *is* a completed session whose privacy is `friends` or `discovery`.
   *
   * ponytail: no `posts` table. Everything a post shows — duration, volume, the
   * muscles worked, the caption — is already on the session and its sets, so a
   * row copying them could only ever disagree with them. The same call ranks
   * (P3) and leagues (P7) made. If posts ever gain content of their own (photos,
   * a body that is not a workout), that is when they earn a table.
   */
  async feed(userId: number, scope: FeedScope, before?: string, limit = FEED_PAGE) {
    const privacy = scope === 'discovery' ? ['discovery'] : ['friends', 'discovery'];
    const authorIds =
      scope === 'discovery' ? null : [userId, ...(await this.friendIds(userId))];

    const where: Record<string, unknown> = {
      completedAt: before ? LessThan(new Date(before)) : Not(IsNull()),
      privacy: In(privacy),
    };
    if (authorIds) where.userId = In(authorIds);

    const sessions = await this.sessions.find({
      where,
      order: { completedAt: 'DESC' },
      take: Math.min(limit, 50),
    });

    const posts = await this.buildPosts(userId, sessions);
    return {
      posts,
      // The cursor is the oldest post on the page, so a page of nothing ends it.
      nextCursor: sessions.length === Math.min(limit, 50)
        ? sessions[sessions.length - 1].completedAt.toISOString()
        : null,
    };
  }

  async post(userId: number, sessionId: number): Promise<Post> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session || !session.completedAt) throw new NotFoundException('Post not found');
    await this.assertVisible(userId, session);
    const [post] = await this.buildPosts(userId, [session]);
    return post;
  }

  /** Can `userId` see this post at all? Privacy is enforced here and only here. */
  private async assertVisible(userId: number, session: GymSession) {
    if (session.userId === userId) return;
    if (session.privacy === 'discovery') return;
    if (session.privacy === 'friends') {
      const ids = await this.friendIds(userId);
      if (ids.includes(session.userId)) return;
    }
    throw new ForbiddenException('You cannot see this post');
  }

  private async byIds(ids: number[]): Promise<Map<number, User>> {
    const unique = Array.from(new Set(ids));
    if (!unique.length) return new Map();
    const rows = await this.users.find({ where: { id: In(unique) } });
    return new Map(rows.map((u) => [u.id, u]));
  }

  private async buildPosts(viewerId: number, sessions: GymSession[]): Promise<Post[]> {
    if (!sessions.length) return [];
    const sessionIds = sessions.map((s) => s.id);
    const authorIds = Array.from(new Set(sessions.map((s) => s.userId)));

    const [people, sets, reactions, comments, history] = await Promise.all([
      this.byIds(authorIds),
      this.sets.find({ where: { sessionId: In(sessionIds) } }),
      this.reactions.find({ where: { sessionId: In(sessionIds) } }),
      this.commentRepo.find({ where: { sessionId: In(sessionIds) } }),
      this.priorBests(authorIds),
    ]);

    // One bodyrank per author, not per post — the same person posting twice
    // costs one snapshot, not two.
    const rankByUser = new Map<number, Rank>();
    await Promise.all(
      authorIds.map(async (id) => {
        rankByUser.set(id, (await this.ranks.bodyrank(id)).rank);
      }),
    );

    const setsBySession = new Map<number, WorkoutSet[]>();
    for (const s of sets) {
      const list = setsBySession.get(s.sessionId) ?? [];
      list.push(s);
      setsBySession.set(s.sessionId, list);
    }

    return sessions.map((session) => {
      const own = (setsBySession.get(session.id) ?? []).filter((s) => !s.isWarmup);
      const volumeKg = Math.round(own.reduce((n, s) => n + s.weightKg * s.actualReps, 0));

      // Muscle share for the mini Bodygraph: hard sets per muscle, the same unit
      // the recovery model counts in.
      const perMuscle = new Map<string, number>();
      const names = new Set<string>();
      for (const s of own) {
        names.add(s.exerciseName);
        const ex = s.exerciseId ? this.catalog.find(s.exerciseId) : undefined;
        for (const m of ex?.primary ?? []) perMuscle.set(m, (perMuscle.get(m) ?? 0) + 1);
      }
      const total = Array.from(perMuscle.values()).reduce((a, b) => a + b, 0) || 1;
      const muscles = Array.from(perMuscle.entries())
        .map(([muscleId, n]) => ({ muscleId, share: Math.round((n / total) * 100) / 100 }))
        .sort((a, b) => b.share - a.share);

      const mine = reactions.filter((r) => r.sessionId === session.id);
      const counts = new Map<string, number>();
      for (const r of mine) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);

      const author = people.get(session.userId);
      const started = new Date(session.startedAt).getTime();
      const ended = new Date(session.completedAt).getTime();

      return {
        sessionId: session.id,
        user: author
          ? publicUser(author)
          : { id: session.userId, name: 'Athlete', username: null, avatarId: null, profileImage: null },
        rank: rankByUser.get(session.userId) ?? null,
        completedAt: new Date(session.completedAt).toISOString(),
        caption: session.caption ?? null,
        privacy: session.privacy ?? 'friends',
        durationSec: Math.max(0, Math.round((ended - started) / 1000)),
        volumeKg,
        sets: own.length,
        prs: history.get(session.id) ?? 0,
        muscles,
        exercises: Array.from(names),
        reactions: Array.from(counts.entries())
          .map(([emoji, count]) => ({ emoji, count }))
          .sort((a, b) => b.count - a.count),
        myReaction: mine.find((r) => r.userId === viewerId)?.emoji ?? null,
        comments: comments.filter((c) => c.sessionId === session.id).length,
      };
    });
  }

  /**
   * How many personal records each session set, for the authors on this page.
   *
   * A PR is a top e1RM on an exercise beating everything that athlete had done
   * before that session — which means walking their history in order. Same rule
   * as `WorkoutsService.getSessionSummary`, including "there must be a previous
   * best": the first time you ever bench is not a record, it is a baseline.
   *
   * ponytail: one query for every completed session those authors have. Fine
   * for a page of ~20 posts by a handful of people. When P11's medal engine
   * starts writing post-session facts, store the count on the session and this
   * whole method becomes a column read.
   */
  private async priorBests(authorIds: number[]): Promise<Map<number, number>> {
    const sessions = await this.sessions.find({
      where: { userId: In(authorIds), completedAt: Not(IsNull()) },
      relations: ['sets'],
      order: { completedAt: 'ASC' },
    });

    const best = new Map<string, number>(); // `${userId}:${exerciseName}` → best e1RM
    const prs = new Map<number, number>();

    for (const session of sessions) {
      const top = new Map<string, number>();
      for (const s of session.sets ?? []) {
        if (s.isWarmup) continue;
        const e1rm = s.weightKg * (1 + Math.min(s.actualReps, 12) / 30);
        top.set(s.exerciseName, Math.max(top.get(s.exerciseName) ?? 0, e1rm));
      }
      let count = 0;
      for (const [name, e1rm] of Array.from(top.entries())) {
        const key = `${session.userId}:${name}`;
        const previous = best.get(key) ?? 0;
        if (previous > 0 && e1rm > previous) count++;
        if (e1rm > previous) best.set(key, e1rm);
      }
      prs.set(session.id, count);
    }
    return prs;
  }

  // ── reactions and comments ────────────────────────────────────────

  /**
   * Profile → Reactions: what you have been given, and what you have given.
   *
   * `given` is filtered through the same visibility rule as everything else,
   * not because the reaction is a secret — you made it — but because the row
   * names *whose* session it was on, and a friendship can be removed after the
   * fact. A screen that keeps naming someone who has since unfriended you is
   * the one way this list could leak something.
   */
  async myReactions(userId: number) {
    const [received, given] = await Promise.all([
      // Reactions on my sessions. Mine are always visible to me, so no filter.
      this.sessions.find({ where: { userId }, select: ['id'] }).then((mine) =>
        mine.length
          ? this.reactions.find({
              where: { sessionId: In(mine.map((s) => s.id)) },
              order: { createdAt: 'DESC' },
              take: 100,
            })
          : [],
      ),
      this.reactions.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 }),
    ]);

    const sessionIds = Array.from(new Set([...received, ...given].map((r) => r.sessionId)));
    const sessions = sessionIds.length
      ? await this.sessions.find({ where: { id: In(sessionIds) } })
      : [];
    const bySession = new Map(sessions.map((s) => [s.id, s]));
    const friends = await this.friendIds(userId);

    const visible = (s?: GymSession) =>
      !!s &&
      (s.userId === userId ||
        s.privacy === 'discovery' ||
        (s.privacy === 'friends' && friends.includes(s.userId)));

    // `received` names the reactor; `given` names the post's author.
    const people = await this.byIds([
      ...received.map((r) => r.userId),
      ...given.map((r) => bySession.get(r.sessionId)?.userId ?? 0),
    ]);

    const shape = (r: PostReaction, personId: number) => {
      const person = people.get(personId);
      const session = bySession.get(r.sessionId);
      if (!person || !session) return null;
      return {
        emoji: r.emoji,
        at: r.createdAt,
        sessionId: r.sessionId,
        workoutType: session.workoutType ?? 'Workout',
        sessionAt: session.completedAt ?? session.startedAt,
        user: publicUser(person),
      };
    };

    return {
      received: received
        // Your own reaction to your own post is not something anyone gave you.
        .filter((r) => r.userId !== userId)
        .map((r) => shape(r, r.userId))
        .filter(Boolean),
      given: given
        .filter((r) => visible(bySession.get(r.sessionId)))
        .map((r) => shape(r, bySession.get(r.sessionId)!.userId))
        .filter(Boolean),
    };
  }

  async react(userId: number, sessionId: number, emoji: string | null) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session?.completedAt) throw new NotFoundException('Post not found');
    await this.assertVisible(userId, session);

    const existing = await this.reactions.findOne({ where: { sessionId, userId } });
    if (!emoji) {
      if (existing) await this.reactions.remove(existing);
      return this.post(userId, sessionId);
    }
    if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number])) {
      throw new BadRequestException('Unknown reaction');
    }
    if (existing) {
      // Tapping the one you already picked clears it — that is what every app
      // with a reaction row does, and without it there is no way to undo.
      if (existing.emoji === emoji) await this.reactions.remove(existing);
      else {
        existing.emoji = emoji;
        await this.reactions.save(existing);
      }
    } else {
      await this.reactions.save(this.reactions.create({ sessionId, userId, emoji }));
    }
    return this.post(userId, sessionId);
  }

  async comments(userId: number, sessionId: number) {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session?.completedAt) throw new NotFoundException('Post not found');
    await this.assertVisible(userId, session);

    const rows = await this.commentRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const people = await this.byIds(rows.map((r) => r.userId));
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      mine: r.userId === userId,
      user: people.has(r.userId)
        ? publicUser(people.get(r.userId))
        : { id: r.userId, name: 'Athlete', username: null, avatarId: null, profileImage: null },
    }));
  }

  async comment(userId: number, sessionId: number, rawText: string) {
    const text = (rawText || '').trim().slice(0, MAX_COMMENT);
    if (!text) throw new BadRequestException('Say something first');

    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session?.completedAt) throw new NotFoundException('Post not found');
    await this.assertVisible(userId, session);

    await this.commentRepo.save(this.commentRepo.create({ sessionId, userId, text }));
    return this.comments(userId, sessionId);
  }

  async deleteComment(userId: number, commentId: number) {
    const row = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!row) throw new NotFoundException('Comment not found');
    const session = await this.sessions.findOne({ where: { id: row.sessionId } });
    // Your own comment, or any comment on your own post.
    if (row.userId !== userId && session?.userId !== userId) {
      throw new ForbiddenException('Not yours to delete');
    }
    await this.commentRepo.remove(row);
    return { ok: true };
  }

  // ── leaderboards ──────────────────────────────────────────────────

  /**
   * One endpoint, eight metrics, two scopes (SPEC §8).
   *
   * `relative` / `wilks` / `progress` are v1's existing leaderboards, folded in
   * as extra metrics rather than rewritten — they already work and they are the
   * only ones that need the big-three lifts.
   *
   * No `country` scope: nothing in the schema knows where anyone is, and a
   * filter over a field we do not collect would be a menu item that lies.
   */
  async leaderboard(userId: number, scope: 'friends' | 'global', metric: LeaderboardMetric) {
    const scopeIds =
      scope === 'friends' ? new Set([userId, ...(await this.friendIds(userId))]) : null;

    if (metric === 'relative' || metric === 'wilks' || metric === 'progress') {
      const raw =
        metric === 'relative'
          ? await this.v1Leaderboard.getRelativeStrengthLeaderboard()
          : metric === 'wilks'
            ? await this.v1Leaderboard.getWilksLeaderboard()
            : await this.v1Leaderboard.getProgressRateLeaderboard();
      const people = await this.byIds(raw.map((r: any) => r.userId));
      return this.rankRows(
        raw
          .filter((r: any) => !scopeIds || scopeIds.has(r.userId))
          .map((r: any) => ({
            user: people.has(r.userId)
              ? publicUser(people.get(r.userId))
              : { id: r.userId, name: r.name, username: null, avatarId: null, profileImage: null },
            value: r.score,
            display: metric === 'progress' ? `${r.score}%` : String(r.score),
          })),
        userId,
      );
    }

    const users = (await this.users.find({ where: { role: UserRole.USER } })).filter(
      (u) => !scopeIds || scopeIds.has(u.id),
    );
    const since = new Date(Date.now() - VOLUME_WINDOW_DAYS * 86400000);

    const rows = await Promise.all(
      users.map(async (u) => {
        const user = publicUser(u);
        if (metric === 'bodyrank' || metric === 'lp') {
          const br = await this.ranks.bodyrank(u.id);
          return metric === 'lp'
            ? { user, value: br.weeklyLp, display: `${br.weeklyLp} LP` }
            : {
                user,
                value: br.rank.percentile,
                display: `${Math.round(br.rank.percentile)}%`,
                rank: br.rank,
                // Before placements a Bodyrank averages only what has been
                // trained, so one heavy bench outranks a whole year of
                // training. True, and useless as a ranking — predicted rows
                // sort below every placed one.
                predicted: br.predicted,
              };
        }

        const completed = await this.sessions.find({
          where: { userId: u.id, completedAt: Not(IsNull()) },
          select: ['id', 'completedAt'],
        });
        if (metric === 'workouts') {
          return { user, value: completed.length, display: `${completed.length}` };
        }
        if (metric === 'streak') {
          const { current } = streaks(
            completed.map((s) => new Date(s.completedAt)),
            new Date(),
          );
          return { user, value: current, display: `${current} 🔥` };
        }

        const recent = completed.filter((s) => new Date(s.completedAt) >= since);
        if (!recent.length) return { user, value: 0, display: '0 kg' };
        const sets = await this.sets.find({ where: { sessionId: In(recent.map((s) => s.id)) } });
        const volume = Math.round(
          sets.filter((s) => !s.isWarmup).reduce((n, s) => n + s.weightKg * s.actualReps, 0),
        );
        return { user, value: volume, display: `${volume.toLocaleString('en-GB')} kg` };
      }),
    );

    return this.rankRows(rows, userId);
  }

  private rankRows(
    rows: { user: PublicUser; value: number; display: string; rank?: Rank; predicted?: boolean }[],
    userId: number,
  ) {
    return rows
      .sort(
        (a, b) =>
          Number(!!a.predicted) - Number(!!b.predicted) ||
          b.value - a.value ||
          a.user.name.localeCompare(b.user.name),
      )
      .map((r, i) => ({ ...r, position: i + 1, you: r.user.id === userId }));
  }
}

/**
 * Self-check: the two pure helpers here, since everything else is a database
 * round trip. Run from `SocialController`'s module init alongside the rank
 * engine's checks — a silently wrong username rule is a support ticket.
 */
export function __selfcheck() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`social selfcheck: ${msg}`);
  };

  assert(slugifyUsername('Rezwoan Fahim') === 'rezwoanfahim', 'spaces stripped');
  assert(slugifyUsername('A.B') === 'athleteab', 'too-short slugs get a prefix, not a bare name');
  assert(slugifyUsername('') === 'athlete', 'empty name still yields a usable handle');
  assert(USERNAME_RE.test(slugifyUsername('Ünicode Nàme')), 'slug always matches the handle rule');
  assert(
    slugifyUsername('averyveryverylongnameindeedhere').length <= 20,
    'slug respects the 20-char cap',
  );
  assert(!USERNAME_RE.test('Rez woan'), 'spaces are not a valid handle');
  assert(!USERNAME_RE.test('ab'), 'two characters is too short');
  assert(new Set(REACTIONS).size === REACTIONS.length, 'reaction set has no duplicates');
  return true;
}
