'use client';
/**
 * Bodygraph — the anatomical figure that every rank, fatigue and volume view
 * paints onto.
 *
 * The anatomy comes from `body-muscles` (Apache-2.0): 89 SVG regions across
 * front and back, left/right split, far better than anything worth hand-drawing.
 * We use its raw path data rather than its DOM renderer, so this stays a normal
 * React SVG we control — our tier colours, our click handling, our theming.
 *
 * The one thing we add is the mapping below: their 89 anatomical regions
 * collapse onto the 21 trainable muscles in `lib/muscles.ts`, which is the
 * vocabulary the exercise catalog and the rank engine speak. Tapping "quads"
 * lights both legs; ranking "quads" colours all four regions.
 */
import { useMemo } from 'react';
import { FRONT_MUSCLES, BACK_MUSCLES, type MuscleDef } from 'body-muscles';
import { cn } from '@/lib/utils';
import { MUSCLE_BY_ID, type MuscleId } from '@/lib/muscles';

/**
 * Our trainable muscle → the vendor's anatomical regions.
 * `_` prefixed entries are structure (head, hands, joints): drawn as body, never
 * tinted, never clickable.
 */
const REGION_MAP: Record<MuscleId | '_structure', string[]> = {
  neck: ['neck-left', 'neck-right', 'nape'],
  traps: [
    'traps-upper-left', 'traps-mid-left', 'traps-lower-left',
    'traps-upper-right', 'traps-mid-right', 'traps-lower-right',
  ],
  front_delt: ['shoulder-front-left', 'shoulder-front-right'],
  side_delt: ['shoulder-side-left', 'shoulder-side-right'],
  rear_delt: ['deltoid-rear-left', 'deltoid-rear-right'],
  upper_chest: ['chest-upper-left', 'chest-upper-right'],
  mid_chest: ['chest-lower-left', 'chest-lower-right'],
  // The vendor splits the chest in two, not three. Serratus is the closest
  // honest home for "lower chest" volume rather than inventing a region.
  lower_chest: ['serratus-anterior-left', 'serratus-anterior-right'],
  biceps: ['biceps-left', 'biceps-right'],
  triceps: [
    'triceps-long-left', 'triceps-lateral-left',
    'triceps-long-right', 'triceps-lateral-right',
  ],
  forearms: [
    'forearm-left', 'forearm-right',
    'forearm-flexors-left', 'forearm-extensors-left',
    'forearm-flexors-right', 'forearm-extensors-right',
  ],
  lats: [
    'lats-upper-left', 'lats-mid-left', 'lats-lower-left',
    'lats-upper-right', 'lats-mid-right', 'lats-lower-right',
  ],
  upper_back: ['spine'],
  lower_back: [
    'lower-back-erectors-left', 'lower-back-ql-left',
    'lower-back-erectors-right', 'lower-back-ql-right',
  ],
  abs: ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right'],
  obliques: ['obliques-left', 'obliques-right'],
  glutes: [
    'gluteus-maximus-left', 'gluteus-medius-left',
    'gluteus-maximus-right', 'gluteus-medius-right',
  ],
  quads: ['quads-left', 'quads-right'],
  hamstrings: [
    'hamstrings-medial-left', 'hamstrings-lateral-left',
    'hamstrings-medial-right', 'hamstrings-lateral-right',
  ],
  adductors: ['adductors-left', 'adductors-right', 'hip-flexor-left', 'hip-flexor-right'],
  calves: [
    'calves-gastroc-medial-left', 'calves-gastroc-lateral-left', 'calves-soleus-left',
    'calves-gastroc-medial-right', 'calves-gastroc-lateral-right', 'calves-soleus-right',
    'tibialis-anterior-left', 'tibialis-anterior-right',
  ],
  _structure: [
    'head', 'face', 'head-back',
    'hand-left', 'hand-right', 'hand-back-left', 'hand-back-right',
    'elbow-left', 'elbow-right',
    'knee-left', 'knee-right', 'knee-back-left', 'knee-back-right',
    'foot-left', 'foot-right', 'foot-back-left', 'foot-back-right',
  ],
};

/** region id → our muscle id. Built once; the reverse map is what rendering needs. */
const REGION_TO_MUSCLE: Record<string, MuscleId | '_structure'> = Object.fromEntries(
  Object.entries(REGION_MAP).flatMap(([muscle, regions]) =>
    regions.map((r) => [r, muscle as MuscleId | '_structure']),
  ),
);

/**
 * The vendor ships both figures in one small coordinate space, side by side —
 * front at x 0–32, back at x 36–69, both y 0–93 — and documents no viewBox.
 * Measured with `getBBox()` over every rendered path; re-measure the same way
 * if the package ever changes its anatomy (the self-check below will not catch
 * a silent re-layout, only added or renamed regions).
 */
const VIEW_BOX: Record<'front' | 'back', string> = {
  front: '-1 -1 34 95',
  back: '35 -1 35 95',
};

