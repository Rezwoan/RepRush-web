'use client';
/**
 * Global top bar: identity + the three numbers the loop runs on (level, streak,
 * currency). Present on Home, Ranks and Friends; screens with their own header
 * (session, settings, onboarding) don't mount it.
 */
import Link from 'next/link';
import { Bell, Flame, Globe, UserPlus, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Bar } from '@/components/ui/display';

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
  unread?: number;
  className?: string;
}

const ACTION_ICON = { bell: Bell, addFriend: UserPlus, help: HelpCircle } as const;

export function TopBar({
  level = 1,
  levelProgress = 0,
  streak = 0,
  currency = 0,
  avatar,
  action = 'bell',
  onAction,
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
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
        {/* Identity + level */}
        <Link href="/profile" className="press flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-primary bg-secondary">
            {avatar}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-extrabold leading-tight">Lv.{level}</span>
            <Bar
              value={levelProgress}
              height={5}
              className="mt-0.5 w-20"
              label={`Level ${level} progress`}
            />
          </span>
        </Link>

        <div className="flex-1" />

        <span className="flex items-center gap-1.5" title={`${streak} day streak`}>
          <Flame size={20} className={streak > 0 ? 'text-tier-gold' : 'text-muted-foreground'} />
          <span className="nums text-sm font-extrabold">{streak}</span>
        </span>

        <span className="flex items-center gap-1.5" title="Spark">
          <Globe size={20} className="text-primary" />
          <span className="nums text-sm font-extrabold">{currency}</span>
        </span>

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
