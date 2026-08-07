'use client';
/**
 * The docked number pad (SPEC §5.2).
 *
 * Deliberately **not** the OS keyboard. On a phone the system keyboard eats
 * half the screen, hides the set grid you are typing into, and puts `.` and the
 * digits in different places on every device. This pad is always the same size,
 * always in the same place, and carries the three keys that actually matter in
 * a gym: ±2.5 kg (±5 lb), duplicate the previous set, and a plate calculator.
 *
 * `ponytail:` no system-keyboard fallback toggle. The source app has one; the
 * pad here covers digits, a decimal point and backspace, so the only thing the
 * OS keyboard adds is a different layout. Add it if anyone asks.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Delete, Copy, Calculator, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { useUnits } from '@/lib/units';

export type Field = 'weight' | 'reps';

export interface KeypadProps {
  field: Field;
  value: string;
  onChange: (next: string) => void;
  /** Advance to the next field / set. */
  onNext: () => void;
  onClose: () => void;
  /** Copies the previous set's number into this field. Hidden when there isn't one. */
  previous?: string;
  /** Bar weight for the plate calculator, in kg. */
  barKg?: number;
  onHelp?: () => void;
}

/**
 * What a loaded bar is actually made of, heaviest first. A gym in pounds does
 * not stock 20 kg plates relabelled — it stocks 45s, so converting the metric
 * set would print plate weights nobody owns.
 */
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
/** The standard bar, in each vocabulary. 45 lb is 20.4 kg — close, not equal. */
const BAR_LB = 45;

const trim = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Plates per side for a target total. Returns null when it cannot be loaded.
 * Unit-agnostic: pass the total, the bar and the plate set in the same unit.
 */
export function platesFor(total: number, bar: number, plates: number[] = PLATES_KG): number[] | null {
  let side = (total - bar) / 2;
  if (side < 0) return null;
  const out: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      out.push(p);
      side -= p;
    }
  }
  return side < 1e-9 ? out : null;
}

export function Keypad({
  field,
  value,
  onChange,
  onNext,
  onClose,
  previous,
  barKg = 20,
  onHelp,
}: KeypadProps) {
  const u = useUnits();
  // Everything on this pad is in the unit the field is labelled with; the
  // session screen converts back to kg when the set is committed.
  const bar = u.imperial ? BAR_LB : barKg;
  const step = field === 'reps' ? 1 : u.step;

  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1));
    if (key === '.') return onChange(value.includes('.') || field === 'reps' ? value : `${value || '0'}.`);
    // A leading zero is never what anyone means.
    onChange(value === '0' ? key : `${value}${key}`);
  };

  const bump = (delta: number) => {
    const next = Math.max(0, (parseFloat(value) || 0) + delta);
    onChange(trim(next));
  };

  const plates = useMemo(
    () =>
      field === 'weight'
        ? platesFor(parseFloat(value) || 0, bar, u.imperial ? PLATES_LB : PLATES_KG)
        : null,
    [field, value, bar, u.imperial],
  );

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={spring.snappy}
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-popover safe-bottom"
    >
      {/* The banner is the single most misunderstood thing in a lifting log. */}
      <div className="flex items-center justify-between gap-2 bg-primary px-4 py-2 text-primary-foreground">
        <p className="text-xs font-semibold">
          {field === 'weight'
            ? 'Log the total weight (bar included if applicable)'
            : 'Reps you completed on this set'}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onHelp && (
            <button onClick={onHelp} className="rounded-full px-2 py-0.5 text-xs font-bold underline">
              How to Log?
            </button>
          )}
          <button onClick={onClose} aria-label="Close keypad" className="rounded-full p-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Only once there is a number to load — an empty field is not an
          unloadable bar, and saying so reads as an error. */}
      {field === 'weight' && value !== '' && (
        <p className="nums px-4 pt-2 text-xs text-muted-foreground">
          {plates?.length
            ? `Per side: ${plates.join(' + ')} ${u.w} on a ${bar} ${u.w} bar`
            : plates
              ? `Just the ${bar} ${u.w} bar`
              : 'Not loadable with standard plates'}
        </p>
      )}

      {/*
        Two columns rather than one 4-wide grid: NEXT is a full-height key, and
        spanning rows inside a single grid pushed the digits into the gap it
        left, so the pad read 1 2 3 / 4 5 6 7 / 8 9 ▦ 0.
      */}
      <div className="mx-auto flex max-w-md gap-2 p-3">
        <div className="grid flex-1 grid-cols-3 gap-2">
          <button onClick={() => bump(-step)} className={keyCls('accent')}>
            −{trim(step)}
          </button>
          <button onClick={() => bump(step)} className={keyCls('accent')}>
            +{trim(step)}
          </button>
          <button
            onClick={() => previous && onChange(previous)}
            disabled={!previous}
            aria-label="Copy previous set"
            className={cn(keyCls('accent'), 'disabled:opacity-35')}
          >
            <Copy size={18} />
          </button>

          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
            <button key={k} onClick={() => press(k)} className={keyCls()}>
              {k}
            </button>
          ))}

          <button
            onClick={() => field === 'weight' && onChange(trim(bar))}
            disabled={field !== 'weight'}
            aria-label={`Empty ${bar} ${u.w} bar`}
            className={cn(keyCls('accent'), 'disabled:opacity-35')}
          >
            <Calculator size={18} />
          </button>
          <button onClick={() => press('0')} className={keyCls()}>
            0
          </button>
          <button
            onClick={() => press('.')}
            disabled={field === 'reps'}
            className={cn(keyCls(), 'disabled:opacity-35')}
          >
            .
          </button>
        </div>

        <div className="flex w-[76px] shrink-0 flex-col gap-2">
          <button onClick={() => press('⌫')} aria-label="Backspace" className={keyCls('accent')}>
            <Delete size={18} />
          </button>
          <button onClick={onNext} className={cn(keyCls('primary'), 'h-auto flex-1')}>
            <span className="flex flex-col items-center gap-0.5 text-xs font-extrabold uppercase tracking-wider">
              <ChevronRight size={20} />
              Next
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const keyCls = (tone: 'plain' | 'accent' | 'primary' = 'plain') =>
  cn(
    'press grid h-12 place-items-center rounded-xl text-lg font-extrabold',
    'border-b-2 active:translate-y-[2px] active:border-b-0',
    tone === 'primary'
      ? 'h-auto border-b-black/25 bg-primary text-primary-foreground'
      : tone === 'accent'
        ? 'border-b-border bg-secondary text-foreground'
        : 'border-b-border bg-card text-foreground',
  );

