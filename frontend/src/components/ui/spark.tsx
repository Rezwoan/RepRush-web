/**
 * Spark — the earned currency, in one place.
 *
 * It had three different faces before this file existed: a `Globe` icon in the
 * top bar, a 🥚 emoji in Quests, the Store and the Friends tab, and the actual
 * name only ever in backend source. A currency the user cannot name is one they
 * cannot reason about, so every screen renders it from here.
 */
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The currency's name. Singular and plural are the same word. */
export const SPARK = 'Spark';

export function SparkMark({ size = 16, className }: { size?: number; className?: string }) {
  // volt-400 is the logo gold — Spark is the brand's own bolt, not a coin.
  return <Zap size={size} className={cn('shrink-0 fill-volt-400 text-volt-400', className)} aria-hidden />;
}

/**
 * An amount of Spark. `label` spells the name out — use it anywhere the word
 * has room, and leave it off in dense rows where the mark alone has to carry it
 * (the mark is the same everywhere, which is what makes that readable).
 */
export function SparkAmount({
  amount,
  size = 16,
  label = false,
  className,
}: {
  amount: number;
  size?: number;
  label?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <SparkMark size={size} />
      <span className="nums font-extrabold">{amount.toLocaleString('en-US')}</span>
      {label && <span className="font-bold">{SPARK}</span>}
      <span className="sr-only"> {SPARK}</span>
    </span>
  );
}
