/**
 * Offline-first layer for workout logging.
 *
 * The gym is the worst-connected room most people train in, so every write in a
 * session goes to a local outbox first and is replayed against the API when the
 * connection returns. Reads render from a cached server snapshot with the
 * pending writes applied on top, so the UI looks identical online and offline.
 *
 * Storage is localStorage, not IndexedDB: a session is a few dozen sets (~5 KB),
 * which fits comfortably, and synchronous access keeps the logging path free of
 * races that a hand-rolled IDB wrapper would invite.
 */
import { bodyWeightApi, gameApi, socialApi, workoutsApi } from './api';

const QUEUE_KEY = 'reprush_outbox_v1';
const SESSION_KEY = 'reprush_session_cache_v1';
const MAP_KEY = 'reprush_id_map_v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CachedSet {
  id?: number;        // server id, once synced
  localId: string;    // stable client id, always present
  exerciseName: string;
  /** Catalog id. Ranks and recovery key off this, so v2 always sends it. */
  exerciseId?: string;
  setNumber: number;
  actualReps: number;
  weightKg: number;
  targetReps?: number;
  isWarmup?: boolean;
  rpe?: number;
  pending?: boolean;  // not yet acknowledged by the server
}

/** What the finish flow collects (SPEC §5.3), replayed with the completion. */
export interface FinishPayload {
  notes?: string;
  caption?: string;
  tracked?: boolean;
  privacy?: 'private' | 'friends' | 'discovery';
}

type Op =
  | {
      id: string;
      kind: 'startSession';
      tempSessionId: number;
      workoutType: string;
      workoutPlanId?: number;
      plan?: unknown;
    }
  | { id: string; kind: 'logSet'; sessionId: number; localId: string; payload: Record<string, unknown> }
  | { id: string; kind: 'deleteSet'; sessionId: number; setId: number }
  | { id: string; kind: 'completeSession'; sessionId: number; finish?: FinishPayload }
  // P12: the writes outside a workout session that must also survive no signal.
  | { id: string; kind: 'react'; sessionId: number; emoji: string | null }
  | { id: string; kind: 'claim'; rewardKey: string }
  | { id: string; kind: 'bodyWeight'; weightKg: number; date?: string };

// ─── Storage helpers ─────────────────────────────────────────────────────────

const canStore = () => typeof window !== 'undefined';

function read<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (!canStore()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exhausted — the queue is the thing worth keeping, so fail loudly in
    // dev but never throw into the logging path.
    console.warn('[offline] could not persist', key);
  }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

// ─── Outbox ──────────────────────────────────────────────────────────────────

const getQueue = (): Op[] => read<Op[]>(QUEUE_KEY, []);
const setQueue = (q: Op[]) => { write(QUEUE_KEY, q); notify(); };

export const pendingCount = () => getQueue().length;

function enqueue(op: Op) {
  setQueue([...getQueue(), op]);
}

// Temp session ids are negative so they can never collide with server ids.
const isTempId = (id: number) => id < 0;

const getIdMap = (): Record<string, number> => read(MAP_KEY, {});
const setIdMap = (m: Record<string, number>) => write(MAP_KEY, m);

/** Resolve a possibly-temporary session id to its real one, if known. */
export function resolveSessionId(id: number): number {
  if (!isTempId(id)) return id;
  return getIdMap()[String(id)] ?? id;
}

// ─── Session cache ───────────────────────────────────────────────────────────

interface CachedSession {
  id: number;
  workoutType?: string;
  workoutPlanId?: number;
  startedAt?: string;
  completedAt?: string | null;
  /** The generated plan the user is working from. Parsed, not the JSON string. */
  plan?: unknown;
  notes?: string;
  sets: CachedSet[];
}

/** The server stores the plan as a JSON string; the UI wants the object. */
const parsePlan = (v: unknown) => {
  if (!v) return undefined;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};

const getCache = (): Record<string, CachedSession> => read(SESSION_KEY, {});
const setCache = (c: Record<string, CachedSession>) => write(SESSION_KEY, c);

