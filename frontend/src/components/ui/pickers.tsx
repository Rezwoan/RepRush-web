'use client';
/**
 * Ruler and wheel pickers — the onboarding's height / weight / age inputs.
 *
 * Built on native scroll + CSS scroll-snap rather than a drag/gesture library:
 * the browser already does momentum, snapping, touch handling, keyboard and
 * accessibility, and it does all of it better on a low-end phone than JS would.
 * We only translate scroll offset ⇄ value.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Layout effect on the client, plain effect on the server (no SSR warning). */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface SnapArgs {
  count: number;
  itemSize: number;
  axis: 'x' | 'y';
  index: number;
  onIndex: (i: number) => void;
}

function useSnapScroll({ count, itemSize, axis, index, onIndex }: SnapArgs) {
  const ref = useRef<HTMLDivElement>(null);
  /** True while the user drives the scroll, so we don't fight them by re-centering. */
  const userScrolling = useRef(false);
  const raf = useRef(0);

  const scrollTo = useCallback(
    (i: number, smooth: boolean) => {
      const el = ref.current;
      if (!el) return;
      const offset = i * itemSize;
      el.scrollTo({ [axis === 'x' ? 'left' : 'top']: offset, behavior: smooth ? 'smooth' : 'auto' });
    },
    [axis, itemSize],
  );

  // Centre on the current value when it changes from outside.
  useIsoLayoutEffect(() => {
    if (!userScrolling.current) scrollTo(index, false);
  }, [index, scrollTo]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    userScrolling.current = true;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
      const i = Math.max(0, Math.min(count - 1, Math.round(pos / itemSize)));
      if (i !== index) onIndex(i);
      // Let go once the scroll has settled, so external updates work again.
      window.clearTimeout((el as any)._settle);
      (el as any)._settle = window.setTimeout(() => {
        userScrolling.current = false;
      }, 140);
    });
  }, [axis, count, index, itemSize, onIndex]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { ref, onScroll };
}

const clampToRange = (v: number, min: number, max: number, step: number) =>
  Math.max(0, Math.min(Math.round((max - min) / step), Math.round((v - min) / step)));

// ── Ruler ───────────────────────────────────────────────────────────
export interface RulerPickerProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  orientation?: 'horizontal' | 'vertical';
  /** Every Nth tick is long and labelled. */
  major?: number;
  className?: string;
  label?: string;
}

export function RulerPicker({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  orientation = 'horizontal',
  major = 5,
  className,
  label,
}: RulerPickerProps) {
  const horizontal = orientation === 'horizontal';
  const TICK = 14;
  const count = Math.round((max - min) / step) + 1;
  const index = clampToRange(value, min, max, step);
  const { ref, onScroll } = useSnapScroll({
    count,
    itemSize: TICK,
    axis: horizontal ? 'x' : 'y',
    index,
    onIndex: (i) => onChange(+(min + i * step).toFixed(4)),
  });

  const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 1 : 0;

  // The tick list is pure geometry and can be hundreds of nodes (a 30–200kg
  // ruler at 0.5 steps is 341 ticks). Rebuilding it on every scroll frame is
  // what turns a smooth drag into a frozen renderer.
  const ticks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const v = min + i * step;
        return { v, isMajor: Math.round(v / step) % major === 0, text: v.toFixed(decimals) };
      }),
    [count, min, step, major, decimals],
  );

  return (
    <div className={cn('relative', className)}>
      <div className="mb-4 text-center">
        <span className="nums text-6xl font-extrabold tabular-nums">{value.toFixed(decimals)}</span>
        {unit && <span className="ml-2 text-2xl font-bold text-muted-foreground">{unit}</span>}
      </div>

      <div className="relative">
        {/* Centre indicator */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-10 rounded-full bg-primary',
            // Vertical stays narrower than the labels' 36px offset, or it paints
            // straight over the major tick numbers.
            horizontal ? 'left-1/2 top-0 h-14 w-1 -translate-x-1/2' : 'left-0 top-1/2 h-1 w-8 -translate-y-1/2',
          )}
        />
        <div
          ref={ref}
          onScroll={onScroll}
          role="slider"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          onKeyDown={(ev) => {
            const back = ev.key === 'ArrowLeft' || ev.key === 'ArrowDown';
            const fwd = ev.key === 'ArrowRight' || ev.key === 'ArrowUp';
            if (!back && !fwd) return;
            ev.preventDefault();
            onChange(+(Math.min(max, Math.max(min, value + (fwd ? step : -step)))).toFixed(4));
          }}
          className={cn(
            'no-scrollbar relative overflow-auto focus-ring',
            horizontal
              ? 'flex h-20 snap-x snap-mandatory items-end'
              : 'flex h-56 w-24 snap-y snap-mandatory flex-col items-start',
          )}
          style={
            horizontal
              ? { paddingLeft: 'calc(50% - 7px)', paddingRight: 'calc(50% - 7px)' }
              : { paddingTop: 'calc(50% - 7px)', paddingBottom: 'calc(50% - 7px)' }
          }
        >
          {ticks.map((t, i) => (
            <div
              key={i}
              className={cn('relative shrink-0 snap-center', horizontal ? 'w-3.5' : 'h-3.5 w-full')}
            >
              <span
                className={cn(
                  'absolute rounded-full bg-muted-foreground',
                  t.isMajor ? 'opacity-90' : 'opacity-40',
                  horizontal
                    ? cn('bottom-0 left-1/2 w-0.5 -translate-x-1/2', t.isMajor ? 'h-8' : 'h-4')
                    : cn('left-0 top-1/2 h-0.5 -translate-y-1/2', t.isMajor ? 'w-8' : 'w-4'),
                )}
              />
              {t.isMajor && (
                <span
                  className={cn(
                    'nums absolute text-[11px] font-semibold text-muted-foreground',
                    horizontal
                      ? 'bottom-9 left-1/2 -translate-x-1/2'
                      : 'left-9 top-1/2 -translate-y-1/2',
                  )}
                >
                  {t.text}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Wheel ───────────────────────────────────────────────────────────
export function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  className,
  label,
  itemHeight = 48,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
  itemHeight?: number;
}) {
  const index = Math.max(0, options.indexOf(value));
  const { ref, onScroll } = useSnapScroll({
    count: options.length,
    itemSize: itemHeight,
    axis: 'y',
    index,
    onIndex: (i) => onChange(options[i]),
  });

  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-xl border-y-2 border-primary/60"
        style={{ height: itemHeight }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            'linear-gradient(hsl(var(--background)) 0%, transparent 28%, transparent 72%, hsl(var(--background)) 100%)',
        }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(ev) => {
          if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
          ev.preventDefault();
          const next = Math.max(0, Math.min(options.length - 1, index + (ev.key === 'ArrowDown' ? 1 : -1)));
          onChange(options[next]);
        }}
        className="no-scrollbar snap-y snap-mandatory overflow-y-auto focus-ring"
        style={{ height: itemHeight * 5, paddingBlock: itemHeight * 2 }}
      >
        {options.map((o, i) => (
          <div
            key={String(o)}
            role="option"
            aria-selected={i === index}
            className={cn(
              'flex snap-center items-center justify-center text-2xl font-bold transition-all',
              i === index ? 'text-foreground' : 'scale-90 text-muted-foreground/50',
            )}
            style={{ height: itemHeight }}
          >
            {String(o)}
          </div>
        ))}
      </div>
    </div>
  );
}
