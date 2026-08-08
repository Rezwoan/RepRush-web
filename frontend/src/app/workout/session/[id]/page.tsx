'use client';
/**
 * The active session (SPEC §5.2).
 *
 * Full-screen and outside the tab shell on purpose: this is the screen someone
 * stares at between sets with a bar in their hands, and every pixel of chrome
 * is a pixel not showing the set grid.
 *
 * **Every write goes through the outbox** (`lib/offline.ts`), never straight to
 * the API. The gym is the worst-connected room most people train in, and a set
 * that fails to POST must still be on the screen and still reach the server
 * twenty minutes later in the car park.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, ChevronDown, ChevronRight, HelpCircle, LineChart, MoreVertical, Plus, Settings, Trash2, X,
} from 'lucide-react';
import { ranksApi, workoutsApi } from '@/lib/api';
import {
  cacheSession, getCachedSession, getSessionPlan, materializeSets, queueDeleteSet,
  queueLogSet, resolveSessionId, setSessionNotes, subscribe, flushOutbox, type CachedSet,
} from '@/lib/offline';
import { setActiveSession } from '@/lib/active-session';
import { rankLabel, type Rank } from '@/lib/ranks';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ExerciseProgress } from '@/components/workout/exercise-progress';
import { Toggle } from '@/components/ui/controls';
import { Bar } from '@/components/ui/display';
import { RankBadge } from '@/components/art/rank-badge';
import { Keypad, type Field } from '@/components/workout/keypad';
import { RestMiniBar, hhmmss, mmss, useRestTimer } from '@/components/workout/rest-timer';
import { cue } from '@/lib/feedback';
import { useUnits } from '@/lib/units';
import {
  ExercisePicker, Thumb, useCatalog, type CatalogExercise,
} from '@/components/workout/exercise-picker';

// ── types ────────────────────────────────────────────────────────────

interface PlannedSet {
  setNumber: number;
  isWarmup: boolean;
  targetReps: number;
  weightKg: number | null;
}

interface PlannedExercise {
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  mechanic: 'compound' | 'isolation' | null;
  restSec: number;
  sets: PlannedSet[];
  fromHistory: boolean;
}

interface NextTarget {
  percentile: number;
  rank: Rank;
  weightKg: number | null;
  reps: number;
  progress: number;
}

interface ExerciseRankInfo {
  rank: Rank | null;
  next: NextTarget | null;
  prev: { setNumber: number; weightKg: number; reps: number }[];
}

/** Tracker Settings (SPEC §5.2), local to the device. */
interface TrackerSettings {
  autoRest: boolean;
  nextAdvancesSet: boolean;
  showRankStrip: boolean;
}

const SETTINGS_KEY = 'reprush_tracker_settings_v1';
const DEFAULT_SETTINGS: TrackerSettings = { autoRest: true, nextAdvancesSet: true, showRankStrip: true };

/** A draft row in the grid, before it is ticked. */
interface Draft {
  weight: string;
  reps: string;
}

const slotKey = (exerciseId: string, index: number) => `${exerciseId}#${index}`;

