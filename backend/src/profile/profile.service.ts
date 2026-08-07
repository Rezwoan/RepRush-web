import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import { GymSession } from '../workouts/gym-session.entity';
import { WorkoutSet } from '../workouts/workout-set.entity';
import { BodyWeightLog } from '../body-weight/body-weight-log.entity';
import { CatalogService } from '../exercises/catalog.service';
import { RanksService } from '../ranks/ranks.service';
import { streaks } from '../home/home.service';
import { USERNAME_RE } from '../social/social.service';
import { PostReaction } from '../social/post-reaction.entity';
import { HealthLog } from './health-log.entity';
import { Routine, RoutineFolder, UserExercise } from './routine.entity';
import { COSMETIC_BY_ID, COSMETICS, DEFAULT_COSMETIC, freeIds, type CosmeticKind } from './cosmetics';
import { XP, levelFromXp } from './xp';

const DAY_MS = 86_400_000;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Where a `calendar` window starts, for the Totals card (Settings → Analysis).
 *
 * The four windows the card offers are 7 / 30 / 180 / 365 days, so their
 * calendar equivalents are this week, this month, this half-year and this year.
 * `firstDay` is 0 for a Sunday week and 1 for a Monday one — the same
 * `weekStart` preference the calendar preview already shows.
 *
 * Local calendar parts throughout, never UTC: east of Greenwich a UTC day is
 * yesterday for most of the local morning, and "this week" would start a day
 * early for half of every day.
 */
export function calendarStart(now: Date, windowDays: number, firstDay: 0 | 1): Date {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (windowDays >= 365) return new Date(now.getFullYear(), 0, 1);
  if (windowDays >= 180) return new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
  if (windowDays >= 30) return new Date(now.getFullYear(), now.getMonth(), 1);
  // ((day - firstDay) + 7) % 7 — the +7 is what stops Sunday going backwards a
  // week under a Monday start, where a plain difference would be -1.
  const back = (midnight.getDay() - firstDay + 7) % 7;
  midnight.setDate(midnight.getDate() - back);
  return midnight;
}

/** The cards the Profile tab can show, in their default order (SPEC §9). */
export const PROFILE_CARDS = [
  'memories',
  'last7',
  'totals',
  'streaks',
  'levels',
  'ranks',
  'activity',
  'routines',
  'exercises',
  'reactions',
] as const;

/**
 * Every metric the Health Log tracks (SPEC §12.2). `bodyweight` is here as a
 * metric the screen shows, but it is stored in `body_weight_logs` — see the
 * comment on the `HealthLog` entity for why moving it would be reckless.
 */
export const HEALTH_METRICS = [
  'bodyweight',
  'height',
  'waist',
  'bodyFat',
  'neck',
  'shoulder',
  'chest',
  'leftBicep',
  'rightBicep',
  'leftThigh',
  'rightThigh',
  'hip',
] as const;

/**
 * Preference defaults. The allow-list is the shape: anything not named here is
 * dropped on write, so a stale client cannot store a key nothing will read.
 */
export const DEFAULT_PREFERENCES = {
  units: 'metric', // 'metric' | 'imperial'
  weekStart: 'monday', // 'sunday' | 'monday'
  analysisWindow: 'rolling', // 'rolling' | 'calendar'
  suggestedWorkouts: true,
  biggerDiscoveryPosts: false,
  haptics: true,
  sfx: true,
  restAlert: true,
  // `routineUpdateAlert` lived here and nothing could ever send one — there
  // are no routine-update notifications. Removed rather than left as a switch
  // that changes nothing (P13, see MEMORY → Decisions).
};
type Preferences = typeof DEFAULT_PREFERENCES;

const PREF_ENUMS: Partial<Record<keyof Preferences, string[]>> = {
  units: ['metric', 'imperial'],
  weekStart: ['sunday', 'monday'],
  analysisWindow: ['rolling', 'calendar'],
};

