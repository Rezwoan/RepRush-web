'use client';
/**
 * Profile → Reactions (P13c) — the last shortcut tile that had no screen.
 *
 * The rows have existed in `post_reactions` since P9; nothing read them as
 * "given" and "received", so the tile opened a *coming soon* for data that was
 * already there. `GET /social/reactions/mine` is the only new thing.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { socialApi } from '@/lib/api';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Avatar, type PublicUser } from '@/components/social/feed';
import { Panel } from './panel';

interface Item {
  emoji: string;
  at: string;
  sessionId: number;
  workoutType: string;
  sessionAt: string | null;
  user: PublicUser;
}

const when = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function ReactionsPanel({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<'received' | 'given'>('received');
  const [data, setData] = useState<{ received: Item[]; given: Item[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    socialApi
      .myReactions()
      .then((r) => setData(r.data))
      .catch(() => setFailed(true));
  }, []);

  const rows = data?.[tab] ?? [];

  return (
    <Panel title="Reactions" onBack={onBack}>
      <Segmented
        options={[
          { value: 'received', label: `Received${data ? ` (${data.received.length})` : ''}` },
          { value: 'given', label: `Given${data ? ` (${data.given.length})` : ''}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {!data && !failed && <div className="skeleton mt-3 h-48 w-full rounded-2xl" aria-busy="true" />}

      {failed && (
        <EmptyState
          pose="sad"
          title="Can't reach the server"
          description="Reactions fill in when you are back online."
        />
      )}

      {data && !rows.length && (
        <EmptyState
          pose={tab === 'received' ? 'idle' : 'cheer'}
          title={tab === 'received' ? 'No reactions yet' : 'You have not reacted to anything'}
          description={
            tab === 'received'
              ? 'Share a session with your friends and their reactions land here.'
              : 'Tap the emoji under a friend’s session — it shows up on their end, and here.'
          }
        />
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={`${r.sessionId}-${r.user.id}-${r.at}`}>
            {/* To the person, not the post: nothing opens a single post by URL,
                and a row that navigates nowhere is the thing this screen exists
                to stop doing. */}
            <button
              disabled={!r.user.username}
              onClick={() => router.push(`/u/${r.user.username}`)}
              className="surface press flex w-full items-center gap-3 p-3 text-left disabled:opacity-100"
            >
              <Avatar user={r.user} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {r.user.name}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {tab === 'received' ? 'reacted to your' : '— you reacted to their'} {r.workoutType}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{when(r.at)}</p>
              </div>
              <span className="text-2xl leading-none" aria-label={`Reaction ${r.emoji}`}>
                {r.emoji}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
