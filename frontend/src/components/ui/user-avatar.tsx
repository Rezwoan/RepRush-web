'use client';
/**
 * A person's face, wherever it appears.
 *
 * There is one identity picture in this app, not two: a mascot *or* an uploaded
 * photo, whichever the user last chose. Three screens each drew that rule
 * themselves and the top bar drew a fourth version of it — always the mascot,
 * always inside a hardcoded blue ring — so a bought border changed every avatar
 * except the one permanently on screen, and an uploaded photo never reached it
 * at all.
 *
 * `border` is the cosmetic's paint (a CSS colour or gradient). Omitted, the
 * avatar takes the plain border, which is what the header does for anyone whose
 * cosmetics we do not have — a leaderboard row, say.
 */
import { cn } from '@/lib/utils';
import { Mascot, type MascotPose } from '@/components/art/mascot';

export interface AvatarIdentity {
  avatarId?: string | null;
  profileImage?: string | null;
  /** CSS paint from the equipped border cosmetic. */
  border?: string | null;
}

export function UserAvatar({
  user,
  size = 40,
  ring = 3,
  className,
}: {
  user: AvatarIdentity;
  size?: number;
  /** Thickness of the cosmetic ring, in px. */
  ring?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        padding: ring,
        background: user.border || 'hsl(var(--border))',
      }}
    >
      <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card">
        {user.profileImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.profileImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <Mascot pose={(user.avatarId as MascotPose) || 'idle'} size={size - ring * 2} />
        )}
      </span>
    </span>
  );
}
