'use client';
/**
 * Quests and Medals (SPEC §10) — two screens over one `GET /gamification/me`.
 *
 * Both are *derived*: which quests you have is a hash of who you are and what
 * day it is, and a medal is a threshold over your own history. The only thing
 * stored anywhere is which rewards you have actually taken, which is the one
 * fact the sets cannot re-derive.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Gift, Lock } from 'lucide-react';
import { gameApi } from '@/lib/api';
import { flushOutbox, queueClaim } from '@/lib/offline';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Bar } from '@/components/ui/display';
import { Medal } from '@/components/art/medal';
import { Panel } from './panel';

interface Quest {
  key: string;
  label: string;
  target: number;
  progress: number;
  xp: number;
  currency: number;
  done: boolean;
  claimed: boolean;
}

interface MedalRow {
  id: string;
  label: string;
  emblem: string;
  unit: string;
  tiers: number[];
  materials: string[];
  flavour: string;
  value: number;
  earned: number;
  next: number | null;
  progress: number;
}

export interface GameSummary {
  level: { level: number; intoLevel: number; nextLevelXp: number; totalXp: number };
  currency: number;
  streak: { current: number; best: number; freezes: number };
  quests: { daily: Quest[]; weekly: Quest[]; referral: Quest[]; dailyEndsAt: string; weeklyEndsAt: string };
  medals: MedalRow[];
  equippedMedals: string[];
  levelRewards: { level: number; key: string; currency: number; claimed: boolean }[];
}

export function useGame() {
  const [data, setData] = useState<GameSummary | null>(null);
  const load = useCallback(async () => {
    const res = await gameApi.me().catch(() => null);
    if (res) setData(res.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, setData, reload: load };
}

/** `4h 12m` / `2 days` — the countdown under each quest group's heading. */
function until(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.max(1, Math.floor(ms / 60_000))} minutes`;
}

function QuestRow({ q, onClaim }: { q: Quest; onClaim: (key: string) => void }) {
  return (
    <div
      className={cn(
        'surface p-3.5',
        q.claimed && 'border-primary/40',
        q.done && !q.claimed && 'border-volt-400',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 font-bold">{q.label}</p>
        <span className="nums text-sm font-bold text-muted-foreground">
          {q.progress}/{q.target}
        </span>
      </div>
      <Bar value={q.progress / q.target} />
      <div className="mt-2.5 flex items-center gap-2">
        <span className="nums text-xs font-bold text-muted-foreground">◈ {q.xp} XP</span>
        <span className="nums text-xs font-bold text-muted-foreground">🥚 {q.currency}</span>
        <span className="flex-1" />
        {q.claimed ? (
          <span className="flex items-center gap-1 text-sm font-bold text-primary">
            <Check size={15} /> Complete
          </span>
        ) : (
          <Button
            variant={q.done ? 'chunky' : 'chunkyLight'}
            className="w-auto px-4 py-1.5 text-sm"
            disabled={!q.done}
            onClick={() => onClaim(q.key)}
          >
            {q.done ? 'Claim' : <Lock size={14} />}
          </Button>
        )}
      </div>
    </div>
  );
}

export function QuestsPanel({ onBack }: { onBack: () => void }) {
  const { data, setData } = useGame();
  const [error, setError] = useState('');

  const claim = async (key: string) => {
    setError('');
    // Queued, so a claim tapped with no signal is not lost — and the server's
    // unique (user, key) index means a replay cannot pay twice.
    queueClaim(key);
    await flushOutbox();
    const res = await gameApi.me().catch(() => null);
    if (res) setData(res.data);
    else setError('Saved — it will sync when you are back online.');
  };

  if (!data) {
    return (
      <Panel title="Your Quests" onBack={onBack}>
        <div className="surface h-64 animate-pulse opacity-60" />
      </Panel>
    );
  }

  const all = [...data.quests.daily, ...data.quests.weekly, ...data.quests.referral];
  const claimed = all.filter((q) => q.claimed).length;

  return (
    <Panel
      title="Your Quests"
      onBack={onBack}
      action={
        <span className="nums text-sm font-bold text-muted-foreground">
          {claimed} / {all.length}
        </span>
      }
    >
      <div className="surface mb-4 flex items-center gap-3 p-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-fill font-extrabold text-primary-foreground">
          {data.level.level}
        </span>
        <div className="min-w-0 flex-1">
          <Bar value={data.level.intoLevel / data.level.nextLevelXp} />
          <p className="nums mt-1 text-xs text-muted-foreground">
            {data.level.intoLevel} / {data.level.nextLevelXp} XP
          </p>
        </div>
        <span className="nums shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-extrabold">
          {data.currency} 🥚
        </span>
      </div>

      {error && <p className="mb-3 text-sm font-semibold text-destructive">{error}</p>}

      {data.levelRewards.some((l) => !l.claimed) && (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Level rewards
          </h2>
          <div className="space-y-2">
            {data.levelRewards
              .filter((l) => !l.claimed)
              .map((l) => (
                <div key={l.key} className="surface flex items-center gap-3 border-volt-400 p-3.5">
                  <Gift size={18} className="text-volt-400" />
                  <span className="flex-1 font-bold">Level {l.level} reward</span>
                  <span className="nums text-sm font-bold text-muted-foreground">
                    🥚 {l.currency}
                  </span>
                  <Button
                    variant="chunkyGold"
                    className="w-auto px-4 py-1.5 text-sm"
                    onClick={() => claim(l.key)}
                  >
                    Claim
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      {(
        [
          ['Daily quest', data.quests.daily, until(data.quests.dailyEndsAt)],
          ['Weekly quests', data.quests.weekly, until(data.quests.weeklyEndsAt)],
          ['Referral quests', data.quests.referral, ''],
        ] as [string, Quest[], string][]
      ).map(([title, list, timer]) => (
        <section key={title} className="mb-4">
          <div className="mb-2 flex items-center px-1">
            <h2 className="flex-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {title}
            </h2>
            {timer && <span className="text-xs font-bold text-muted-foreground">{timer}</span>}
          </div>
          <div className="space-y-2">
            {list.map((q) => (
              <QuestRow key={q.key} q={q} onClaim={claim} />
            ))}
          </div>
        </section>
      ))}
    </Panel>
  );
}

export function MedalsPanel({ onBack }: { onBack: () => void }) {
  const { data, setData } = useGame();

  if (!data) {
    return (
      <Panel title="Medals" onBack={onBack}>
        <div className="surface h-64 animate-pulse opacity-60" />
      </Panel>
    );
  }

  const equip = async (id: string) => {
    const next = data.equippedMedals.includes(id)
      ? data.equippedMedals.filter((x) => x !== id)
      : [...data.equippedMedals, id].slice(-3);
    const res = await gameApi.equipMedals(next).catch(() => null);
    if (res) setData(res.data);
  };

  return (
    <Panel title="Medals" onBack={onBack}>
      <section className="surface mb-4 p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Your display
        </h2>
        <div className="flex justify-center gap-4">
          {[0, 1, 2].map((slot) => {
            const id = data.equippedMedals[slot];
            const [categoryId, tier] = (id ?? '').split(':');
            const category = data.medals.find((m) => m.id === categoryId);
            return category ? (
              <button key={slot} onClick={() => equip(id)} className="press">
                <Medal
                  emblem={category.emblem as never}
                  material={category.materials[Number(tier)] as never}
                  size={64}
                />
              </button>
            ) : (
              <span
                key={slot}
                className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-border text-2xl text-muted-foreground"
              >
                +
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Tap an earned medal below to put it on your profile.
        </p>
      </section>

      <div className="space-y-3">
        {data.medals.map((c) => (
          <section key={c.id} className="surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 font-extrabold">{c.label}</h2>
              <span className="nums text-sm font-bold text-muted-foreground">
                {c.value.toLocaleString('en-GB')} {c.unit}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              {c.tiers.map((threshold, i) => {
                const earned = i < c.earned;
                const isNext = i === c.earned;
                const id = `${c.id}:${i}`;
                return (
                  <button
                    key={threshold}
                    disabled={!earned}
                    onClick={() => equip(id)}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-1',
                      earned && 'press',
                      data.equippedMedals.includes(id) && 'rounded-xl bg-primary/10 py-1',
                    )}
                  >
                    {earned || isNext ? (
                      <Medal
                        emblem={c.emblem as never}
                        material={c.materials[i] as never}
                        size={44}
                        className={cn(!earned && 'opacity-30 grayscale')}
                      />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-lg font-extrabold text-muted-foreground">
                        ?
                      </span>
                    )}
                    <span className="nums text-[10px] font-bold text-muted-foreground">
                      {threshold >= 1000 ? `${Math.round(threshold / 1000)}k` : threshold}
                    </span>
                  </button>
                );
              })}
            </div>
            {c.next !== null && (
              <div className="mt-3">
                <Bar value={c.progress} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {(c.next - c.value).toLocaleString('en-GB')} more {c.unit} for the next one.
                </p>
              </div>
            )}
            <p className="mt-2 text-xs italic text-muted-foreground">{c.flavour}</p>
          </section>
        ))}
      </div>
    </Panel>
  );
}
