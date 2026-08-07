'use client';
/**
 * Posts, reactions and comments (SPEC §4 → Friends / Discovery, §8).
 *
 * A post is a completed session someone chose to share — there is no `posts`
 * table behind it, which is why every field here is something the session
 * already knew. See `backend/src/social/social.service.ts`.
 *
 * One file for the card, the reaction row, the comment sheet and the feed
 * itself: they are only ever used together, and three files would be three
 * imports for one screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Dumbbell, MessageCircle, Star, Trash2 } from 'lucide-react';
import { profileApi, socialApi } from '@/lib/api';
import { cachePref, getPrefs } from '@/lib/feedback';
import { flushOutbox, queueReaction } from '@/lib/offline';
import { spring } from '@/lib/motion';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';
import type { Rank } from '@/lib/ranks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/display';
import { Sheet } from '@/components/ui/sheet';
import { RankChip } from '@/components/art/rank-badge';
import { BodygraphPair } from '@/components/art/bodygraph';
import { Mascot, type MascotPose } from '@/components/art/mascot';

export const REACTIONS = ['🔥', '💪', '👏', '😤', '🐐'];

export interface PublicUser {
  id: number;
  name: string;
  username: string | null;
  avatarId: string | null;
  profileImage: string | null;
}

export interface Post {
  sessionId: number;
  user: PublicUser;
  rank: Rank | null;
  completedAt: string;
  caption: string | null;
  privacy: string;
  durationSec: number;
  volumeKg: number;
  sets: number;
  prs: number;
  muscles: { muscleId: string; share: number }[];
  exercises: string[];
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
  comments: number;
}

interface Comment {
  id: number;
  text: string;
  createdAt: string;
  mine: boolean;
  user: PublicUser;
}

// ── bits ────────────────────────────────────────────────────────────

export function Avatar({ user, size = 40 }: { user: PublicUser; size?: number }) {
  if (user.profileImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.profileImage}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-muted"
      style={{ width: size, height: size }}
    >
      <Mascot pose={(user.avatarId as MascotPose) || 'idle'} size={Math.round(size * 0.8)} />
    </span>
  );
}

/** `3h`, `2d`, `Mar 4` — short enough to sit beside a name on a phone. */
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const hhmm = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

function muscleColors(muscles: Post['muscles']): Partial<Record<MuscleId, string>> {
  const out: Partial<Record<MuscleId, string>> = {};
  const top = muscles[0]?.share || 1;
  for (const m of muscles) {
    if (!(m.muscleId in MUSCLE_BY_ID)) continue;
    // Scaled against the session's *own* hardest-hit muscle, so a post that
    // trained one thing still reads as trained rather than as barely touched.
    out[m.muscleId as MuscleId] = `hsl(var(--primary) / ${(0.2 + (m.share / top) * 0.7).toFixed(2)})`;
  }
  return out;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-muted/50 px-2 py-2 text-center">
      <span className="mx-auto mb-0.5 flex items-center justify-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </span>
      <p className="nums text-sm font-extrabold leading-none">{value}</p>
    </div>
  );
}

// ── comments ────────────────────────────────────────────────────────