const parseJson = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(GymSession) private sessions: Repository<GymSession>,
    @InjectRepository(WorkoutSet) private sets: Repository<WorkoutSet>,
    @InjectRepository(BodyWeightLog) private bodyWeight: Repository<BodyWeightLog>,
    @InjectRepository(HealthLog) private health: Repository<HealthLog>,
    @InjectRepository(Routine) private routines: Repository<Routine>,
    @InjectRepository(RoutineFolder) private folders: Repository<RoutineFolder>,
    @InjectRepository(UserExercise) private userExercises: Repository<UserExercise>,
    @InjectRepository(PostReaction) private reactions: Repository<PostReaction>,
    private catalog: CatalogService,
    private ranks: RanksService,
  ) {}

  // ── the shape everything else reads ───────────────────────────────

  preferences(user: User): Preferences {
    return { ...DEFAULT_PREFERENCES, ...parseJson(user.preferences, {}) };
  }

  owned(user: User): string[] {
    return Array.from(new Set([...freeIds(), ...parseJson<string[]>(user.cosmetics, [])]));
  }

  header(user: User) {
    return {
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      bio: user.bio ?? null,
      avatarId: user.avatarId ?? null,
      profileImage: user.profileImage ?? null,
      joinedAt: user.createdAt,
      currency: user.currency ?? 0,
      cosmetics: {
        title: COSMETIC_BY_ID.get(user.titleId ?? '') ?? COSMETIC_BY_ID.get(DEFAULT_COSMETIC.title),
        border:
          COSMETIC_BY_ID.get(user.borderId ?? '') ?? COSMETIC_BY_ID.get(DEFAULT_COSMETIC.border),
        banner:
          COSMETIC_BY_ID.get(user.bannerId ?? '') ?? COSMETIC_BY_ID.get(DEFAULT_COSMETIC.banner),
      },
    };
  }

  // ── the Profile tab, in one request ───────────────────────────────

  async overview(userId: number, window = 7) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const sessions = await this.sessions.find({
      where: { userId, completedAt: Not(IsNull()) },
      order: { completedAt: 'ASC' },
    });
    const sets = sessions.length
      ? await this.sets.find({ where: { sessionId: In(sessions.map((s) => s.id)) } })
      : [];
    const setsBySession = new Map<number, WorkoutSet[]>();
    for (const s of sets) {
      const list = setsBySession.get(s.sessionId) ?? [];
      list.push(s);
      setsBySession.set(s.sessionId, list);
    }
    const working = (id: number) => (setsBySession.get(id) ?? []).filter((s) => !s.isWarmup);

    const now = new Date();
    const { current, best } = streaks(
      sessions.map((s) => new Date(s.completedAt)),
      now,
    );

    // Memories — two weeks of "what did I train that day" (SPEC §9, card 1).
    const byDay = new Map<string, Set<string>>();
    const durationOf = (s: GymSession) =>
      Math.max(0, (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
    for (const s of sessions) {
      const key = dayKey(new Date(s.completedAt));
      const muscles = byDay.get(key) ?? new Set<string>();
      for (const set of working(s.id)) {
        const ex = set.exerciseId ? this.catalog.find(set.exerciseId) : undefined;
        for (const m of ex?.primary ?? []) muscles.add(m);
      }
      byDay.set(key, muscles);
    }
    const memories = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getTime() - (13 - i) * DAY_MS);
      const key = dayKey(d);
      return { date: key, muscles: Array.from(byDay.get(key) ?? []) };
    });

    // Last 7 days — Bodygraph tinted by *volume*, not fatigue. Different
    // meaning, different scale, deliberately a different colour in the UI.
    const since7 = now.getTime() - 7 * DAY_MS;
    const volumeByMuscle: Record<string, number> = {};
    for (const s of sessions) {
      if (new Date(s.completedAt).getTime() < since7) continue;
      for (const set of working(s.id)) {
        const ex = set.exerciseId ? this.catalog.find(set.exerciseId) : undefined;
        for (const m of ex?.primary ?? []) {
          volumeByMuscle[m] = (volumeByMuscle[m] ?? 0) + set.weightKg * set.actualReps;
        }
      }
    }
    const peak = Math.max(1, ...Object.values(volumeByMuscle));
    const last7 = Object.fromEntries(
      Object.entries(volumeByMuscle).map(([m, v]) => [m, Math.round((v / peak) * 100) / 100]),
    );

    // Totals — the windowed chart behind Duration | Volume | Reps.
    //
    // Settings → Analysis picks how the window is measured. `rolling` counts
    // back from right now, so a Monday and a Friday are compared the same way;
    // `calendar` starts at the boundary, so the number resets and climbs
    // through the period. Read here rather than on the client because the
    // client only receives the totals, not the sessions behind them.
    const windowDays = [7, 30, 180, 365].includes(window) ? window : 7;
    const prefs = this.preferences(user);
    const sinceWindow =
      prefs.analysisWindow === 'calendar'
        ? calendarStart(now, windowDays, prefs.weekStart === 'sunday' ? 0 : 1).getTime()
        : now.getTime() - windowDays * DAY_MS;
    const inWindow = sessions.filter((s) => new Date(s.completedAt).getTime() >= sinceWindow);
    let duration = 0;
    let volume = 0;
    let reps = 0;
    const series: { date: string; duration: number; volume: number; reps: number }[] = [];
    for (const s of inWindow) {
      const w = working(s.id);
      const d = Math.round(durationOf(s));
      const v = Math.round(w.reduce((n, x) => n + x.weightKg * x.actualReps, 0));
      const r = w.reduce((n, x) => n + x.actualReps, 0);
      duration += d;
      volume += v;
      reps += r;
      series.push({ date: dayKey(new Date(s.completedAt)), duration: d, volume: v, reps: r });
    }

    // 6-month activity — workouts per week, oldest first.
    const activity = Array.from({ length: 26 }, (_, i) => {
      const end = now.getTime() - (25 - i) * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      return {
        week: dayKey(new Date(start)),
        workouts: sessions.filter((s) => {
          const t = new Date(s.completedAt).getTime();
          return t >= start && t < end;
        }).length,
      };
    });

    // Levels — XP is *derived* here, exactly as the post-session chain shows
    // it. P11 owns awarding it; until then nothing is stored and nothing can
    // disagree with the sessions.
    const totalMinutes = Math.round(sessions.reduce((n, s) => n + durationOf(s), 0) / 60);
    const records = await this.recordCount(sessions, setsBySession);
    const totalXp =
      sessions.length * XP.perWorkout +
      totalMinutes * XP.perMinute +
      records * XP.perRecord +
      best * XP.perStreakDay;

    const bodyrank = await this.ranks.bodyrank(userId);

    const [routineCount, exerciseCount, reactionCount] = await Promise.all([
      this.routines.count({ where: { userId } }),
      this.userExercises.count({ where: { userId } }),
      sessions.length
        ? this.reactions.count({ where: { sessionId: In(sessions.map((s) => s.id)) } })
        : Promise.resolve(0),
    ]);

    return {
      header: this.header(user),
      preferences: this.preferences(user),
      layout: this.layout(user),
      memories,
      last7,
      totals: { window: windowDays, duration, volume, reps, series },
      streaks: { current, best, days: this.streakDays(byDay, now) },
      levels: { ...levelFromXp(totalXp), records, workouts: sessions.length },
      ranks: { bodyrank, best: bodyrank.rank },
      activity,
      counts: { routines: routineCount, exercises: exerciseCount, reactions: reactionCount },
    };
  }

  /** The Su–Sa row on the Streaks card: did a workout land on each of the last 7 days? */
  private streakDays(byDay: Map<string, Set<string>>, now: Date) {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * DAY_MS);
      return { date: dayKey(d), trained: byDay.has(dayKey(d)) };
    });
  }

  /**
   * Lifetime personal records. Same rule as the session summary and the feed:
   * a top e1RM beating everything before it, and the first time you ever do a
   * lift is a baseline rather than a record.
   */
  private async recordCount(sessions: GymSession[], setsBySession: Map<number, WorkoutSet[]>) {
    const best = new Map<string, number>();
    let count = 0;
    for (const session of sessions) {
      const top = new Map<string, number>();
      for (const s of setsBySession.get(session.id) ?? []) {
        if (s.isWarmup) continue;
        const e1rm = s.weightKg * (1 + Math.min(s.actualReps, 12) / 30);
        top.set(s.exerciseName, Math.max(top.get(s.exerciseName) ?? 0, e1rm));
      }
      for (const [name, e1rm] of Array.from(top.entries())) {
        const previous = best.get(name) ?? 0;
        if (previous > 0 && e1rm > previous) count++;
        if (e1rm > previous) best.set(name, e1rm);
      }
    }
    return count;
  }

  layout(user: User): string[] {
    const saved = parseJson<string[]>(user.profileLayout, []);
    const valid = saved.filter((c) => (PROFILE_CARDS as readonly string[]).includes(c));
    // Anything the saved order does not mention is appended, so a card added in
    // a later release appears for people who reordered before it existed.
    return [...valid, ...PROFILE_CARDS.filter((c) => !valid.includes(c))];
  }

  // ── editing ───────────────────────────────────────────────────────

  async update(
    userId: number,
    dto: {
      name?: string;
      username?: string;
      bio?: string;
      avatarId?: string;
      titleId?: string;
      borderId?: string;
      bannerId?: string;
      layout?: string[];
      preferences?: Partial<Preferences>;
    },
  ) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const patch: Partial<User> = {};

    if (typeof dto.name === 'string') {
      const name = dto.name.trim().slice(0, 40);
      if (!name) throw new BadRequestException('Name cannot be empty');
      patch.name = name;
    }

    if (typeof dto.username === 'string') {
      const username = dto.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        throw new BadRequestException('Username must be 3–20 characters: a–z, 0–9 or _');
      }
      if (username !== user.username) {
        const taken = await this.users.findOne({ where: { username } });
        if (taken) throw new ConflictException('That username is taken');
        patch.username = username;
      }
    }

    if (typeof dto.bio === 'string') patch.bio = dto.bio.trim().slice(0, 200);
    if (typeof dto.avatarId === 'string' && dto.avatarId.length <= 32) patch.avatarId = dto.avatarId;

    // Equipping something you do not own is the one cheat this screen could
    // enable, so the check is here rather than in the client.
    const ownedIds = this.owned(user);
    for (const kind of ['title', 'border', 'banner'] as CosmeticKind[]) {
      const field = `${kind}Id` as 'titleId' | 'borderId' | 'bannerId';
      const wanted = dto[field];
      if (typeof wanted !== 'string') continue;
      const cosmetic = COSMETIC_BY_ID.get(wanted);
      if (!cosmetic || cosmetic.kind !== kind) throw new BadRequestException('Unknown cosmetic');
      if (!ownedIds.includes(wanted)) throw new BadRequestException('You do not own that yet');
      patch[field] = wanted;
    }

    if (Array.isArray(dto.layout)) {
      patch.profileLayout = JSON.stringify(
        dto.layout.filter((c) => (PROFILE_CARDS as readonly string[]).includes(c)),
      );
    }

    if (dto.preferences && typeof dto.preferences === 'object') {
      const current = this.preferences(user);
      const next: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(dto.preferences)) {
        if (!(key in DEFAULT_PREFERENCES)) continue;
        const allowed = PREF_ENUMS[key as keyof Preferences];
        if (allowed) {
          if (typeof value === 'string' && allowed.includes(value)) next[key] = value;
        } else if (typeof value === 'boolean') {
          next[key] = value;
        }
      }
      patch.preferences = JSON.stringify(next);
    }

    if (Object.keys(patch).length) await this.users.update(userId, patch);
    return this.overview(userId);
  }

  /** What a friend sees (SPEC §9 → `Preview Public Profile`). */
  async publicProfile(username: string) {
    const user = await this.users.findOne({ where: { username: (username || '').toLowerCase() } });
    if (!user || user.role !== UserRole.USER) throw new NotFoundException('No such profile');

    const sessions = await this.sessions.find({
      where: { userId: user.id, completedAt: Not(IsNull()) },
      select: ['id', 'completedAt'],
    });
    const { current, best } = streaks(
      sessions.map((s) => new Date(s.completedAt)),
      new Date(),
    );
    return {
      header: this.header(user),
      bodyrank: await this.ranks.bodyrank(user.id),
      workouts: sessions.length,
      streak: { current, best },
    };
  }

  // ── the Statistics screen (SPEC §9) ───────────────────────────────

  async statistics(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    const sessions = await this.sessions.find({
      where: { userId, completedAt: Not(IsNull()) },
      order: { completedAt: 'ASC' },
    });
    const sets = sessions.length
      ? await this.sets.find({ where: { sessionId: In(sessions.map((s) => s.id)) } })
      : [];
    const working = sets.filter((s) => !s.isWarmup);

    const durations = sessions.map((s) =>
      Math.max(0, (new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000),
    );
    const perExercise = new Map<string, number>();
    for (const s of working) perExercise.set(s.exerciseName, (perExercise.get(s.exerciseName) ?? 0) + 1);
    const counter = Array.from(perExercise.entries())
      .map(([name, count]) => ({ name, sets: count }))
      .sort((a, b) => b.sets - a.sets);

    const days = new Set(sessions.map((s) => dayKey(new Date(s.completedAt))));
    const sinceJoin = Math.max(
      1,
      Math.ceil((Date.now() - new Date(user.createdAt).getTime()) / DAY_MS),
    );
    const volume = Math.round(working.reduce((n, s) => n + s.weightKg * s.actualReps, 0));
    const reps = working.reduce((n, s) => n + s.actualReps, 0);

    return {
      overview: {
        joinedAt: user.createdAt,
        workouts: sessions.length,
        favouriteExercise: counter[0]?.name ?? null,
        daysTrained: days.size,
      },
      chronometry: {
        averageSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
        longestSec: durations.length ? Math.round(Math.max(...durations)) : 0,
        // Days trained as a share of days since joining — the "workout ratio".
        ratio: Math.round((days.size / sinceJoin) * 100) / 100,
      },
      metrics: {
        totalVolume: volume,
        averageVolume: sessions.length ? Math.round(volume / sessions.length) : 0,
        totalReps: reps,
        averageReps: sessions.length ? Math.round(reps / sessions.length) : 0,
        totalSets: working.length,
      },
      counter: counter.slice(0, 50),
    };
  }

  // ── Health Log (SPEC §12.2) ───────────────────────────────────────

  async healthLog(userId: number, metric: string) {
    if (!(HEALTH_METRICS as readonly string[]).includes(metric)) {
      throw new BadRequestException('Unknown metric');
    }
    if (metric === 'bodyweight') {
      const rows = await this.bodyWeight.find({ where: { userId }, order: { date: 'ASC' } });
      return rows.map((r) => ({ id: r.id, value: r.weightKg, date: r.date, metric }));
    }
    const rows = await this.health.find({ where: { userId, metric }, order: { date: 'ASC' } });
    return rows.map((r) => ({ id: r.id, value: r.value, date: r.date, metric }));
  }

  async logHealth(userId: number, metric: string, value: number, date?: string) {
    if (!(HEALTH_METRICS as readonly string[]).includes(metric)) {
      throw new BadRequestException('Unknown metric');
    }
    if (!(typeof value === 'number' && isFinite(value) && value > 0 && value < 1000)) {
      throw new BadRequestException('Enter a realistic value');
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : dayKey(new Date());

    if (metric === 'bodyweight') {
      // Straight into the table the Home card and the rank engine already read.
      await this.bodyWeight.save(this.bodyWeight.create({ userId, weightKg: value, date: day }));
      await this.users.update(userId, { weightKg: value });
    } else {
      await this.health.save(this.health.create({ userId, metric, value, date: day }));
    }
    return this.healthLog(userId, metric);
  }

  async deleteHealth(userId: number, metric: string, id: number) {
    if (metric === 'bodyweight') {
      const row = await this.bodyWeight.findOne({ where: { id, userId } });
      if (!row) throw new NotFoundException('Entry not found');
      await this.bodyWeight.remove(row);
    } else {
      const row = await this.health.findOne({ where: { id, userId, metric } });
      if (!row) throw new NotFoundException('Entry not found');
      await this.health.remove(row);
    }
    return this.healthLog(userId, metric);
  }

  // ── Routines and custom exercises (SPEC §12.3) ────────────────────

  async listRoutines(userId: number) {
    const [folders, routines] = await Promise.all([
      this.folders.find({ where: { userId }, order: { name: 'ASC' } }),
      this.routines.find({ where: { userId }, order: { updatedAt: 'DESC' } }),
    ]);
    const shape = (r: Routine) => ({
      id: r.id,
      name: r.name,
      folderId: r.folderId ?? null,
      exercises: parseJson<unknown[]>(r.exercises, []),
      updatedAt: r.updatedAt,
    });
    return {
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        routines: routines.filter((r) => r.folderId === f.id).map(shape),
      })),
      loose: routines.filter((r) => !r.folderId).map(shape),
    };
  }

  async createFolder(userId: number, name: string) {
    const clean = (name || '').trim().slice(0, 40);
    if (!clean) throw new BadRequestException('Name the folder first');
    await this.folders.save(this.folders.create({ userId, name: clean }));
    return this.listRoutines(userId);
  }

  async deleteFolder(userId: number, id: number) {
    const folder = await this.folders.findOne({ where: { id, userId } });
    if (!folder) throw new NotFoundException('Folder not found');
    // The routines outlive the folder — deleting a drawer is not deleting what
    // was in it. They fall back to loose.
    await this.routines.update({ userId, folderId: id }, { folderId: null });
    await this.folders.remove(folder);
    return this.listRoutines(userId);
  }

  async saveRoutine(
    userId: number,
    dto: { id?: number; name: string; folderId?: number | null; exercises?: unknown[] },
  ) {
    const name = (dto.name || '').trim().slice(0, 60);
    if (!name) throw new BadRequestException('Name the routine first');
    const exercises = JSON.stringify(Array.isArray(dto.exercises) ? dto.exercises : []);

    if (dto.id) {
      const existing = await this.routines.findOne({ where: { id: dto.id, userId } });
      if (!existing) throw new NotFoundException('Routine not found');
      existing.name = name;
      existing.folderId = dto.folderId ?? null;
      existing.exercises = exercises;
      await this.routines.save(existing);
    } else {
      await this.routines.save(
        this.routines.create({ userId, name, folderId: dto.folderId ?? null, exercises }),
      );
    }
    return this.listRoutines(userId);
  }

  async deleteRoutine(userId: number, id: number) {
    const row = await this.routines.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Routine not found');
    await this.routines.remove(row);
    return this.listRoutines(userId);
  }

  async listUserExercises(userId: number) {
    const rows = await this.userExercises.find({ where: { userId }, order: { name: 'ASC' } });
    return rows.map((r) => this.asCatalogShape(r));
  }

  /**
   * A user-authored exercise, in the catalog's shape.
   *
   * The picker, the generator and the rank engine all consume catalog entries;
   * giving these the same fields means none of them need to know the difference,
   * and the `custom:` prefix keeps the id space from colliding.
   */
  private asCatalogShape(r: UserExercise) {
    return {
      id: `custom:${r.id}`,
      name: r.name,
      primary: [r.primaryMuscle],
      secondary: [] as string[],
      equipment: r.equipment,
      force: null,
      level: 'intermediate',
      mechanic: r.mechanic ?? 'compound',
      category: 'strength',
      repMin: 8,
      repMax: 12,
      restSec: 90,
      image: null,
      custom: true,
    };
  }

  async createUserExercise(
    userId: number,
    dto: { name: string; primaryMuscle: string; equipment: string; mechanic?: string },
  ) {
    const name = (dto.name || '').trim().slice(0, 60);
    if (!name) throw new BadRequestException('Name the exercise first');
    if (!this.catalog.muscle(dto.primaryMuscle)) throw new BadRequestException('Unknown muscle');
    const equipment = String(dto.equipment || '');
    if (!EQUIPMENT.includes(equipment)) throw new BadRequestException('Unknown equipment');
    const mechanic = dto.mechanic === 'isolation' ? 'isolation' : 'compound';

    const row = await this.userExercises.save(
      this.userExercises.create({ userId, name, primaryMuscle: dto.primaryMuscle, equipment, mechanic }),
    );
    return this.asCatalogShape(row);
  }

  async deleteUserExercise(userId: number, id: number) {
    const row = await this.userExercises.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Exercise not found');
    await this.userExercises.remove(row);
    return { ok: true };
  }

  // ── Store and Inventory (SPEC §9) ─────────────────────────────────

  async store(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    const ownedIds = this.owned(user);
    return {
      currency: user.currency ?? 0,
      equipped: {
        title: user.titleId ?? DEFAULT_COSMETIC.title,
        border: user.borderId ?? DEFAULT_COSMETIC.border,
        banner: user.bannerId ?? DEFAULT_COSMETIC.banner,
      },
      items: COSMETICS.map((c) => ({ ...c, owned: ownedIds.includes(c.id) })),
    };
  }

  async buy(userId: number, cosmeticId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    const cosmetic = COSMETIC_BY_ID.get(cosmeticId);
    if (!cosmetic) throw new NotFoundException('No such item');

    const ownedIds = this.owned(user);
    if (ownedIds.includes(cosmeticId)) throw new BadRequestException('You already own that');

    const balance = user.currency ?? 0;
    if (balance < cosmetic.price) throw new BadRequestException('Not enough currency');

    await this.users.update(userId, {
      currency: balance - cosmetic.price,
      cosmetics: JSON.stringify([...parseJson<string[]>(user.cosmetics, []), cosmeticId]),
    });
    return this.store(userId);
  }
}

