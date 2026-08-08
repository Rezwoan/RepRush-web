'use client';
/**
 * Global top bar: identity + the three numbers the loop runs on (level, streak,
 * currency). Present on Home, Ranks and Friends; screens with their own header
 * (session, settings, onboarding) don't mount it.
 *
 * Both numbers on the right are **buttons**. They were `<span>`s with a `title`,
 * which is a tooltip no touch device shows — so the flame was an unexplained
 * icon and the Spark balance had nowhere to lead.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Flame, UserPlus, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { useIdleMotion } from '@/lib/use-idle-motion';
import { Bar } from '@/components/ui/display';
import { SparkMark } from '@/components/ui/spark';

export interface TopBarProps {
  level?: number;
  /** 0–1 progress through the current level. */
  levelProgress?: number;
  streak?: number;
  currency?: number;
  avatar?: React.ReactNode;
  /** Right-hand slot: notifications by default. */
  action?: 'bell' | 'addFriend' | 'help' | 'none';
  onAction?: () => void;
  onStreak?: () => void;
  onCurrency?: () => void;
  unread?: number;
  className?: string;
}

const ACTION_ICON = { bell: Bell, addFriend: UserPlus, help: HelpCircle } as const;

/**
 * How hot the flame burns. The icon is the only thing left on screen once the
 * reveal retracts, so it has to carry the streak's size by itself.
 */
function flameStyle(streak: number) {
  if (streak <= 0) return { className: 'text-muted-foreground', size: 20 };
  if (streak < 7) return { className: 'text-volt-400', size: 20 };
  if (streak < 30) return { className: 'fill-volt-400/30 text-volt-400', size: 21 };
  return { className: 'fill-orange-500/40 text-orange-500 drop-shadow-[0_0_6px_rgba(249,115,22,0.55)]', size: 22 };
}

/**
 * The streak, revealed once per app open: the count slides out from behind the
 * flame, holds, then retracts leaving the lit icon. Tapping opens the detail.
 *
 * `sessionStorage` rather than state, so moving between tabs does not replay it
 * — the tab shell stays mounted, but a hard navigation would otherwise restart.
 */
function StreakButton({ streak, onClick }: { streak: number; onClick?: () => void }) {
  const animate = useIdleMotion();
  const [open, setOpen] = useState(false);
  const flame = flameStyle(streak);

  useEffect(() => {
    // Reduced motion (or the server pass) keeps the number permanently visible
    // instead: the reveal is what communicates it, so with no reveal the number
    // has to stay.
    if (!animate) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('reprush_streak_shown') === '1';
    } catch {}
    if (seen) return;
    try {
      sessionStorage.setItem('reprush_streak_shown', '1');
    } catch {}
    const show = setTimeout(() => setOpen(true), 450);
    const hide = setTimeout(() => setOpen(false), 2900);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [animate]);

  const expanded = !animate || open;

  return (
    <button
      onClick={onClick}
      className="press flex items-center gap-1 rounded-full py-1"
      aria-label={streak > 0 ? `${streak} day streak — open streak details` : 'No streak yet — open streak details'}
    >
      <Flame size={flame.size} className={flame.className} />
      <motion.span
        // Width, not just opacity: the label has to take the row's space back
        // when it retracts, or the bar keeps a hole where the number was.
        initial={false}
        animate={{ width: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
        transition={spring}
        className="overflow-hidden whitespace-nowrap text-sm font-extrabold"
      >
        <span className="nums pr-0.5">{streak}</span>
        {animate && open && <span className="pr-1 font-bold"> day{streak === 1 ? '' : 's'}</span>}
      </motion.span>
    </button>
  );
}

export function TopBar({
  level,
  levelProgress = 0,
  streak = 0,
  currency,
  avatar,
  action = 'bell',
  onAction,
  onStreak,
  onCurrency,
  unread = 0,
  className,
}: TopBarProps) {
  const Icon = action !== 'none' ? ACTION_ICON[action] : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl safe-top',
        className,
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2.5">
        {/* Identity + level */}
        <Link href="/profile" className="press flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-primary bg-secondary">
            {avatar}
          </span>
          {level !== undefined && (
            <span className="min-w-0">
              <span className="block text-xs font-extrabold leading-tight">Lv.{level}</span>
              <Bar
                value={levelProgress}
                height={5}
                className="mt-0.5 w-20"
                label={`Level ${level} progress`}
              />
            </span>
          )}
        </Link>

        <div className="flex-1" />

        <StreakButton streak={streak} onClick={onStreak} />

        {currency !== undefined && (
          <button
            onClick={onCurrency}
            className="press flex items-center gap-1 rounded-full py-1"
            aria-label={`${currency} Spark — open the store`}
          >
            <SparkMark size={18} />
            <span className="nums text-sm font-extrabold">{currency.toLocaleString('en-US')}</span>
          </button>
        )}

        {Icon && (
          <button
            onClick={onAction}
            className="press relative rounded-full p-1.5 text-tier-gold"
            aria-label={action === 'bell' ? 'Notifications' : action === 'addFriend' ? 'Add friend' : 'Help'}
          >
            <Icon size={22} />
            {unread > 0 && (
              <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
