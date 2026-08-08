'use client';
/**
 * The profile card — yours and everybody else's.
 *
 * ## What changed, and why
 *
 * The banner was a coloured strip and nothing more: bought, equipped, and then
 * carrying no information at all. It holds the three medals you chose to wear
 * now, which is what the Medals screen has always promised ("tap an earned
 * medal to put it on your profile") and what nothing had ever shown.
 *
 * The card also says who you are *in the app* rather than only what you are
 * called: your rank, where that puts you against everyone else, your level, and
 * the day you joined. Those were scattered across three cards and a footer line.
 *
 * ## One component, two callers
 *
 * The Profile tab and `/u/[username]` render the same card. A public profile
 * that can disagree with the private one is the same trap Edit Profile avoided
 * by previewing with the real header — so this takes the owner's affordance
 * (`onEdit`) as an optional prop instead of existing twice.
 */
import { CalendarDays, Trophy } from 'lucide-react';
import { rankLabel, type Rank } from '@/lib/ranks';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Medal } from '@/components/art/medal';
import { RankBadge } from '@/components/art/rank-badge';

export interface EquippedMedal {
  id: string;
  label: string;
  emblem: string;
  material: string;
}

export interface ProfileCardHeader {
  name: string;
  username: string | null;
  bio: string | null;
  avatarId: string | null;
  profileImage: string | null;
  joinedAt: string;
  cosmetics: {
    title: { label: string; paint: string };
    border: { paint: string };
    banner: { paint: string };
  };
  medals?: EquippedMedal[];
}

/** `June 2026` — a join date is a milestone, not an appointment. */
const joined = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export function ProfileCard({
  header,
  level,
  bodyrank,
  standing,
  onEdit,
  action,
  className,
}: {
  header: ProfileCardHeader;
  level?: number;
  bodyrank?: { rank: Rank; predicted: boolean } | null;
  /** Position on the global Bodyrank board, and how many people are on it. */
  standing?: { position: number | null; of: number } | null;
  onEdit?: () => void;
  /** Anything the viewer can do about this person — Add friend, Share. */
  action?: React.ReactNode;
  className?: string;
}) {
  const medals = header.medals ?? [];

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border', className)}>
      <div
        className="relative flex h-28 items-start justify-end p-2.5"
        style={{ background: header.cosmetics.banner.paint }}
      >
        {medals.map((m) => (
          <span key={m.id} title={m.label} className="ml-1">
            <Medal emblem={m.emblem as never} material={m.material as never} size={44} label={m.label} />
          </span>
        ))}
      </div>

      <div className="relative bg-card px-4 pb-4">
        <div className="absolute -top-10 left-4">
          <UserAvatar
            user={{
              avatarId: header.avatarId,
              profileImage: header.profileImage,
              border: header.cosmetics.border.paint,
            }}
            size={82}
          />
          {level !== undefined && (
            <span className="nums absolute -bottom-1 right-0 rounded-full bg-primary-fill px-1.5 py-0.5 text-[10px] font-extrabold text-primary-foreground">
              {level}
            </span>
          )}
        </div>

        {/* The avatar is absolute and hangs into this card, so the first row
            has to reserve that height whether or not it holds a button —
            Edit Profile's live preview renders the card without one. */}
        <div className="flex h-10 items-center justify-end gap-2">
          {action}
          {onEdit && (
            <button onClick={onEdit} className="press text-sm font-bold text-primary">
              Edit profile
            </button>
          )}
        </div>

        <div className="mt-2">
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

        {bodyrank && (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
            <RankBadge tier={bodyrank.rank.tier} division={bodyrank.rank.division} size="sm" animated={false} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold leading-tight">
                {bodyrank.predicted && (
                  <span className="text-muted-foreground">Predicted </span>
                )}
                {rankLabel(bodyrank.rank)}
              </p>
              <p className="text-xs text-muted-foreground">
                Stronger than {Math.round(bodyrank.rank.percentile)}% of lifters
              </p>
            </div>
            {standing?.position && (
              <span className="shrink-0 text-right">
                <span className="nums flex items-center gap-1 font-extrabold">
                  <Trophy size={14} className="text-tier-gold" />#{standing.position}
                </span>
                <span className="text-[11px] text-muted-foreground">of {standing.of}</span>
              </span>
            )}
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays size={13} /> Joined {joined(header.joinedAt)}
        </p>
      </div>
    </div>
  );
}