export function cacheSession(sessionId: number, data: any) {
  const c = getCache();
  c[String(sessionId)] = {
    id: sessionId,
    workoutType: data?.workoutType,
    workoutPlanId: data?.workoutPlanId,
    startedAt: data?.startedAt,
    completedAt: data?.completedAt ?? null,
    // Never overwrite a locally-held plan with nothing: a session started
    // offline has its plan only here until the outbox drains.
    plan: parsePlan(data?.plan) ?? c[String(sessionId)]?.plan,
    notes: data?.notes ?? c[String(sessionId)]?.notes,
    sets: (data?.sets || []).map((s: any) => ({
      id: s.id,
      localId: s.localId || `srv-${s.id}`,
      exerciseName: s.exerciseName,
      exerciseId: s.exerciseId ?? undefined,
      setNumber: s.setNumber,
      actualReps: s.actualReps,
      weightKg: s.weightKg,
      targetReps: s.targetReps,
      isWarmup: !!s.isWarmup,
      rpe: s.rpe ?? undefined,
    })),
  };
  setCache(c);
}

export function getCachedSession(sessionId: number): CachedSession | null {
  return getCache()[String(sessionId)] || null;
}

/**
 * The view the UI renders: the cached server snapshot with every queued write
 * for this session applied on top, in order.
 */
export function materializeSets(sessionId: number): CachedSet[] {
  const cached = getCachedSession(sessionId);
  let sets: CachedSet[] = cached ? [...cached.sets] : [];

  for (const op of getQueue()) {
    if (op.kind === 'logSet' && resolveSessionId(op.sessionId) === resolveSessionId(sessionId)) {
      const p = op.payload as any;
      sets.push({
        localId: op.localId,
        exerciseName: p.exerciseName,
        exerciseId: p.exerciseId,
        setNumber: p.setNumber,
        actualReps: p.actualReps,
        weightKg: p.weightKg,
        targetReps: p.targetReps,
        isWarmup: !!p.isWarmup,
        rpe: p.rpe,
        pending: true,
      });
    }
    if (op.kind === 'deleteSet' && resolveSessionId(op.sessionId) === resolveSessionId(sessionId)) {
      sets = sets.filter((s) => s.id !== op.setId);
    }
  }
  return sets;
}

// ─── Public write API (used by the session page) ─────────────────────────────

export function queueStartSession(workoutType: string, workoutPlanId?: number, plan?: unknown): number {
  const tempSessionId = -Date.now();
  enqueue({ id: uid(), kind: 'startSession', tempSessionId, workoutType, workoutPlanId, plan });
  const c = getCache();
  c[String(tempSessionId)] = {
    id: tempSessionId,
    workoutType,
    workoutPlanId,
    plan,
    startedAt: new Date().toISOString(),
    completedAt: null,
    sets: [],
  };
  setCache(c);
  return tempSessionId;
}

/** The plan the session is running, from cache — works offline, by design. */
export function getSessionPlan(sessionId: number): any {
  return getCachedSession(resolveSessionId(sessionId))?.plan ?? getCachedSession(sessionId)?.plan ?? null;
}

/** Notes survive a reload and a dropped connection, like everything else here. */
export function setSessionNotes(sessionId: number, notes: string) {
  const c = getCache();
  const s = c[String(sessionId)];
  if (s) {
    s.notes = notes;
    setCache(c);
  }
}

export function queueLogSet(sessionId: number, payload: Record<string, unknown>): string {
  const localId = uid();
  enqueue({ id: uid(), kind: 'logSet', sessionId, localId, payload });
  return localId;
}

/**
 * Deleting a set that never reached the server just drops its queued write —
 * otherwise we'd sync a set only to delete it a moment later.
 */
export function queueDeleteSet(sessionId: number, set: CachedSet) {
  if (set.id == null) {
    setQueue(getQueue().filter((op) => !(op.kind === 'logSet' && op.localId === set.localId)));
    return;
  }
  enqueue({ id: uid(), kind: 'deleteSet', sessionId, setId: set.id });
}

export function queueCompleteSession(sessionId: number, finish?: FinishPayload) {
  enqueue({ id: uid(), kind: 'completeSession', sessionId, finish });
  const c = getCache();
  const s = c[String(sessionId)];
  if (s) { s.completedAt = new Date().toISOString(); setCache(c); }
}

/**
 * A reaction, a quest claim and a bodyweight entry (SPEC §10 → Offline).
 *
 * All three are queued rather than posted for the same reason sets are: the gym
 * is where the signal is worst and the app is used most. Every one is safe to
 * replay — reactions are last-write-wins, claims are unique per (user, key) on
 * the server, and bodyweight relies on the op id as its idempotency key.
 */
