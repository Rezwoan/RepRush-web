'use client';
/**
 * Profile tab — SPEC §9.
 *
 * One route with `?view=` sub-screens rather than nested routes: the back
 * button then means "back to the profile" for free, and the tab bar never
 * unmounts. Same reasoning as the Ranks tab's sub-tabs, plus a URL so the
 * browser's own history does the work.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  ListChecks,
  Medal as MedalIcon,
  MessageSquare,
  Pill,
  Settings,
  ShoppingBag,
  Target,
} from 'lucide-react';
import { profileApi } from '@/lib/api';
import { spring } from '@/lib/motion';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import { rankLabel } from '@/lib/ranks';
import { useUnits } from '@/lib/units';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, Segmented } from '@/components/ui/controls';
import { Bar, EmptyState, StatTile, TabSkeleton } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RankBadge } from '@/components/art/rank-badge';
import { BodygraphPair } from '@/components/art/bodygraph';
import { Mascot } from '@/components/art/mascot';
import { ProfileCard } from '@/components/profile/profile-card';
import { useProfile } from './header';
import { EditProfile } from './edit';
import { ConsumablesPanel } from './consumables';
import { HealthPanel } from './health';
import { ReactionsPanel } from './reactions';
import { MedalsPanel, QuestsPanel } from './quests';
import { RoutinesPanel } from './routines';
import { SettingsPanel } from './settings';
import { FeedbackAdminPanel, FeedbackPanel } from './feedback';
import { StatisticsPanel } from './statistics';
import { StorePanel } from './store';
import { CARD_TITLE, hhmm, type Overview } from './types';

const SHORTCUTS = [
  // One tile, not two: Store and Inventory were the same screen behind a
  // `mode`, and showing them apart hid the fact that what you buy lands in the
  // other one.
  { view: 'store', label: 'Store', icon: ShoppingBag },
  { view: 'quests', label: 'Quests', icon: Target },
  { view: 'medals', label: 'Medals', icon: MedalIcon },
  { view: 'health', label: 'Health', icon: HeartPulse },
  { view: 'reactions', label: 'Reactions', icon: MessageSquare },
  { view: 'routines', label: 'Routines', icon: ListChecks },
  { view: 'exercises', label: 'Exercises', icon: Dumbbell },
  { view: 'statistics', label: 'Stats', icon: BarChart3 },
  // `feedback` was here and opened nothing — same call P10 made about a
  // settings row that links to a form that does not exist.
  { view: 'consumables', label: 'Consumables', icon: Pill },
];

// ── cards ───────────────────────────────────────────────────────────

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Memories — the last two weeks, as a calendar you can actually read.
 *
 * The first version drew each trained day as a ~40px `Bodygraph` silhouette and
 * left untrained days as a bare number. At that size the anatomy is a smudge,
 * there were no weekday headers, no month, no legend and nothing tappable — so
 * it neither read as a calendar nor told you anything. The owner's verdict was
 * that it "does not serve any good purpose", which was correct.
 *
 * What it needs to answer is *did I train, and how consistently*. So: weekday
 * headers, the day number always visible, trained days filled, a count in the
 * corner, and a tap that says what was actually done.
 *
 * The 7-column grid is weekday-aligned for free — 14 consecutive days is
 * exactly two weeks, so column j always holds the same weekday and one header
 * row is correct for both.
 */