// ── self-check ────────────────────────────────────────────────────
// The plate calculator is the one thing here that can be quietly wrong, and a
// wrong answer sends someone to load a bar that does not add up.
export const __selfcheck = () => {
  const eq = (a: number[] | null, b: number[] | null, msg: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`keypad: ${msg} (got ${JSON.stringify(a)})`);
  };

  eq(platesFor(20, 20), [], 'an empty bar needs no plates');
  eq(platesFor(60, 20), [20], '60 kg is a 20 on each side');
  // [25, 15], not [20, 20]. Both load 100 kg in two plates; the calculator
  // reaches for the biggest first. This assertion has been wrong since P6 and
  // nothing noticed, because the check only runs on `/kitchen-sink`.
  eq(platesFor(100, 20), [25, 15], '100 kg is a 25 and a 15 a side');
  eq(platesFor(102.5, 20), [25, 15, 1.25], '102.5 kg needs the small plates');
  eq(platesFor(10, 20), null, 'below the bar is not loadable');
  eq(platesFor(21, 20), null, '21 kg cannot be made from standard plates');
  // Imperial is a different plate set, not a converted one.
  eq(platesFor(135, 45, PLATES_LB), [45], '135 lb is a 45 a side on a 45 lb bar');
  eq(platesFor(225, 45, PLATES_LB), [45, 45], '225 lb is two 45s a side');
  eq(platesFor(50, 45, PLATES_LB), [2.5], '50 lb is the smallest pair');
  // Greedy is not provably minimal — 25 does not divide 20 — but it always
  // finds *a* valid load on both plate sets, and reaching for the heaviest
  // plate first is what anyone actually does at the rack.
  const heavy = platesFor(180, 20);
  if (!heavy || heavy[0] !== 25) throw new Error('keypad: the calculator should reach for the biggest plate first');
  if (Math.abs((heavy.reduce((a, b) => a + b, 0) * 2 + 20) - 180) > 1e-9)
    throw new Error('keypad: the plates do not add up to the target');
  return 'keypad ok';
};