export function queueReaction(sessionId: number, emoji: string | null) {
  // Only the newest reaction to a post matters; an earlier queued one is noise.
  setQueue(getQueue().filter((op) => !(op.kind === 'react' && op.sessionId === sessionId)));
  enqueue({ id: uid(), kind: 'react', sessionId, emoji });
}

export function queueClaim(rewardKey: string) {
  if (getQueue().some((op) => op.kind === 'claim' && op.rewardKey === rewardKey)) return;
  enqueue({ id: uid(), kind: 'claim', rewardKey });
}

export function queueBodyWeight(weightKg: number, date?: string) {
  enqueue({ id: uid(), kind: 'bodyWeight', weightKg, date });
}

// ─── Flush ───────────────────────────────────────────────────────────────────

let flushing = false;

/**
 * Replay the outbox in order. Stops at the first failure and keeps the rest
 * queued, so ordering is never broken — a set can't sync before the session
 * that owns it. 4xx responses are dropped rather than retried forever, since
 * they can't succeed on a retry (e.g. a set whose session was deleted).
 */
export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  const touched = new Set<number>();

  try {
    while (true) {
      const queue = getQueue();
      if (!queue.length) break;
      const op = queue[0];

      try {
        if (op.kind === 'startSession') {
          const res = await workoutsApi.startSession(op.workoutType, op.workoutPlanId, op.plan, op.id);
          const realId = res.data.id as number;
          const map = getIdMap();
          map[String(op.tempSessionId)] = realId;
          setIdMap(map);

          // Carry the cached session (and its sets) over to the real id.
          const c = getCache();
          const temp = c[String(op.tempSessionId)];
          if (temp) { c[String(realId)] = { ...temp, id: realId }; delete c[String(op.tempSessionId)]; setCache(c); }
        } else if (op.kind === 'logSet') {
          const sid = resolveSessionId(op.sessionId);
          await workoutsApi.logSet(sid, op.payload, op.id);
          touched.add(sid);
        } else if (op.kind === 'deleteSet') {
          await workoutsApi.deleteSet(op.setId, op.id);
          touched.add(resolveSessionId(op.sessionId));
        } else if (op.kind === 'completeSession') {
          await workoutsApi.completeSession(resolveSessionId(op.sessionId), op.finish, op.id);
          touched.add(resolveSessionId(op.sessionId));
        } else if (op.kind === 'react') {
          await socialApi.react(resolveSessionId(op.sessionId), op.emoji, op.id);
        } else if (op.kind === 'claim') {
          await gameApi.claim(op.rewardKey, op.id);
        } else if (op.kind === 'bodyWeight') {
          await bodyWeightApi.log(op.weightKg, undefined, op.date, op.id);
        }

        setQueue(getQueue().slice(1));
        synced++;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status && status >= 400 && status < 500) {
          // Permanently unacceptable — drop it so the queue can drain.
          console.warn('[offline] dropping unsyncable op', op.kind, status);
          setQueue(getQueue().slice(1));
          continue;
        }
        return { synced, failed: getQueue().length };
      }
    }
  } finally {
    flushing = false;
  }

  // Once an op leaves the queue it stops contributing to materializeSets(), so
  // without re-caching the server's view the just-synced sets would briefly
  // disappear from the UI. Refresh every session we touched before notifying.
  for (const sid of Array.from(touched)) {
    try {
      const fresh = await workoutsApi.getSession(sid);
      if (fresh?.data) cacheSession(sid, fresh.data);
    } catch { /* still readable from the existing cache */ }
  }

  notify();
  return { synced, failed: 0 };
}

// ─── Reactivity ──────────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch { /* a bad listener must not break the queue */ }
  });
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

let autoSyncStarted = false;

/** How often to retry a non-empty queue when no event has prompted us. */
const RETRY_MS = 30_000;

/** Flush whenever the browser regains connectivity, and once on load. */
export function startAutoSync() {
  if (typeof window === 'undefined' || autoSyncStarted) return;
  autoSyncStarted = true;
  const run = () => { void flushOutbox(); };
  window.addEventListener('online', run);
  // Coming back to the app after a spell offline is also a good moment to try.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  // ...and a plain timer, because `online` is not reliable enough to be the only
  // trigger: gym wifi that stays associated but stops routing never fires it, so
  // a session finished on a dead connection would sit in localStorage until the
  // app was next backgrounded and reopened. Idle cost is one `getQueue()` read
  // every 30s, and nothing at all once the queue is empty.
  window.setInterval(() => { if (getQueue().length) run(); }, RETRY_MS);
  run();
}
