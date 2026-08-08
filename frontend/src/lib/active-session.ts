/**
 * The "you are mid-workout" record.
 *
 * A session in progress is the one piece of app state that has to be visible
 * from *everywhere* — you start a workout, wander off to check a rank or your
 * profile, and the only route back used to be the Today's Workout card on Home.
 * Every other tab pretended nothing was happening.
 *
 * It is localStorage rather than a request, for the same reason the rest timer
 * is: this has to render instantly on every tab change and it has to be right in
 * a basement gym with no signal. `lib/offline.ts` owns both transitions (a
 * session starts and completes through the outbox and nowhere else), so there is
 * exactly one writer.
 */
const KEY = 'reprush_active_session_v1';

export interface ActiveSession {
  id: number;
  title: string;
  startedAt: string;
}

/** Fired on write so the bar updates without polling; `storage` only crosses tabs. */
const EVENT = 'reprush:active-session';

export function getActiveSession(): ActiveSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

export function setActiveSession(s: ActiveSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage blocked — the bar is an affordance, not the source of truth */
  }
}

/**
 * A session started offline carries a negative temp id until the outbox syncs
 * and the server hands back a real one. The record has to follow, or the
 * "Resume" button would navigate to a session id that no longer exists.
 */
export function remapActiveSession(tempId: number, realId: number) {
  const cur = getActiveSession();
  if (cur && cur.id === tempId) setActiveSession({ ...cur, id: realId });
}

export function subscribeActiveSession(fn: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}
