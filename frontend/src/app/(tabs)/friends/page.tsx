'use client';
/**
 * Friends tab — SPEC §8. Three sub-tabs: Friends, Leaderboards, Referrals.
 *
 * SPEC draws Leaderboards and Referrals as pushed screens off a banner button.
 * They are sub-tabs here for the same reason the Ranks tab has six: a pushed
 * screen inside a tab either loses the tab bar or needs its own back-stack, and
 * the Ranks pattern already exists in this codebase and works.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Gift,
  Search,
  Share2,
  Trophy,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { socialApi } from '@/lib/api';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip, Segmented, TabBarLinks } from '@/components/ui/controls';
import { Bar, EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RankChip } from '@/components/art/rank-badge';
import { Avatar, type PublicUser } from '@/components/social/feed';
import type { Rank } from '@/lib/ranks';

type Tab = 'friends' | 'boards' | 'referrals';

interface Friend extends PublicUser {
  rank: Rank | null;
  since: string;
}

interface SearchHit extends PublicUser {
  status: 'none' | 'friends' | 'incoming' | 'outgoing';
}

interface Referral {
  code: string;
  link: string;
  claimedFrom: PublicUser | null;
  referred: PublicUser[];
  quests: {
    id: string;
    label: string;
    target: number;
    xp: number;
    currency: number;
    progress: number;
    done: boolean;
    claimable: boolean;
  }[];
}

const METRICS = [
  { value: 'bodyrank', label: 'Bodyrank' },
  { value: 'lp', label: 'LP this week' },
  { value: 'volume', label: 'Volume (30d)' },
  { value: 'streak', label: 'Streak' },
  { value: 'workouts', label: 'Workouts' },
  { value: 'relative', label: 'Relative strength' },
  { value: 'wilks', label: 'Wilks' },
  { value: 'progress', label: 'Progress rate' },
];

// ── people ──────────────────────────────────────────────────────────

function PersonRow({
  user,
  rank,
  right,
}: {
  user: PublicUser;
  rank?: Rank | null;
  right?: React.ReactNode;
}) {
  return (
    <div className="surface flex items-center gap-3 p-3">
      <Avatar user={user} size={42} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">{user.name}</p>
        {user.username && <p className="truncate text-xs text-muted-foreground">@{user.username}</p>}
        {rank && <RankChip rank={rank} size="sm" className="mt-1" />}
      </div>
      {right}
    </div>
  );
}

function AddFriendSheet({
  open,
  onOpenChange,
  onChanged,
  onReferrals,
  link,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
  onReferrals: () => void;
  link: string | null;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      return;
    }
    // Debounced: search is an in-memory scan server-side, but a request per
    // keystroke is still a request per keystroke.
    const t = setTimeout(() => {
      socialApi
        .search(term)
        .then((r) => setHits(r.data))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const add = async (id: number) => {
    setHits((h) => h?.map((u) => (u.id === id ? { ...u, status: 'outgoing' } : u)) ?? null);
    await socialApi.addFriend(id).catch(() => {});
    onChanged();
  };

  const share = async () => {
    if (!link) return;
    // Web Share where it exists (SPEC §8), clipboard everywhere else. No
    // fallback modal — a copied link is a share.
    if (navigator.share) {
      await navigator.share({ title: 'RepRush', text: 'Train with me on RepRush', url: link }).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(link).catch(() => {});
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add friends">
      <div className="space-y-3 pb-2">
        <div className="flex gap-2">
          <Button variant="chunkyLight" className="flex-1" onClick={share} disabled={!link}>
            <Share2 size={16} className="mr-2" /> Invite
          </Button>
          <Button variant="chunkyLight" className="flex-1" onClick={onReferrals}>
            <Gift size={16} className="mr-2" /> Referrals
          </Button>
        </div>

        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username or name"
            className="w-full rounded-2xl border-2 border-border bg-card py-3 pl-10 pr-10 font-semibold outline-none focus:border-primary"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {hits === null && q.trim().length < 2 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Type at least two characters.
            </p>
          )}
          {hits?.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nobody by that name. Invite them instead.
            </p>
          )}
          {hits?.map((u) => (
            <PersonRow
              key={u.id}
              user={u}
              right={
                u.status === 'none' ? (
                  <Button variant="chunky" className="w-auto px-4" onClick={() => add(u.id)}>
                    Add
                  </Button>
                ) : (
                  <Chip>{u.status === 'friends' ? 'Friends' : u.status === 'outgoing' ? 'Requested' : 'Wants to add you'}</Chip>
                )
              }
            />
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function FriendsPanel({
  data,
  reload,
  onAdd,
}: {
  data: { friends: Friend[]; incoming: Friend[]; outgoing: Friend[] } | null;
  reload: () => void;
  onAdd: () => void;
}) {
  const act = async (fn: Promise<unknown>) => {
    await fn.catch(() => {});
    reload();
  };

  if (!data) {
    return (
      <div className="space-y-2 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="surface h-16 animate-pulse opacity-60" />
        ))}
      </div>
    );
  }

  const empty = !data.friends.length && !data.incoming.length && !data.outgoing.length;
  if (empty) {
    return (
      <EmptyState
        title="Working out is better with friends"
        description="Add someone and their sessions show up in your Friends feed — with the muscles they trained and what they hit."
        pose="cheer"
        action={
          <Button variant="chunky" size="cta" onClick={onAdd}>
            <UserPlus size={18} className="mr-2" /> Add friend
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5 py-4">
      {data.incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Requests
          </h2>
          {data.incoming.map((f) => (
            <PersonRow
              key={f.id}
              user={f}
              rank={f.rank}
              right={
                <div className="flex gap-1.5">
                  <button
                    aria-label={`Accept ${f.name}`}
                    onClick={() => act(socialApi.accept(f.id))}
                    className="press grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    aria-label={`Decline ${f.name}`}
                    onClick={() => act(socialApi.decline(f.id))}
                    className="press grid h-10 w-10 place-items-center rounded-full bg-muted"
                  >
                    <X size={18} />
                  </button>
                </div>
              }
            />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Friends ({data.friends.length})
          </h2>
          <button onClick={onAdd} className="press text-sm font-bold text-primary">
            + Add
          </button>
        </div>
        {data.friends.length === 0 && (
          <p className="text-sm text-muted-foreground">Nobody yet — your requests are below.</p>
        )}
        {data.friends.map((f) => (
          <PersonRow
            key={f.id}
            user={f}
            rank={f.rank}
            right={
              <button
                aria-label={`Remove ${f.name}`}
                onClick={() => act(socialApi.removeFriend(f.id))}
                className="press grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <UserX size={18} />
              </button>
            }
          />
        ))}
      </section>

      {data.outgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Sent
          </h2>
          {data.outgoing.map((f) => (
            <PersonRow
              key={f.id}
              user={f}
              right={
                <button
                  onClick={() => act(socialApi.removeFriend(f.id))}
                  className="press rounded-full px-3 py-2 text-sm font-bold text-muted-foreground"
                >
                  Cancel
                </button>
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ── leaderboards ────────────────────────────────────────────────────

function BoardsPanel() {
  const [scope, setScope] = useState<'friends' | 'global'>('global');
  const [metric, setMetric] = useState('bodyrank');
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    setRows(null);
    socialApi
      .leaderboard(scope, metric)
      .then((r) => setRows(r.data))
      .catch(() => setRows([]));
  }, [scope, metric]);

  return (
    <div className="space-y-3 py-4">
      <Segmented
        options={[
          { value: 'global', label: 'Global' },
          { value: 'friends', label: 'Friends' },
        ]}
        value={scope}
        onChange={setScope}
      />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {METRICS.map((m) => (
          <Chip key={m.value} active={metric === m.value} onClick={() => setMetric(m.value)}>
            {m.label}
          </Chip>
        ))}
      </div>

      {rows === null && <div className="surface h-64 animate-pulse opacity-60" />}
      {rows?.length === 0 && (
        <EmptyState
          title="Nothing to rank yet"
          description="This board fills up as soon as there are numbers to compare."
        />
      )}
      <div className="space-y-2">
        {rows?.map((r) => (
          <motion.div
            key={r.user.id}
            layout
            transition={spring.soft}
            className={cn(
              'surface flex items-center gap-3 p-3',
              r.you && 'border-primary bg-primary/5',
            )}
          >
            <span
              className={cn(
                'nums grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-extrabold',
                r.position === 1
                  ? 'bg-volt-400 text-blue-950'
                  : r.position <= 3
                    ? 'bg-secondary'
                    : 'text-muted-foreground',
              )}
            >
              {r.position}
            </span>
            <Avatar user={r.user} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">
                {r.user.name}
                {r.you && <span className="ml-2 text-xs font-extrabold text-primary">YOU</span>}
              </p>
              {r.rank ? (
                <span className="mt-0.5 flex items-center gap-2">
                  <RankChip rank={r.rank} size="sm" />
                  {r.predicted && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      predicted
                    </span>
                  )}
                </span>
              ) : (
                r.user.username && (
                  <p className="truncate text-xs text-muted-foreground">@{r.user.username}</p>
                )
              )}
            </div>
            <p className="nums shrink-0 font-extrabold">{r.display}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── referrals ───────────────────────────────────────────────────────

function ReferralsPanel({ data, reload }: { data: Referral | null; reload: () => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!data) return <div className="surface my-4 h-64 animate-pulse opacity-60" />;

  const claim = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const r = await socialApi.claimReferral(code.trim());
      setMsg(`Referral claimed — you and ${r.data.referrer.name} are now connected.`);
      setCode('');
      reload();
    } catch (err: any) {
      setMsg(err?.response?.data?.message ?? 'That did not work.');
    }
    setBusy(false);
  };

  const share = async () => {
    if (navigator.share) {
      await navigator
        .share({ title: 'RepRush', text: `Join me on RepRush — my code is ${data.code}`, url: data.link })
        .catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(data.link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-4 py-4">
      <div className="surface p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Your referral code
        </p>
        <p className="nums my-2 text-4xl font-extrabold tracking-[0.2em] text-primary">{data.code}</p>
        <Button variant="chunky" size="cta" onClick={share}>
          {copied ? (
            <>
              <Copy size={18} className="mr-2" /> Link copied
            </>
          ) : (
            <>
              <Share2 size={18} className="mr-2" /> Invite friends
            </>
          )}
        </Button>
      </div>

      {!data.claimedFrom && (
        <div className="surface p-4">
          <p className="mb-2 font-bold">Got someone&apos;s code?</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
              className="nums flex-1 rounded-2xl border-2 border-border bg-card px-4 py-3 font-extrabold tracking-widest outline-none focus:border-primary"
            />
            <Button variant="chunkyGold" className="w-auto px-5" disabled={busy} onClick={claim}>
              Claim
            </Button>
          </div>
          {msg && <p className="mt-2 text-sm font-semibold text-muted-foreground">{msg}</p>}
        </div>
      )}

      {data.claimedFrom && (
        <PersonRow user={data.claimedFrom} right={<Chip>Referred you</Chip>} />
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Referral quests
        </h2>
        {data.quests.map((q) => (
          <div key={q.id} className="surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <Gift size={18} className={q.done ? 'text-volt-400' : 'text-muted-foreground'} />
              <p className="flex-1 font-bold">{q.label}</p>
              <p className="nums text-sm font-bold text-muted-foreground">
                {q.progress}/{q.target}
              </p>
            </div>
            <Bar value={q.progress / q.target} />
            <div className="mt-2 flex items-center gap-2">
              <Chip>+{q.xp} XP</Chip>
              <Chip>+{q.currency} 🥚</Chip>
              <span className="ml-auto text-xs font-semibold text-muted-foreground">
                {q.done ? 'Rewards land with quests' : 'Keep going'}
              </span>
            </div>
          </div>
        ))}
      </section>

      {data.referred.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            You referred ({data.referred.length})
          </h2>
          {data.referred.map((u) => (
            <PersonRow key={u.id} user={u} />
          ))}
        </section>
      )}
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────

const TABS: Tab[] = ['friends', 'boards', 'referrals'];

export default function FriendsPage() {
  // `?tab=` so Home's Discover grid can land straight on the leaderboards,
  // the same way `/ranks?tab=calc` already works.
  const params = useSearchParams();
  const wanted = params.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(wanted && TABS.includes(wanted) ? wanted : 'friends');
  const [friends, setFriends] = useState<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] } | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [adding, setAdding] = useState(false);

  const loadFriends = useCallback(() => {
    socialApi
      .friends()
      .then((r) => setFriends(r.data))
      .catch(() => setFriends({ friends: [], incoming: [], outgoing: [] }));
  }, []);

  const loadReferral = useCallback(() => {
    socialApi
      .referral()
      .then((r) => setReferral(r.data))
      .catch(() => setReferral(null));
  }, []);

  useEffect(() => {
    loadFriends();
    loadReferral();
  }, [loadFriends, loadReferral]);

  return (
    <div className="pb-6">
      <header className="flex items-center gap-3 pt-4">
        <h2 className="flex-1 text-3xl font-extrabold">Friends</h2>
        <button
          onClick={() => setTab('boards')}
          aria-label="Leaderboards"
          className="press grid h-11 w-11 place-items-center rounded-full bg-secondary"
        >
          <Trophy size={20} className="text-volt-400" />
        </button>
        <button
          onClick={() => setAdding(true)}
          aria-label="Add friend"
          className="press grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground"
        >
          <UserPlus size={20} />
        </button>
      </header>

      <TabBarLinks
        className="mt-3"
        options={[
          { value: 'friends', label: 'Friends' },
          { value: 'boards', label: 'Leaderboards' },
          { value: 'referrals', label: 'Referrals' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'friends' && (
        <FriendsPanel data={friends} reload={loadFriends} onAdd={() => setAdding(true)} />
      )}
      {tab === 'boards' && <BoardsPanel />}
      {tab === 'referrals' && <ReferralsPanel data={referral} reload={loadReferral} />}

      <AddFriendSheet
        open={adding}
        onOpenChange={setAdding}
        onChanged={loadFriends}
        onReferrals={() => {
          setAdding(false);
          setTab('referrals');
        }}
        link={referral?.link ?? null}
      />
    </div>
  );
}