// ── page ─────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = resolveSessionId(parseInt(id, 10));
  const { byId } = useCatalog();

  const [exercises, setExercises] = useState<PlannedExercise[]>([]);
  const [logged, setLogged] = useState<CachedSet[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rankInfo, setRankInfo] = useState<Record<string, ExerciseRankInfo>>({});
  const [settings, setSettings] = useState<TrackerSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({});
  const [focus, setFocus] = useState<{ key: string; field: Field; restSec: number } | null>(null);
  const [clock, setClock] = useState(0);

  const timer = useRestTimer();
  const u = useUnits();
  const rerender = useCallback(() => setLogged(materializeSets(sessionId)), [sessionId]);

  // ── hydrate ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* a bad settings blob falls back to the defaults */
    }
  }, []);

  useEffect(() => subscribe(rerender), [rerender]);

  useEffect(() => {
    const hydrate = (data: any, plan: any) => {
      if (data?.startedAt) setStartedAt(new Date(data.startedAt).getTime());
      if (typeof data?.notes === 'string') setNotes(data.notes);
      if (plan?.exercises) setExercises(plan.exercises);
    };

    // The cache first, always: a session started offline exists only here, and
    // the screen must paint before any request resolves.
    const cached = getCachedSession(sessionId);
    if (cached) hydrate(cached, getSessionPlan(sessionId));
    rerender();

    workoutsApi
      .getSession(sessionId)
      .then((r) => {
        if (!r.data) return;
        if (r.data.completedAt) {
          router.replace(`/workout/summary/${sessionId}`);
          return;
        }
        cacheSession(sessionId, r.data);
        hydrate(r.data, getSessionPlan(sessionId));
        rerender();
      })
      .catch(() => {
        /* offline — the cache above is the session */
      });
  }, [sessionId, router, rerender]);

  // Session clock. One interval for the whole screen, derived from the start
  // instant rather than incremented, so backgrounding the tab cannot drift it.
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setClock(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);

  // ── rank strip + PREV, per exercise on screen ──
  useEffect(() => {
    for (const ex of exercises) {
      if (rankInfo[ex.exerciseId]) continue;
      setRankInfo((r) => ({ ...r, [ex.exerciseId]: { rank: null, next: null, prev: [] } }));
      Promise.all([
        ranksApi.exercise(ex.exerciseId).catch(() => null),
        workoutsApi.getPrevious(ex.exerciseId).catch(() => null),
      ]).then(([detail, prev]) => {
        setRankInfo((r) => ({
          ...r,
          [ex.exerciseId]: {
            rank: detail?.data?.rank?.rank ?? null,
            next: detail?.data?.next ?? null,
            prev: prev?.data?.sets ?? [],
          },
        }));
      });
    }
  }, [exercises, rankInfo]);

  // ── logging ──

  const loggedFor = useCallback(
    (exerciseId: string) =>
      logged
        .filter((s) => (s.exerciseId ?? s.exerciseName) === exerciseId || s.exerciseId === exerciseId)
        .sort((a, b) => a.setNumber - b.setNumber),
    [logged],
  );

  const commit = (ex: PlannedExercise, index: number, planned: PlannedSet) => {
    const key = slotKey(ex.exerciseId, index);
    const draft = drafts[key];
    // The keypad types in whatever unit the column is labelled with; the set is
    // stored in kg, because that is what the ladder and every total are in.
    const typed = parseFloat(draft?.weight ?? '');
    const weight = Number.isFinite(typed) && typed !== 0 ? u.wkg(typed) : planned.weightKg || 0;
    const reps = parseInt(draft?.reps ?? '', 10) || planned.targetReps || 0;
    if (!reps) return; // a set with no reps is not a set

    queueLogSet(sessionId, {
      exerciseName: ex.name,
      exerciseId: ex.exerciseId,
      setNumber: index + 1,
      actualReps: reps,
      weightKg: weight,
      targetReps: planned.targetReps,
      isWarmup: planned.isWarmup,
    });
    void flushOutbox();
    rerender();
    cue('set', 35);
    setFocus(null);
    if (settings.autoRest && !planned.isWarmup) timer.start(ex.restSec);
  };

  const undo = (set: CachedSet) => {
    queueDeleteSet(sessionId, set);
    void flushOutbox();
    rerender();
  };

  const saveNotes = (v: string) => {
    setNotes(v);
    setSessionNotes(sessionId, v);
  };

  const saveSettings = (next: TrackerSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* quota — settings are a preference, not data */
    }
  };

  const addExercise = (cat: CatalogExercise) => {
    setExercises((l) => [
      ...l,
      {
        exerciseId: cat.id,
        name: cat.name,
        primaryMuscle: cat.primary[0],
        equipment: cat.equipment,
        mechanic: cat.mechanic,
        restSec: cat.restSec,
        sets: Array.from({ length: 3 }, (_, i) => ({
          setNumber: i + 1,
          isWarmup: false,
          targetReps: Math.round((cat.repMin + cat.repMax) / 2),
          weightKg: null,
        })),
        fromHistory: false,
      },
    ]);
  };

  const totalPlanned = exercises.reduce((n, e) => n + e.sets.length + (extraSlots[e.exerciseId] ?? 0), 0);
  const doneCount = logged.length;
  const loggedCount = logged.length;

  /**
   * Throw the session away.
   *
   * The record that says "you are mid-workout" is cleared *first* and
   * unconditionally: if the delete fails because the phone is offline, the one
   * thing that must not happen is the resume bar continuing to advertise a
   * session the user has already decided to bin. A session started offline has
   * a negative temp id the server has never seen, so there is nothing to delete
   * there either — dropping the local record is the whole operation.
   */
  const discardSession = async () => {
    setDiscarding(true);
    setActiveSession(null);
    try {
      if (sessionId > 0) await workoutsApi.resetSession(sessionId);
    } catch {
      /* offline or already gone — the user is leaving either way */
    }
    setDiscardOpen(false);
    router.replace('/workout');
  };

  if (!exercises.length && !logged.length) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Loading your session…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-40">
      {/* ── sticky header ── */}
      <header
        className={cn(
          'sticky top-0 z-30 flex items-center gap-3 border-b border-border px-4 py-3 backdrop-blur-xl',
          timer.active ? 'bg-primary-fill text-primary-foreground' : 'bg-background/90',
        )}
      >
        <button
          onClick={() => router.push('/home')}
          aria-label="Leave session"
          className="press grid h-9 w-9 place-items-center rounded-full"
        >
          <ChevronDown size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
            {timer.active ? 'Rest' : 'Elapsed'}
          </p>
          <p className="nums text-xl font-extrabold leading-none">
            {timer.active ? mmss(timer.remaining) : hhmmss(clock)}
          </p>
        </div>
        <p className="nums shrink-0 text-sm font-bold opacity-80">
          {doneCount}/{totalPlanned}
        </p>
        <button
          onClick={() => router.push(`/workout/finish/${sessionId}`)}
          aria-label="Finish workout"
          className={cn(
            'press grid h-10 w-10 shrink-0 place-items-center rounded-full',
            timer.active ? 'bg-white/20' : 'bg-primary-fill text-primary-foreground',
          )}
        >
          <ChevronRight size={22} />
        </button>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {/* Notes */}
        <button
          onClick={() => setNotesOpen(true)}
          className="w-full truncate rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm text-muted-foreground"
        >
          {notes || 'Your workout notes…'}
        </button>

        <div className="mt-4 space-y-4">
          {exercises.map((ex) => (
            <ExerciseCard
              key={ex.exerciseId}
              ex={ex}
              catalog={byId[ex.exerciseId]}
              info={rankInfo[ex.exerciseId]}
              logged={loggedFor(ex.exerciseId)}
              drafts={drafts}
              setDrafts={setDrafts}
              extra={extraSlots[ex.exerciseId] ?? 0}
              onAddSet={() =>
                setExtraSlots((s) => ({ ...s, [ex.exerciseId]: (s[ex.exerciseId] ?? 0) + 1 }))
              }
              /**
               * Take the last row off. `Add set` had no counterpart, so one
               * mis-tap left a row that could never go away — and a routine
               * prescribing four sets on a day you only have three in you had
               * to be edited to say so.
               *
               * Extras come off first, then prescribed rows. A row holding a
               * logged set is un-logged on the way out, through the same
               * outbox call the ✓ makes, because removing a set you logged
               * plainly means it did not happen.
               */
              onRemoveSet={() => {
                const extras = extraSlots[ex.exerciseId] ?? 0;
                const last = ex.sets.length + extras;
                if (last <= 1) return; // an exercise with no rows is `Remove from this session`
                const logged = loggedFor(ex.exerciseId).find((s) => s.setNumber === last);
                if (logged) undo(logged);
                if (extras > 0) {
                  setExtraSlots((s) => ({ ...s, [ex.exerciseId]: extras - 1 }));
                } else {
                  setExercises((l) =>
                    l.map((e) =>
                      e.exerciseId === ex.exerciseId ? { ...e, sets: e.sets.slice(0, -1) } : e,
                    ),
                  );
                }
              }}
              collapsed={!!collapsed[ex.exerciseId]}
              onCollapse={() => setCollapsed((c) => ({ ...c, [ex.exerciseId]: !c[ex.exerciseId] }))}
              onRemove={() => setExercises((l) => l.filter((e) => e.exerciseId !== ex.exerciseId))}
              showRankStrip={settings.showRankStrip}
              onCommit={(i, planned) => commit(ex, i, planned)}
              onUndo={undo}
              onFocus={(key, field) => setFocus({ key, field, restSec: ex.restSec })}
              focusKey={focus?.key ?? null}
              focusField={focus?.field ?? null}
            />
          ))}
        </div>

        <button
          onClick={() => setAddOpen(true)}
          className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-3.5 font-bold text-muted-foreground"
        >
          <Plus size={18} /> Exercise
        </button>
      </main>

      {/* ── bottom utility bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl items-center justify-around border-t border-border bg-popover/95 px-4 py-2 backdrop-blur-xl safe-bottom">
        <UtilityButton icon={<HelpCircle size={20} />} label="How To" onClick={() => setHelpOpen(true)} />
        <UtilityButton
          icon={<Check size={20} />}
          label="Finish"
          onClick={() => router.push(`/workout/finish/${sessionId}`)}
        />
        <UtilityButton icon={<Settings size={20} />} label="Settings" onClick={() => setSettingsOpen(true)} />
      </div>

      <RestMiniBar timer={timer} className="bottom-[60px]" />

      {/* ── keypad ── */}
      <AnimatePresence>
        {focus && (
          <Keypad
            field={focus.field}
            value={drafts[focus.key]?.[focus.field === 'weight' ? 'weight' : 'reps'] ?? ''}
            onChange={(v) =>
              setDrafts((d) => ({
                ...d,
                [focus.key]: {
                  weight: focus.field === 'weight' ? v : (d[focus.key]?.weight ?? ''),
                  reps: focus.field === 'reps' ? v : (d[focus.key]?.reps ?? ''),
                },
              }))
            }
            onNext={() =>
              setFocus((f) =>
                f && f.field === 'weight' ? { ...f, field: 'reps' } : settings.nextAdvancesSet ? null : f,
              )
            }
            onClose={() => setFocus(null)}
            onHelp={() => setHelpOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* ── sheets ── */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen} title="Workout notes">
        <textarea
          autoFocus
          rows={5}
          value={notes}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="How it felt, what to change next time…"
          className="w-full rounded-xl border-2 border-border bg-card p-3.5 outline-none focus:border-primary"
        />
      </Sheet>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen} title="How to log">
        <div className="space-y-3 pb-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Log the total lifted.</strong>{' '}
            {u.imperial
              ? 'A 45 lb bar with 25 lb a side is 95 lb, not 25 and not 45.'
              : 'A 20 kg bar with 10 kg a side is 40 kg, not 10 and not 20.'}
          </p>
          <p>Dumbbells are logged per hand — the standards are calibrated that way.</p>
          <p>
            Warm-up sets are marked <strong className="text-foreground">W</strong>. They never count toward
            volume, records or your rank.
          </p>
          <p>Bodyweight movements take the weight you <em>added</em>, so leave it at 0 for a plain set.</p>
        </div>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} title="Tracker settings">
        <div className="space-y-1 pb-2">
          <SettingRow
            label="Auto rest timer"
            hint="Starts the rest countdown when you tick a set."
            checked={settings.autoRest}
            onChange={(v) => saveSettings({ ...settings, autoRest: v })}
          />
          <SettingRow
            label="Next button set change"
            hint="The keypad's Next key closes the pad after reps instead of staying open."
            checked={settings.nextAdvancesSet}
            onChange={(v) => saveSettings({ ...settings, nextAdvancesSet: v })}
          />
          <SettingRow
            label="Rank calculator"
            hint="Show the rank progress strip on each exercise."
            checked={settings.showRankStrip}
            onChange={(v) => saveSettings({ ...settings, showRankStrip: v })}
          />

          {/* Discarding lives here rather than beside Finish on the utility bar:
              they are one tap apart on a phone held mid-set, and one of them
              deletes the session. `DELETE /workouts/sessions/:id` has existed
              since v1 and nothing in the app has ever called it — starting a
              workout by accident meant living with it. */}
          <div className="mt-4 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => { setSettingsOpen(false); setDiscardOpen(true); }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 size={16} /> Discard this workout
            </button>
            <p className="px-3 pt-1 text-xs text-muted-foreground">
              Deletes the session and everything logged in it. Cannot be undone.
            </p>
          </div>
        </div>
      </Sheet>

      <Sheet open={discardOpen} onOpenChange={setDiscardOpen} title="Discard this workout?">
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted-foreground">
            {loggedCount > 0
              ? `${loggedCount} logged ${loggedCount === 1 ? 'set' : 'sets'} will be deleted. This cannot be undone.`
              : 'Nothing has been logged yet, so there is nothing to lose.'}
          </p>
          <div className="flex gap-3">
            <Button variant="chunkyOutline" size="cta" onClick={() => setDiscardOpen(false)}>
              Keep training
            </Button>
            <Button
              variant="chunky"
              size="cta"
              disabled={discarding}
              onClick={discardSession}
              className="!bg-destructive"
            >
              {discarding ? 'Discarding…' : 'Discard'}
            </Button>
          </div>
        </div>
      </Sheet>

      <ExercisePicker
        open={addOpen}
        onOpenChange={setAddOpen}
        onPick={addExercise}
        excludeIds={exercises.map((e) => e.exerciseId)}
      />
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────

