'use client';
/**
 * Haptics and sound (P13).
 *
 * Three settings shipped in P10 — Haptics, Audio & SFX and Rest alert — stored
 * fine and were read by nothing, so all three were toggles that did nothing.
 * This is the one place that reads them, and the one place that buzzes or makes
 * a noise.
 *
 * Preferences come out of the profile blob `/auth/me` already returns and
 * `auth-context` already caches, so honouring them costs no request and works
 * offline. `cachePref` keeps that copy in step when the settings screen writes,
 * otherwise a toggle would only take effect on the next session.
 */

const USER_CACHE_KEY = 'reprush_user_v1';

/** Mirrors `DEFAULT_PREFERENCES` in `backend/src/profile/profile.service.ts`. */
const DEFAULTS = {
  units: 'metric' as 'metric' | 'imperial',
  weekStart: 'monday' as 'sunday' | 'monday',
  analysisWindow: 'rolling' as 'rolling' | 'calendar',
  suggestedWorkouts: true,
  biggerDiscoveryPosts: false,
  haptics: true,
  sfx: true,
  restAlert: true,
};

export type Prefs = typeof DEFAULTS;

export function getPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    const stored = raw ? JSON.parse(raw)?.preferences : null;
    // The column is a JSON *string* on the entity, so it arrives as one.
    const prefs = typeof stored === 'string' ? JSON.parse(stored) : stored;
    return prefs && typeof prefs === 'object' ? { ...DEFAULTS, ...prefs } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Patch the cached copy so a flipped switch applies before the next `/auth/me`. */
export function cachePref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return;
    const user = JSON.parse(raw);
    const stored = user?.preferences;
    const prefs = typeof stored === 'string' ? JSON.parse(stored) : stored ?? {};
    user.preferences = JSON.stringify({ ...prefs, [key]: value });
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    /* storage blocked — the server still has it, it just applies a beat later */
  }
}

// ── haptics ─────────────────────────────────────────────────────────

export function haptic(pattern: number | number[] = 35) {
  if (!getPrefs().haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported — the visual state is the real feedback */
  }
}

// ── sound ───────────────────────────────────────────────────────────

/**
 * Every cue is synthesised. WebAudio is in every browser we target, and a
 * bundled mp3 is bytes plus a fetch that fails exactly when the gym wifi does.
 *
 * One shared AudioContext: iOS caps how many a page may create, and a context
 * built during a user gesture stays unlocked for the ones that follow.
 * ponytail: four hardcoded cues. If this grows past a handful, or wants real
 * samples, move to an `<audio>` sprite — but not before.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  /** Hz. */
  f: number;
  /** Seconds from the start of the cue. */
  at: number;
  /** Seconds. */
  dur?: number;
  /** Peak gain, 0–1. */
  vol?: number;
}

const CUES: Record<string, Note[]> = {
  /** Set logged — one short, dry click. It fires many times a session. */
  set: [{ f: 660, at: 0, dur: 0.07, vol: 0.16 }],
  /** Rest over — the two-tone chime from the original rest timer. */
  rest: [
    { f: 880, at: 0 },
    { f: 1320, at: 0.18 },
  ],
  /** Rank up, medal, level up — a rising major triad. */
  celebrate: [
    { f: 659.25, at: 0 },
    { f: 830.61, at: 0.11 },
    { f: 987.77, at: 0.22, dur: 0.4 },
  ],
  /** Session complete — same shape, an octave of resolution on the end. */
  finish: [
    { f: 523.25, at: 0 },
    { f: 783.99, at: 0.12 },
    { f: 1046.5, at: 0.26, dur: 0.5 },
  ],
};

export type Cue = keyof typeof CUES;

export function sfx(cue: Cue) {
  if (!getPrefs().sfx) return;
  try {
    const a = audio();
    if (!a) return;
    for (const n of CUES[cue]) {
      const osc = a.createOscillator();
      const gain = a.createGain();
      const t = a.currentTime + n.at;
      const dur = n.dur ?? 0.22;
      osc.type = 'sine';
      osc.frequency.value = n.f;
      // Exponential ramps only: a linear one from zero clicks, and
      // exponentialRamp cannot start at exactly 0.
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(n.vol ?? 0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  } catch {
    /* audio is a nicety; never let it break the logging path */
  }
}

/** The usual pairing: a buzz and a cue together. */
export function cue(name: Cue, pattern?: number | number[]) {
  sfx(name);
  haptic(pattern);
}

// ── self-check ──────────────────────────────────────────────────────
export const __selfcheck = () => {
  // Every cue must be ordered and finite, or `osc.stop` lands before `start`
  // and the note never sounds — silently, because WebAudio does not throw.
  for (const [name, notes] of Object.entries(CUES)) {
    if (!notes.length) throw new Error(`feedback: cue "${name}" is silent`);
    let prev = -1;
    for (const n of notes) {
      if (!(n.f > 20 && n.f < 20000)) throw new Error(`feedback: "${name}" is outside hearing`);
      if (!(n.at >= prev)) throw new Error(`feedback: "${name}" plays out of order`);
      prev = n.at;
    }
  }
  // Defaults must win when nothing is stored, or a first-run device is silent.
  if (!DEFAULTS.haptics || !DEFAULTS.sfx) throw new Error('feedback: defaults should be on');
  return 'feedback ok';
};
