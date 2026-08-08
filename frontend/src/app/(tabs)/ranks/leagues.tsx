'use client';
/**
 * Leagues — SPEC §6. The weekly division table.
 *
 * There is no season table behind this: a season *is* the ISO week and a
 * division *is* your slice of everyone sorted by the LP they earned in it. See
 * the `ponytail:` note on `RanksService.leagues`.
 */
import { useEffect, useState } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { ranksApi } from '@/lib/api';
import { rankLabel } from '@/lib/ranks';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/display';
import { RankBadge } from '@/components/art/rank-badge';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ProfileLink } from '@/components/profile/profile-link';
import { tierColor, type Leagues } from './types';

/** "2d 4h" until the reset. Coarse on purpose — this is a countdown, not a clock. */
function until(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return 'any moment';
  const h = Math.floor(ms / 3600000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function LeaguesPanel() {
  const [data, setData] = useState<Leagues | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ranksApi
      .leagues()
      .then((r) => setData(r.data))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <EmptyState
        pose="sad"
        title="Standings unavailable"
        description="The league table needs a connection. Your own rank is still on the first tab."
      />
    );
  }
  if (!data) return <div className="py-16 text-center text-sm text-muted-foreground">Loading standings…</div>;

  const { rows, promoteTop, demoteBottom } = data;
  const demoteFrom = rows.length - demoteBottom;

  return (
    <div className="mt-4">
      <div className="surface flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
            Season {data.season.week}
          </p>
          <p className="text-lg font-extrabold">Division {data.division.index + 1}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Resets in</p>
          <p className="nums text-lg font-extrabold text-primary">{until(data.season.endsAt)}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Ranked by the LP you earn this week — a new personal best on any lift moves you up.
        {promoteTop > 0 && ` Top ${promoteTop} promote, bottom ${demoteBottom} drop.`}
      </p>

      <ul className="mt-4 space-y-1.5">
        {rows.map((r, i) => {
          const zone = i < promoteTop ? 'promote' : i >= demoteFrom ? 'demote' : null;
          return (
            <li
              key={r.userId}
              className={cn(
                'surface flex items-center gap-3 p-3',
                r.you && 'border-primary/60 bg-primary/10',
              )}
            >
              <span className="nums w-6 shrink-0 text-center text-sm font-extrabold text-muted-foreground">
                {i + 1}
              </span>
              {/* The row leads to the person. Standings you cannot look into
                  are a list of names. */}
              <ProfileLink username={r.username} className="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar user={r} size={34} ring={2} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {r.name}
                    {r.you && <span className="ml-1.5 text-xs font-extrabold text-primary">YOU</span>}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: tierColor(r.rank) }}>
                    {rankLabel(r.rank)}
                  </p>
                </div>
              </ProfileLink>
              {zone === 'promote' && <ChevronsUp size={16} className="shrink-0 text-success" />}
              {zone === 'demote' && <ChevronsDown size={16} className="shrink-0 text-destructive" />}
              <span className="nums shrink-0 text-right text-sm font-extrabold">
                {r.weeklyLp}
                <span className="ml-1 text-xs font-bold text-muted-foreground">LP</span>
              </span>
              <RankBadge tier={r.rank.tier} size="xs" animated={false} showDivision={false} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