function UtilityButton({
  icon, label, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="press flex flex-col items-center gap-0.5 px-4 py-1 text-muted-foreground">
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function SettingRow({
  label, hint, checked, onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function ExerciseCard({
  ex, catalog, info, logged, drafts, setDrafts, extra, onAddSet, onRemoveSet, collapsed, onCollapse,
  onRemove, showRankStrip, onCommit, onUndo, onFocus, focusKey, focusField,
}: {
  ex: PlannedExercise;
  catalog?: CatalogExercise;
  info?: ExerciseRankInfo;
  logged: CachedSet[];
  drafts: Record<string, Draft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Draft>>>;
  extra: number;
  onAddSet: () => void;
  onRemoveSet: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  onRemove: () => void;
  showRankStrip: boolean;
  onCommit: (index: number, planned: PlannedSet) => void;
  onUndo: (set: CachedSet) => void;
  onFocus: (key: string, field: Field) => void;
  focusKey: string | null;
  focusField: Field | null;
}) {
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const u = useUnits();

  /**
   * Tapping a number mid-exercise, whether or not the set is already ticked.
   *
   * A logged set used to be read-only — the only way to correct it was Undo,
   * and nothing on the row said so. Tapping one now un-logs it *and* seeds the
   * draft with what it held, so the keypad opens on the real numbers and one
   * tap of ✓ puts it back. The delete and the re-log both go through the
   * outbox, so this works with no signal like everything else here.
   */
  const onEditCell = (key: string, field: Field, done: CachedSet | undefined, w: string, r: string) => {
    if (done) {
      setDrafts((d) => ({ ...d, [key]: { weight: w, reps: r } }));
      onUndo(done);
    }
    onFocus(key, field);
  };

  // Planned rows plus any the user added mid-session. The extras inherit the
  // last planned set, which is what "one more set" means.
  const rows: PlannedSet[] = useMemo(() => {
    const base = ex.sets;
    const tail = base[base.length - 1];
    return [
      ...base,
      ...Array.from({ length: extra }, (_, i) => ({
        setNumber: base.length + i + 1,
        isWarmup: false,
        targetReps: tail?.targetReps ?? 8,
        weightKg: tail?.weightKg ?? null,
      })),
    ];
  }, [ex.sets, extra]);

  const next = info?.next;

  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {catalog ? (
          <Thumb ex={catalog} size={40} />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-xl border border-border bg-secondary" />
        )}
        <button
          onClick={() => setHistory(true)}
          className="press min-w-0 flex-1 text-left"
          aria-label={`${ex.name} — see my history`}
        >
          <p className="truncate font-bold">{ex.name}</p>
          <p className="nums text-xs text-muted-foreground">
            {logged.length}/{rows.length} sets · {Math.round(ex.restSec / 60)}m rest
          </p>
        </button>
        <button onClick={onCollapse} aria-label="Collapse" className="press grid h-8 w-8 place-items-center text-muted-foreground">
          <motion.span animate={{ rotate: collapsed ? -90 : 0 }} transition={spring.snappy}>
            <ChevronDown size={18} />
          </motion.span>
        </button>
        <button onClick={() => setMenu(true)} aria-label="Exercise options" className="press grid h-8 w-8 place-items-center text-muted-foreground">
          <MoreVertical size={18} />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Rank progress strip — the set that promotes you. */}
          {showRankStrip && next && (
            <div className="mx-3 mb-3 flex items-center gap-3 rounded-xl bg-secondary p-3">
              <div className="shrink-0 text-center">
                <RankBadge
                  tier={info?.rank?.tier ?? 'unranked'}
                  division={info?.rank?.division}
                  size="md"
                  animated={false}
                  showDivision={false}
                />
                <p className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  {rankLabel(info?.rank)}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    To next rank
                  </p>
                  <p className="nums text-lg font-extrabold" style={{ color: `hsl(var(--tier-${next.rank.tier}))` }}>
                    {next.weightKg != null ? `${u.n(next.weightKg, 1)}×${next.reps}` : `${next.reps} reps`}
                  </p>
                </div>
                <Bar value={next.progress} className="mt-1.5" height={7} label="Progress to next rank" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Beat it once and you hit {rankLabel(next.rank)}.
                </p>
              </div>
            </div>
          )}

          {/* Set grid */}
          <div className="px-3 pb-3">
            <div className="nums grid grid-cols-[28px_60px_1fr_1fr_44px] gap-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>Set</span>
              <span>Prev</span>
              <span className="text-center">{u.imperial ? 'Lb' : 'Kg'}</span>
              <span className="text-center">Reps</span>
              <span />
            </div>

            <ul className="space-y-1.5">
              {rows.map((planned, i) => {
                const key = slotKey(ex.exerciseId, i);
                const done = logged.find((s) => s.setNumber === i + 1);
                const prev = info?.prev?.find((p) => p.setNumber === i + 1);
                const draft = drafts[key];
                const focused = focusKey === key;

                // An empty draft field falls back to the ghost — `||`, not `??`.
                // Editing the weight creates a draft whose `reps` is '', and
                // with `??` that blanked the reps ghost the moment you touched
                // the kg column, so the row read "100 / —" for a set that was
                // about to log 7 reps.
                //
                // While a field is focused its raw draft wins, so backspacing
                // to empty leaves it empty instead of the ghost springing back.
                const ghostWeight = planned.weightKg != null ? String(u.wv(planned.weightKg, 1)) : '';
                const ghostReps = planned.targetReps ? String(planned.targetReps) : '';
                const cell = (field: Field, ghost: string) => {
                  const raw = field === 'weight' ? draft?.weight : draft?.reps;
                  return focused && focusField === field ? (raw ?? '') : (raw || ghost);
                };

                const weight = done ? String(u.wv(done.weightKg, 1)) : cell('weight', ghostWeight);
                const reps = done ? String(done.actualReps) : cell('reps', ghostReps);

                return (
                  <li
                    key={key}
                    className={cn(
                      'grid grid-cols-[28px_60px_1fr_1fr_44px] items-center gap-2 rounded-xl px-1 py-1.5 transition-colors',
                      done && 'bg-success/15',
                    )}
                  >
                    <span
                      className={cn(
                        'nums grid h-7 w-7 place-items-center rounded-lg text-xs font-extrabold',
                        planned.isWarmup ? 'bg-tier-gold/20 text-tier-gold' : 'bg-secondary',
                      )}
                    >
                      {planned.isWarmup ? 'W' : i + 1}
                    </span>

                    <span className="nums truncate text-xs text-muted-foreground">
                      {prev ? `${u.wv(prev.weightKg, 1)}×${prev.reps}` : '−'}
                    </span>

                    <Cell
                      label={`${u.w}, set ${i + 1}`}
                      value={weight}
                      done={!!done}
                      active={focusKey === key && focusField === 'weight'}
                      onClick={() => onEditCell(key, 'weight', done, weight, reps)}
                    />
                    <Cell
                      label={`Reps, set ${i + 1}`}
                      value={reps}
                      done={!!done}
                      active={focusKey === key && focusField === 'reps'}
                      onClick={() => onEditCell(key, 'reps', done, weight, reps)}
                    />

                    <button
                      onClick={() => {
                        if (done) return onUndo(done);
                        // Seed the draft from the ghost values so ticking a row
                        // straight through logs what is on screen — a lookup of
                        // last session, never a prediction.
                        setDrafts((d) => ({ ...d, [key]: { weight, reps } }));
                        onCommit(i, planned);
                      }}
                      aria-label={done ? `Undo set ${i + 1}` : `Complete set ${i + 1}`}
                      className={cn(
                        'press grid h-9 w-9 place-items-center rounded-xl border-2 transition-colors',
                        done
                          ? 'border-success bg-success text-white'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      <Check size={17} strokeWidth={3} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2 flex gap-2">
              <button
                onClick={onAddSet}
                className="press flex-1 rounded-xl border border-dashed border-border py-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground"
              >
                + Add set
              </button>
              {/* Only once there is something to take away — a lone set has
                  `Remove from this session` for that. */}
              {rows.length > 1 && (
                <button
                  onClick={onRemoveSet}
                  aria-label={`Remove set ${rows.length} from ${ex.name}`}
                  className="press rounded-xl border border-dashed border-border px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground"
                >
                  − Set
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <Sheet open={menu} onOpenChange={setMenu} title={ex.name}>
        <button
          onClick={() => {
            setMenu(false);
            setHistory(true);
          }}
          className="press mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left font-bold"
        >
          <LineChart size={18} /> See my history
        </button>
        <button
          onClick={() => {
            setMenu(false);
            onRemove();
          }}
          className="press flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left font-bold text-destructive"
        >
          <Trash2 size={18} /> Remove from this session
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          Sets you have already logged stay logged — removing only takes the remaining rows off the screen.
        </p>
      </Sheet>

      {/* A sheet, not a route. Closing it returns to the session with drafts,
          focus and the rest timer exactly as they were, because nothing
          unmounted — "back with zero friction" by never leaving. */}
      <Sheet open={history} onOpenChange={setHistory} title={ex.name}>
        <div className="pb-2">
          <ExerciseProgress exerciseId={ex.exerciseId} />
        </div>
      </Sheet>
    </section>
  );
}

function Cell({
  value, done, active, onClick, label,
}: {
  value: string;
  done: boolean;
  active: boolean;
  onClick: () => void;
  /** What this cell is. Its text is a bare number, or "—" when empty. */
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      aria-label={value ? `${label}, ${value}` : `${label}, empty`}
      className={cn(
        'nums h-9 rounded-xl border-2 text-center text-base font-extrabold transition-colors',
        done
          ? 'border-transparent bg-transparent text-success'
          : active
            ? 'border-primary bg-primary/10'
            : 'border-border bg-card',
        !value && !done && 'text-muted-foreground/50',
      )}
    >
      {value || '—'}
    </button>
  );
}