function MemoriesCard({ data }: { data: Overview }) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState<Overview['memories'][number] | null>(null);

  const days = data.memories;
  const trained = days.filter((d) => d.muscles.length > 0).length;

  // Derived from the data rather than a constant, because the window ends today
  // and therefore starts on a different weekday every day.
  const headers = days.slice(0, 7).map((d) =>
    new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' }),
  );

  const groupsOf = (muscles: string[]) =>
    Array.from(
      new Set(
        muscles.map((m) => MUSCLE_BY_ID[m as MuscleId]?.group).filter(Boolean) as string[],
      ),
    );

  return (
    <Card
      title="Memories"
      action={
        <span className="nums text-xs font-bold text-muted-foreground">
          {trained} of {days.length} days
        </span>
      }
    >
      <div className="grid grid-cols-7 gap-1.5 pb-1 text-center">
        {headers.map((h, i) => (
          <span key={i} className="text-[11px] font-bold uppercase text-muted-foreground">
            {h}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const did = d.muscles.length > 0;
          const date = new Date(`${d.date}T00:00:00`);
          const isToday = d.date === todayKey;
          const first = date.getDate() === 1;
          return (
            <button
              key={d.date}
              onClick={() => did && setOpen(d)}
              disabled={!did}
              aria-label={
                did
                  ? `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} — trained ${groupsOf(d.muscles).join(', ')}`
                  : `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} — rest day`
              }
              className={cn(
                'relative grid aspect-square place-items-center rounded-xl text-sm font-extrabold transition-colors',
                did
                  ? 'press bg-primary-fill text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground',
                isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
              )}
            >
              <span className="nums leading-none">{date.getDate()}</span>
              {/* The month, only where it changes — a bare "1" is ambiguous. */}
              {first && (
                <span className="absolute bottom-0.5 text-[8px] font-bold uppercase opacity-80">
                  {date.toLocaleDateString('en-GB', { month: 'short' })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground">
        {trained === 0
          ? 'Nothing logged in the last two weeks.'
          : 'Filled days are days you trained — tap one to see what you did.'}
      </p>

      <Sheet
        open={!!open}
        onOpenChange={(v) => !v && setOpen(null)}
        title={
          open
            ? new Date(`${open.date}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : ''
        }
      >
        {open && (
          <div className="space-y-3 pb-2">
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-extrabold">{open.title ?? 'Workout'}</p>
              <p className="nums text-sm text-muted-foreground">{open.sets} sets</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {open.muscles.map((m) => (
                <span key={m} className="rounded-lg bg-secondary px-2 py-1 text-sm font-bold">
                  {MUSCLE_BY_ID[m as MuscleId]?.label ?? m}
                </span>
              ))}
            </div>
            {/* The Bodygraph belongs here, at a size where it is legible —
                not shrunk into a 40px calendar cell. */}
            <BodygraphPair
              colors={
                Object.fromEntries(
                  open.muscles.map((m) => [m, 'hsl(var(--primary) / 0.85)']),
                ) as Partial<Record<MuscleId, string>>
              }
            />
          </div>
        )}
      </Sheet>
    </Card>
  );
}

function TotalsCard({
  data,
  window,
  onWindow,
}: {
  data: Overview;
  window: number;
  onWindow: (d: number) => void;
}) {
  const [metric, setMetric] = useState<'duration' | 'volume' | 'reps'>('duration');
  const u = useUnits();
  const series = data.totals.series;
  const peak = Math.max(1, ...series.map((s) => s[metric]));
  const headline =
    metric === 'duration'
      ? hhmm(data.totals.duration)
      : metric === 'volume'
        ? u.volume(data.totals.volume)
        : `${data.totals.reps.toLocaleString('en-GB')}`;

  return (
    <Card
      title="Totals"
      action={
        <select
          value={window}
          onChange={(e) => onWindow(parseInt(e.target.value, 10))}
          className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold"
          aria-label="Window"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={180}>6 months</option>
          <option value={365}>Year</option>
        </select>
      }
    >
      <p className="nums mb-3 text-3xl font-extrabold">{headline}</p>
      <Segmented
        size="sm"
        options={[
          { value: 'duration', label: 'Duration' },
          { value: 'volume', label: 'Volume' },
          { value: 'reps', label: 'Reps' },
        ]}
        value={metric}
        onChange={setMetric}
      />
      <div className="mt-3 flex h-24 items-end gap-1">
        {series.length === 0 && (
          <p className="w-full text-center text-sm text-muted-foreground">
            Nothing logged in this window.
          </p>
        )}
        {series.map((s, i) => (
          <motion.div
            key={`${s.date}-${i}`}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(4, (s[metric] / peak) * 100)}%` }}
            transition={{ ...spring.soft, delay: i * 0.01 }}
            className="flex-1 rounded-t bg-primary/70"
          />
        ))}
      </div>
    </Card>
  );
}

function StreaksCard({ data }: { data: Overview }) {
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <Card title="Streaks">
      <div className="flex items-center gap-4">
        <Mascot pose={data.streaks.current > 0 ? 'fire' : 'idle'} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex gap-1.5">
            {data.streaks.days.map((d, i) => (
              <div key={d.date} className="flex-1 text-center">
                <span
                  className={cn(
                    'mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-extrabold',
                    d.trained ? 'bg-volt-400 text-blue-950' : 'bg-muted text-muted-foreground',
                    i === data.streaks.days.length - 1 && 'ring-2 ring-primary',
                  )}
                >
                  {letters[new Date(d.date).getDay()]}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm font-bold">
            🔥 {data.streaks.current} day{data.streaks.current === 1 ? '' : 's'}
            <span className="ml-2 font-normal text-muted-foreground">
              best {data.streaks.best}
            </span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function LevelsCard({ data }: { data: Overview }) {
  const { level, intoLevel, nextLevelXp, totalXp } = data.levels;
  return (
    <Card title="Levels">
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-fill text-lg font-extrabold text-primary-foreground">
          {level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span className="nums">
              {intoLevel} / {nextLevelXp} XP
            </span>
            <span className="text-muted-foreground">Lv.{level + 1}</span>
          </div>
          <Bar value={intoLevel / nextLevelXp} />
          <p className="nums mt-1.5 text-xs text-muted-foreground">
            ◈ {totalXp.toLocaleString('en-GB')} total XP · {data.levels.records} records
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        XP is computed from what you have logged. Claiming level rewards arrives with quests.
      </p>
    </Card>
  );
}

// ── page ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get('view') ?? '';
  const { data, ready, reload, window: win, changeWindow, setData } = useProfile();
  const [editingLayout, setEditingLayout] = useState(false);

  const go = useCallback(
    (v: string) => router.push(v ? `/profile?view=${v}` : '/profile'),
    [router],
  );

  const layout = useMemo(() => data?.layout ?? [], [data]);

  const move = async (card: string, delta: number) => {
    if (!data) return;
    const next = [...layout];
    const i = next.indexOf(card);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setData({ ...data, layout: next });
    await profileApi.update({ layout: next }).catch(() => {});
  };

  if (!ready) return <TabSkeleton />;

  if (view && data) {
    // Settings' own sub-screens keep local state and return to Settings, but
    // three of its rows (Profile, Statistics, Health log) are `?view=` panels —
    // a different screen entirely, whose back button used to land on the
    // Profile root. `from` is what lets them go back where they came from, and
    // it survives a refresh in a way `router.back()` would not.
    const from = params.get('from');
    // `from=workout` is the one value that is not a `?view=` panel: the Workout
    // tab sends people here to edit the day they just tapped, and back has to
    // mean the day list they came from.
    const back = () =>
      router.push(from === 'workout' ? '/workout' : from ? `/profile?view=${from}` : '/profile');
    if (view === 'edit') return <EditProfile data={data} onBack={back} onSaved={() => reload(win)} />;
    if (view === 'settings')
      return (
        <SettingsPanel
          data={data}
          onBack={back}
          onChanged={() => reload(win)}
          onView={(v) => router.push(`/profile?view=${v}&from=settings`)}
        />
      );
    if (view === 'health') return <HealthPanel onBack={back} />;
    if (view === 'consumables') return <ConsumablesPanel onBack={back} />;
    if (view === 'routines' || view === 'exercises')
      return (
        <RoutinesPanel
          tab={view}
          onBack={back}
          openRoutineId={Number(params.get('routine')) || undefined}
        />
      );
    if (view === 'store' || view === 'inventory')
      return (
        <StorePanel
          mode={view}
          onBack={back}
          onChanged={() => reload(win)}
          onQuests={() => router.push('/profile?view=quests')}
        />
      );
    if (view === 'feedback') return <FeedbackPanel onBack={back} />;
    if (view === 'feedback-admin') return <FeedbackAdminPanel onBack={back} />;
    if (view === 'statistics') return <StatisticsPanel onBack={back} />;
    if (view === 'quests')
      return <QuestsPanel onBack={back} onStore={() => router.push('/profile?view=store')} />;
    if (view === 'medals') return <MedalsPanel onBack={back} />;
    if (view === 'reactions') return <ReactionsPanel onBack={back} />;
    // Every shortcut above resolves to a real screen now, so this is only
    // reachable by a hand-typed `?view=`.
    return (
      <div className="pb-6 pt-4">
        <button onClick={back} className="press mb-4 text-sm font-bold text-primary">
          ‹ Profile
        </button>
        <EmptyState
          pose="sad"
          title="No such screen"
          description={`There is nothing at "${view}". Head back to your profile.`}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        pose="sad"
        title="Can't reach the server"
        description="Your profile will fill in when you are back online."
        action={
          <Button variant="chunkyOutline" size="cta" onClick={() => reload(win)}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3 pb-6 pt-4">
      <div className="flex items-center justify-end">
        <button
          onClick={() => go('settings')}
          aria-label="Settings"
          className="press grid h-11 w-11 place-items-center rounded-full bg-secondary"
        >
          <Settings size={20} />
        </button>
      </div>

      <ProfileCard
        header={data.header}
        level={data.levels.level}
        bodyrank={data.ranks.bodyrank}
        standing={data.ranks.standing}
        streak={data.streaks}
        onEdit={() => go('edit')}
      />

      <div className="grid grid-cols-5 gap-2">
        {SHORTCUTS.map((s) => (
          <button
            key={s.view}
            onClick={() => go(s.view)}
            className="press flex flex-col items-center gap-1 rounded-xl bg-card py-2.5 text-[10px] font-bold"
          >
            <s.icon size={18} className="text-primary" />
            {s.label}
          </button>
        ))}
      </div>

      {layout.map((card) => {
        const body = (() => {
          switch (card) {
            case 'memories':
              return <MemoriesCard data={data} />;
            case 'last7':
              return (
                <Card title="Last 7 Days">
                  <BodygraphPair
                    className="h-44"
                    interactive={false}
                    colors={
                      Object.fromEntries(
                        Object.entries(data.last7).map(([m, v]) => [
                          m,
                          `hsl(var(--primary) / ${(0.15 + v * 0.75).toFixed(2)})`,
                        ]),
                      ) as Partial<Record<MuscleId, string>>
                    }
                  />
                </Card>
              );
            case 'totals':
              return <TotalsCard data={data} window={win} onWindow={changeWindow} />;
            case 'streaks':
              return <StreaksCard data={data} />;
            case 'levels':
              return <LevelsCard data={data} />;
            case 'ranks':
              return (
                <Card
                  title="Ranks"
                  action={
                    <button onClick={() => router.push('/ranks')} className="press text-sm font-bold text-primary">
                      View all ›
                    </button>
                  }
                >
                  <div className="flex items-center gap-4">
                    <RankBadge
                      tier={data.ranks.bodyrank.rank.tier}
                      division={data.ranks.bodyrank.rank.division}
                      size="md"
                    />
                    <div>
                      <p className="text-lg font-extrabold">
                        {data.ranks.bodyrank.predicted ? 'Predicted Rank: ' : ''}
                        {rankLabel(data.ranks.bodyrank.rank)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Placements {data.ranks.bodyrank.placements.done}/
                        {data.ranks.bodyrank.placements.required}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            case 'activity': {
              const peak = Math.max(1, ...data.activity.map((a) => a.workouts));
              return (
                <Card title="6-Month Activity">
                  <div className="flex h-20 items-end gap-0.5">
                    {data.activity.map((a) => (
                      <div
                        key={a.week}
                        title={`${a.workouts} workouts`}
                        className="flex-1 rounded-t bg-primary/60"
                        style={{ height: `${Math.max(3, (a.workouts / peak) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Workouts per week</p>
                </Card>
              );
            }
            case 'routines':
            case 'exercises':
            case 'reactions': {
              const n = data.counts[card as 'routines' | 'exercises' | 'reactions'];
              const Icon = card === 'routines' ? ListChecks : card === 'exercises' ? Dumbbell : MessageSquare;
              return (
                <button
                  onClick={() => go(card)}
                  className="surface press flex w-full items-center gap-3 p-4 text-left"
                >
                  <Icon size={20} className="text-primary" />
                  <span className="flex-1 font-extrabold">{CARD_TITLE[card]}</span>
                  <span className="nums text-sm font-bold text-muted-foreground">{n}</span>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </button>
              );
            }
            default:
              return null;
          }
        })();
        if (!body) return null;
        return (
          <div key={card} className="relative">
            {body}
            {editingLayout && (
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  aria-label={`Move ${CARD_TITLE[card]} up`}
                  onClick={() => move(card, -1)}
                  className="press grid h-8 w-8 place-items-center rounded-full bg-secondary"
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  aria-label={`Move ${CARD_TITLE[card]} down`}
                  onClick={() => move(card, 1)}
                  className="press grid h-8 w-8 place-items-center rounded-full bg-secondary"
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      <Button variant="chunkyOutline" onClick={() => setEditingLayout((v) => !v)}>
        <Activity size={16} className="mr-2" />
        {editingLayout ? 'Done' : 'Edit profile layout'}
      </Button>

      {/* The join date used to live down here as a footnote; it is on the card
          now, where the rest of who-you-are already was. */}
    </div>
  );
}
