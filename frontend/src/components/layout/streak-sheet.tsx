'use client';
/**
 * What the flame in the top bar actually means.
 *
 * The icon had a `title` attribute and nothing else, so on a phone — where this
 * app lives — there was no way to find out what it counted. Tapping it opens
 * this, and this is also where the streak's rules get stated: they are real
 * (freezes are earned and spent automatically) and were previously explained
 * nowhere in the UI.
 */
import { Flame, Snowflake, Trophy } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/ui/display';

export function StreakSheet({
  open,
  onOpenChange,
  streak,
  onQuests,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  streak?: { current: number; best: number; freezes: number };
  onQuests?: () => void;
}) {
  const current = streak?.current ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your streak">
      <div className="space-y-4 pb-2">
        <div className="flex flex-col items-center py-2 text-center">
          <Flame
            size={56}
            className={current > 0 ? 'fill-volt-400/30 text-volt-400' : 'text-muted-foreground'}
          />
          <p className="nums mt-2 text-4xl font-extrabold">{current}</p>
          <p className="text-sm text-muted-foreground">
            {current === 0
              ? 'Train today to start one'
              : `day${current === 1 ? '' : 's'} in a row`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Best"
            value={streak?.best ?? 0}
            sub={
              <span className="inline-flex items-center gap-1">
                <Trophy size={12} /> days
              </span>
            }
          />
          <StatTile
            label="Freezes"
            value={streak?.freezes ?? 0}
            sub={
              <span className="inline-flex items-center gap-1">
                <Snowflake size={12} /> banked
              </span>
            }
          />
        </div>

        <div className="surface space-y-2 p-4 text-sm">
          <p>
            <span className="font-bold">A day counts</span> when you finish a workout. Miss one and
            the streak resets.
          </p>
          <p>
            <span className="font-bold">Freezes</span> cover a missed day automatically — you earn
            one every 7 unbroken days and can bank up to 2. Two missed days in a row breaks the
            streak whatever you have saved.
          </p>
          <p className="text-muted-foreground">
            A longer streak also pays more Spark per session.
          </p>
        </div>

        {onQuests && (
          <Button variant="chunky" size="cta" className="w-full" onClick={onQuests}>
            See quests
          </Button>
        )}
      </div>
    </Sheet>
  );
}
