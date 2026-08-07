'use client';
/**
 * The public profile (SPEC §9 → `Preview Public Profile`).
 *
 * Outside the tab shell on purpose: it is what a *link* opens, including for
 * someone who is not signed in, so it must not assume a tab bar or a session.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { profileApi } from '@/lib/api';
import { rankLabel, type Rank } from '@/lib/ranks';
import { Button } from '@/components/ui/button';
import { EmptyState, StatTile } from '@/components/ui/display';
import { RankBadge } from '@/components/art/rank-badge';
import { Mascot, type MascotPose } from '@/components/art/mascot';

interface PublicProfile {
  header: {
    name: string;
    username: string | null;
    bio: string | null;
    avatarId: string | null;
    profileImage: string | null;
    joinedAt: string;
    cosmetics: { title: { label: string; paint: string }; border: { paint: string }; banner: { paint: string } };
  };
  bodyrank: { rank: Rank; predicted: boolean };
  workouts: number;
  streak: { current: number; best: number };
}

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

  const { header, bodyrank } = data;

  return (
    <div className="mx-auto max-w-lg px-4 pb-10">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="h-28 w-full" style={{ background: header.cosmetics.banner.paint }} />
        <div className="relative bg-card px-4 pb-5">
          <div
            className="absolute -top-10 left-4 grid h-[82px] w-[82px] place-items-center rounded-full p-[3px]"
            style={{ background: header.cosmetics.border.paint }}
          >
            <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card">
              {header.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={header.profileImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <Mascot pose={(header.avatarId as MascotPose) || 'idle'} size={62} />
              )}
            </span>
          </div>
          <div className="pt-12">
            <h1 className="text-2xl font-extrabold leading-tight">{header.name}</h1>
            {header.username && <p className="text-sm text-muted-foreground">@{header.username}</p>}
            <span
              className="mt-2 inline-block rounded-lg px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white"
              style={{ background: header.cosmetics.title.paint }}
            >
              {header.cosmetics.title.label}
            </span>
            {header.bio && <p className="mt-3 text-sm">{header.bio}</p>}
          </div>
        </div>
      </div>

      <div className="surface mt-3 flex items-center gap-4 p-4">
        <RankBadge tier={bodyrank.rank.tier} division={bodyrank.rank.division} size="md" />
        <div>
          <p className="text-lg font-extrabold">
            {bodyrank.predicted ? 'Predicted Rank: ' : ''}
            {rankLabel(bodyrank.rank)}
          </p>
          <p className="text-sm text-muted-foreground">
            Stronger than {Math.round(bodyrank.rank.percentile)}% of lifters
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatTile label="Workouts" value={String(data.workouts)} />
        <StatTile label="Streak" value={`${data.streak.current} 🔥`} />
        <StatTile label="Best" value={String(data.streak.best)} />
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Joined {new Date(header.joinedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
