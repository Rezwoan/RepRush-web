'use client';
/**
 * Somebody else's profile (SPEC §9 → `Preview Public Profile`).
 *
 * Outside the tab shell on purpose: it is what a *link* opens, including for
 * someone who is not signed in, so it must not assume a tab bar or a session.
 *
 * It renders the same `ProfileCard` the owner sees on their own tab — banner,
 * worn medals, rank, standing, join date — and then the parts of their record
 * that are nobody's secret. What it deliberately does not show: the health log,
 * routines, preferences, or anything per-session.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { profileApi } from '@/lib/api';
import { type Rank } from '@/lib/ranks';
import { Button } from '@/components/ui/button';
import { EmptyState, StatTile } from '@/components/ui/display';
import { ProfileCard, type ProfileCardHeader } from '@/components/profile/profile-card';

interface PublicProfile {
  header: ProfileCardHeader;
  bodyrank: { rank: Rank; predicted: boolean };
  standing: { position: number | null; of: number };
  levels: { level: number; intoLevel: number; nextLevelXp: number; records: number };
  workouts: number;
  streak: { current: number; best: number };
  daysTrained: number;
  volumeKg: number;
  minutes: number;
  activity: { week: string; workouts: number }[];
}

const compact = (n: number) =>
  n >= 1_000_000
    ? `${Math.round(n / 100_000) / 10}M`
    : n >= 1_000
      ? `${Math.round(n / 100) / 10}k`
      : String(n);

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const [data, setData] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    profileApi
      .publicProfile(username)
      .then((r) => setData(r.data))
      .catch(() => setMissing(true));
  }, [username]);

  if (missing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          pose="sad"
          title="No such profile"
          description={`Nobody on RepRush goes by @${username}.`}
          action={
            <Button variant="chunky" size="cta" onClick={() => router.push('/home')}>
              Back to RepRush
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) return null;

  const peak = Math.max(1, ...data.activity.map((a) => a.workouts));
  const hours = Math.round(data.minutes / 60);

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-10 pt-4">
      <ProfileCard
        header={data.header}
        level={data.levels.level}
        bodyrank={data.bodyrank}
        standing={data.standing}
      />

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Workouts" value={String(data.workouts)} />
        <StatTile label="Streak" value={`${data.streak.current} 🔥`} sub={`best ${data.streak.best}`} />
        <StatTile label="Volume" value={`${compact(data.volumeKg)} kg`} />
        <StatTile label="Days trained" value={String(data.daysTrained)} />
        <StatTile label="Time" value={hours >= 1 ? `${hours}h` : `${data.minutes}m`} />
        <StatTile label="Records" value={String(data.levels.records)} />
      </div>

      <section className="surface p-4">
        <h2 className="mb-3 font-extrabold">6-Month Activity</h2>
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
      </section>

      <Button variant="chunkyOutline" size="cta" onClick={() => router.push('/friends')}>
        Back to RepRush
      </Button>
    </div>
  );
}