const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'kettlebell',
  'band',
  'plate',
];

// ── self-check ──────────────────────────────────────────────────────
// Week boundaries are where an off-by-one is invisible: the number is still
// plausible, just measured from the wrong Monday.
export function __selfcheck() {
  const fail = (m: string) => {
    throw new Error(`profile: ${m}`);
  };
  const key = (d: Date) => dayKey(d);

  // Wednesday 2026-08-05, mid-afternoon.
  const wed = new Date(2026, 7, 5, 15, 30);
  if (key(calendarStart(wed, 7, 1)) !== '2026-08-03') fail('a Monday week should start Mon 3 Aug');
  if (key(calendarStart(wed, 7, 0)) !== '2026-08-02') fail('a Sunday week should start Sun 2 Aug');

  // Sunday is the case a plain subtraction gets wrong: under a Monday start it
  // belongs to the week that began six days ago, not the one starting tomorrow.
  const sun = new Date(2026, 7, 2, 9, 0);
  if (key(calendarStart(sun, 7, 1)) !== '2026-07-27') fail('Sunday belongs to the Monday six days back');
  if (key(calendarStart(sun, 7, 0)) !== '2026-08-02') fail('Sunday starts its own Sunday week');

  if (key(calendarStart(wed, 30, 1)) !== '2026-08-01') fail('a month window starts on the 1st');
  if (key(calendarStart(wed, 180, 1)) !== '2026-07-01') fail('August is in the second half-year');
  if (key(calendarStart(new Date(2026, 2, 9), 180, 1)) !== '2026-01-01')
    fail('March is in the first half-year');
  if (key(calendarStart(wed, 365, 1)) !== '2026-01-01') fail('a year window starts on 1 Jan');

  // A calendar window can never reach further back than the rolling one it
  // replaces, or the card would silently widen when the preference flipped.
  for (const days of [7, 30, 180, 365])
    for (const first of [0, 1] as const)
      if (wed.getTime() - calendarStart(wed, days, first).getTime() > days * DAY_MS)
        fail(`a ${days}-day calendar window reached back further than ${days} days`);

  return 'calendar windows ok';
}