/**
 * Strokes are in those same units, so a "1px-looking" value here is ~3% of the
 * figure's width. These are tuned against the measured box above.
 */
const STROKE = { normal: 0.12, highlight: 0.5 };

export interface BodygraphProps {
  view?: 'front' | 'back';
  /** Fill per muscle. Anything omitted falls back to the inactive body colour. */
  colors?: Partial<Record<MuscleId, string>>;
  onMuscleClick?: (id: MuscleId) => void;
  /** Drawn with a highlight ring — used for "this exercise trains…". */
  highlight?: MuscleId[];
  className?: string;
  /** Skip the pointer affordances for decorative use. */
  interactive?: boolean;
  title?: string;
}

export function Bodygraph({
  view = 'front',
  colors,
  onMuscleClick,
  highlight,
  className,
  interactive = true,
  title,
}: BodygraphProps) {
  const clickable = interactive && !!onMuscleClick;
  const hi = useMemo(() => new Set(highlight ?? []), [highlight]);

  // Group the vendor's regions under our muscle ids so each muscle is one <g>:
  // one fill, one click target, one hover state, regardless of how many
  // anatomical slices it is drawn from.
  const groups = useMemo(() => {
    const defs: MuscleDef[] = view === 'front' ? FRONT_MUSCLES : BACK_MUSCLES;
    const byMuscle = new Map<MuscleId | '_structure' | '_unmapped', MuscleDef[]>();
    for (const d of defs) {
      const key = REGION_TO_MUSCLE[d.id] ?? '_unmapped';
      const list = byMuscle.get(key);
      if (list) list.push(d);
      else byMuscle.set(key, [d]);
    }
    // Array, not the Map itself: the tsconfig target here predates
    // downlevelIteration, so spreading a Map's entries doesn't compile.
    return Array.from(byMuscle.entries());
  }, [view]);

  return (
    <svg
      viewBox={VIEW_BOX[view]}
      // Height-driven: a tall viewBox scaled to a wide container's width grows
      // to several times that height and paints over the page.
      className={cn('h-full w-auto max-w-full select-none', className)}
      preserveAspectRatio="xMidYMid meet"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {groups.map(([key, defs]) => {
        const structural = key === '_structure' || key === '_unmapped';
        const muscle = structural ? null : (key as MuscleId);
        const fill = structural
          ? 'hsl(var(--muted-foreground) / 0.18)'
          : (muscle && colors?.[muscle]) || 'hsl(var(--muted-foreground) / 0.32)';
        const isHi = !!muscle && hi.has(muscle);
        const canClick = clickable && !!muscle;

        return (
          <g
            key={String(key)}
            data-muscle={muscle ?? undefined}
            fill={fill}
            stroke={isHi ? 'hsl(var(--primary))' : 'hsl(var(--background) / 0.5)'}
            strokeWidth={isHi ? STROKE.highlight : STROKE.normal}
            className={cn(
              'transition-[fill,stroke] duration-300',
              canClick && 'cursor-pointer hover:brightness-125',
            )}
            onClick={canClick ? () => onMuscleClick!(muscle!) : undefined}
            role={canClick ? 'button' : undefined}
            tabIndex={canClick ? 0 : undefined}
            aria-label={canClick ? MUSCLE_BY_ID[muscle!]?.label : undefined}
            onKeyDown={
              canClick
                ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onMuscleClick!(muscle!);
                    }
                  }
                : undefined
            }
          >
            {defs.map((d) => (
              <path key={d.id} d={d.path} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Front and back side by side — the shape used on Recovery Zone and profile. */
export function BodygraphPair({ className, ...props }: Omit<BodygraphProps, 'view'>) {
  return (
    <div className={cn('flex h-full items-stretch justify-center gap-4', className)}>
      <Bodygraph {...props} view="front" title="Front view" />
      <Bodygraph {...props} view="back" title="Back view" />
    </div>
  );
}

// ── self-check ────────────────────────────────────────────────────
// Every vendor region must be accounted for, or muscles silently vanish from
// the figure when the package updates its anatomy.
export const __selfcheck = () => {
  const all = [...FRONT_MUSCLES, ...BACK_MUSCLES].map((d) => d.id);
  const unmapped = all.filter((id) => !REGION_TO_MUSCLE[id]);
  if (unmapped.length) throw new Error(`unmapped regions: ${unmapped.join(', ')}`);

  const known = new Set(all);
  const dangling = Object.values(REGION_MAP)
    .flat()
    .filter((r) => !known.has(r));
  if (dangling.length) throw new Error(`mapped regions that no longer exist: ${dangling.join(', ')}`);

  // Each of our trainable muscles must be drawable somewhere.
  for (const m of Object.keys(REGION_MAP)) {
    if (m === '_structure') continue;
    if (!REGION_MAP[m as MuscleId].length) throw new Error(`${m} maps to no region`);
  }
  return `${all.length} regions → ${Object.keys(REGION_MAP).length - 1} muscles ok`;
};