function CommentSheet({
  post,
  open,
  onOpenChange,
  onCount,
}: {
  post: Post;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCount: (n: number) => void;
}) {
  const [rows, setRows] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (list: Comment[]) => {
      setRows(list);
      onCount(list.length);
    },
    [onCount],
  );

  useEffect(() => {
    if (!open) return;
    socialApi
      .comments(post.sessionId)
      .then((r) => apply(r.data))
      .catch(() => setRows([]));
  }, [open, post.sessionId, apply]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await socialApi.comment(post.sessionId, body);
      apply(r.data);
      setText('');
    } catch {
      /* the sheet stays open with what they typed — nothing is lost */
    }
    setBusy(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`${post.user.name}'s workout`}>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pb-3">
        {rows === null && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {rows?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No comments yet. Say something.
          </p>
        )}
        {rows?.map((c) => (
          <div key={c.id} className="flex items-start gap-2.5">
            <Avatar user={c.user} size={32} />
            <div className="min-w-0 flex-1 rounded-2xl bg-muted/60 px-3 py-2">
              <p className="text-xs font-bold">
                {c.user.name}
                <span className="ml-2 font-normal text-muted-foreground">{ago(c.createdAt)}</span>
              </p>
              <p className="break-words text-sm">{c.text}</p>
            </div>
            {c.mine && (
              <button
                aria-label="Delete comment"
                className="press mt-1 text-muted-foreground"
                onClick={async () => {
                  await socialApi.deleteComment(c.id).catch(() => {});
                  const r = await socialApi.comments(post.sessionId);
                  apply(r.data);
                }}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Add a comment…"
          maxLength={500}
          className="flex-1 rounded-full border-2 border-border bg-card px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary"
        />
        <Button variant="chunky" className="w-auto px-5" disabled={!text.trim() || busy} onClick={send}>
          Send
        </Button>
      </div>
    </Sheet>
  );
}

// ── the card ────────────────────────────────────────────────────────

export function PostCard({ post: initial, compact = false }: { post: Post; compact?: boolean }) {
  const [post, setPost] = useState(initial);
  const [comments, setComments] = useState(false);
  const colors = useMemo(() => muscleColors(post.muscles), [post.muscles]);

  const react = async (emoji: string) => {
    // Optimistic, and queued rather than posted: a reaction tapped on gym wifi
    // that has stopped routing should still land when the app reconnects.
    const clearing = post.myReaction === emoji;
    const was = post.reactions.find((r) => r.emoji === emoji)?.count ?? 0;
    setPost((p) => ({
      ...p,
      myReaction: clearing ? null : emoji,
      reactions: [
        ...p.reactions.filter((r) => r.emoji !== emoji && r.emoji !== p.myReaction),
        ...(clearing ? [] : [{ emoji, count: was + 1 }]),
      ].filter((r) => r.count > 0),
    }));
    queueReaction(post.sessionId, clearing ? null : emoji);
    await flushOutbox();
    const fresh = await socialApi.post(post.sessionId).catch(() => null);
    if (fresh) setPost(fresh.data);
  };

  const topMuscles = post.muscles
    .slice(0, 3)
    .map((m) => MUSCLE_BY_ID[m.muscleId as MuscleId]?.label ?? m.muscleId);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="surface overflow-hidden"
    >
      <header className="flex items-center gap-3 p-3.5 pb-2.5">
        <Avatar user={post.user} size={compact ? 34 : 40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{post.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {post.user.username ? `@${post.user.username} · ` : ''}
            {ago(post.completedAt)}
          </p>
        </div>
        {post.rank && !compact && <RankChip rank={post.rank} size="sm" />}
      </header>

      {post.caption && <p className="px-3.5 pb-2.5 text-sm">{post.caption}</p>}

      <div className="flex gap-2 px-3.5">
        <Stat icon={<Clock size={12} />} label="Time" value={hhmm(post.durationSec)} />
        <Stat
          icon={<Dumbbell size={12} />}
          label="Volume"
          value={`${post.volumeKg.toLocaleString('en-GB')} kg`}
        />
        <Stat icon={<Star size={12} />} label="Records" value={String(post.prs)} />
      </div>

      {!compact && post.muscles.length > 0 && (
        <div className="flex items-center gap-3 px-3.5 pt-3">
          <BodygraphPair className="h-28" colors={colors} interactive={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Trained
            </p>
            <p className="text-sm font-semibold">{topMuscles.join(' · ')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {post.sets} sets · {post.exercises.length} exercises
            </p>
          </div>
        </div>
      )}

      <footer className="mt-3 flex items-center gap-1 border-t border-border px-2 py-1.5">
        {REACTIONS.map((emoji) => {
          const count = post.reactions.find((r) => r.emoji === emoji)?.count ?? 0;
          const mine = post.myReaction === emoji;
          return (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              aria-label={`React ${emoji}`}
              aria-pressed={mine}
              className={cn(
                'press flex items-center gap-1 rounded-full px-2 py-1.5 text-base leading-none transition-colors',
                mine ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted',
              )}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="nums text-xs font-bold">{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setComments(true)}
          className="press ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-muted-foreground hover:bg-muted"
        >
          <MessageCircle size={16} />
          {post.comments > 0 && <span className="nums">{post.comments}</span>}
        </button>
      </footer>

      <CommentSheet
        post={post}
        open={comments}
        onOpenChange={setComments}
        onCount={(n) => setPost((p) => ({ ...p, comments: n }))}
      />
    </motion.article>
  );
}

// ── the feed ────────────────────────────────────────────────────────

export function Feed({
  scope,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  scope: 'friends' | 'discovery';
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Discovery offers the two-up grid (SPEC §4); the friends feed is always the
  // single column, because a friend's session is something you read, not scan.
  //
  // The layout is the `biggerDiscoveryPosts` preference, not a second setting of
  // its own. It used to be a private localStorage key while Settings carried a
  // switch for the same thing that changed nothing — two controls, one of them
  // lying. Read in an effect so the server pass and the first client pass agree.
  const [grid, setGrid] = useState(false);
  const loaded = useRef(false);

  useEffect(() => setGrid(!getPrefs().biggerDiscoveryPosts), []);

  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      try {
        const r = await socialApi.feed(scope, before);
        setPosts((p) => (before && p ? [...p, ...r.data.posts] : r.data.posts));
        setCursor(r.data.nextCursor);
      } catch {
        setPosts((p) => p ?? []);
      }
      setBusy(false);
    },
    [scope],
  );

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    load();
  }, [load]);

  const setLayout = (g: boolean) => {
    setGrid(g);
    cachePref('biggerDiscoveryPosts', !g);
    // Fire and forget: the cached copy already applies, and the layout is a
    // preference, not data — losing the write costs one re-tap.
    void profileApi.update({ preferences: { biggerDiscoveryPosts: !g } }).catch(() => {});
  };

  if (posts === null) {
    return (
      <div className="space-y-3 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="surface h-48 animate-pulse opacity-60" />
        ))}
      </div>
    );
  }

  if (!posts.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        pose="idle"
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-3 py-4">
      {scope === 'discovery' && (
        <Segmented
          options={[
            { value: 'list', label: 'Single' },
            { value: 'grid', label: 'Two-up' },
          ]}
          value={grid ? 'grid' : 'list'}
          onChange={(v) => setLayout(v === 'grid')}
        />
      )}
      <div className={cn(grid && scope === 'discovery' ? 'grid grid-cols-2 gap-3' : 'space-y-3')}>
        {posts.map((p) => (
          <PostCard key={p.sessionId} post={p} compact={grid && scope === 'discovery'} />
        ))}
      </div>
      {cursor && (
        <Button variant="chunkyOutline" disabled={busy} onClick={() => load(cursor)}>
          {busy ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
