'use client';
/**
 * Bodygraph — the anatomical figure that every rank, fatigue and volume view
 * paints onto. Hand-authored SVG; nothing here is traced or imported.
 *
 * Construction:
 *  - Muscles are soft primitives (ellipses, rounded rects, a couple of paths)
 *    positioned in a 200×460 viewBox with the midline at x = 100.
 *  - Shapes are authored once for the viewer's left half and mirrored, so the
 *    figure is symmetrical by construction and there is half as much to get
 *    wrong. Midline shapes (abs, lower back, neck) opt out via `center`.
 *  - The silhouette is the same shape set drawn underneath with a fat neutral
 *    stroke, which unions them into one body outline. That is why the figure
 *    reads as a body without a single giant outline path to maintain.
 *
 * ponytail: stylised anatomy, not medical accuracy — the job is "which muscle
 * is that, at a glance, at 120 px wide". Nudge the numbers, don't add a rig.
 */
import { Fragment, useId } from 'react';
import { cn } from '@/lib/utils';
import { MUSCLES, type MuscleId } from '@/lib/muscles';

type Shape =
  | { k: 'e'; cx: number; cy: number; rx: number; ry: number; rot?: number; center?: boolean }
  | { k: 'r'; x: number; y: number; w: number; h: number; r: number; center?: boolean }
  | { k: 'p'; d: string; center?: boolean };

const e = (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape => ({ k: 'e', cx, cy, rx, ry, rot });
const ec = (cx: number, cy: number, rx: number, ry: number, rot = 0): Shape => ({ k: 'e', cx, cy, rx, ry, rot, center: true });
const rc = (x: number, y: number, w: number, h: number, r: number): Shape => ({ k: 'r', x, y, w, h, r, center: true });

/** Non-muscle mass (head, hands, feet, joints) that only the silhouette needs. */
const FILLER: Shape[] = [
  ec(100, 34, 19, 22),        // head
  ec(100, 58, 12, 12),        // neck column
  ec(100, 96, 34, 30),        // upper torso fill
  ec(100, 150, 28, 34),       // mid torso fill
  ec(100, 214, 30, 26),       // hips
  e(83, 240, 20, 20),         // upper thigh joint
  e(84, 336, 13, 14),         // knee
  e(38, 208, 9, 11),          // hand
  e(85, 424, 12, 10),         // foot
];

const FRONT: Partial<Record<MuscleId, Shape[]>> = {
  neck: [e(92, 56, 5.5, 10, -6)],
  traps: [e(82, 68, 16, 8, -20)],
  front_delt: [e(64, 84, 13.5, 14)],
  side_delt: [e(54, 98, 11, 15, 10)],
  upper_chest: [e(84, 90, 17, 9, -8)],
  mid_chest: [e(82, 107, 19, 11, -3)],
  lower_chest: [e(83, 123, 16.5, 8, 3)],
  biceps: [e(51, 128, 10, 21, 5)],
  forearms: [e(43, 176, 9, 27, 6)],
  abs: [rc(85, 130, 30, 72, 13)],
  obliques: [e(76, 162, 8, 29, 3)],
  quads: [e(82, 285, 17.5, 48, 2)],
  adductors: [e(96, 272, 8, 36, -3)],
  calves: [e(84, 375, 11, 33, 1)],
};

const BACK: Partial<Record<MuscleId, Shape[]>> = {
  neck: [e(92, 56, 5.5, 10, -6)],
  traps: [{ k: 'p', d: 'M99,50 C88,54 74,66 66,80 C74,92 86,104 99,110 Z' }],
  rear_delt: [e(63, 88, 13.5, 13)],
  side_delt: [e(54, 98, 11, 15, 10)],
  upper_back: [e(85, 118, 15, 14, -6)],
  lats: [{ k: 'p', d: 'M99,112 C86,116 74,126 70,142 C68,158 76,174 99,182 Z' }],
  lower_back: [rc(86, 170, 28, 44, 12)],
  triceps: [e(51, 128, 10, 21, 5)],
  forearms: [e(43, 176, 9, 27, 6)],
  glutes: [e(82, 228, 20, 22)],
  hamstrings: [e(82, 292, 17, 43, 1)],
  calves: [e(84, 372, 12, 34, 1)],
};

function renderShape(s: Shape, key: string, extra: Record<string, unknown> = {}) {
  if (s.k === 'e')
    return (
      <ellipse
        key={key}
        cx={s.cx}
        cy={s.cy}
        rx={s.rx}
        ry={s.ry}
        transform={s.rot ? `rotate(${s.rot} ${s.cx} ${s.cy})` : undefined}
        {...extra}
      />
    );
  if (s.k === 'r')
    return <rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...extra} />;
  return <path key={key} d={s.d} {...extra} />;
}

/** Draw a shape, mirrored across the midline unless it is a centre shape. */
function Mirrored({ shape, id, extra }: { shape: Shape; id: string; extra?: Record<string, unknown> }) {
  const left = renderShape(shape, `${id}-l`, extra);
  if (shape.center) return left;
  return (
    <Fragment>
      {left}
      <g transform="translate(200,0) scale(-1,1)">{renderShape(shape, `${id}-r`, extra)}</g>
    </Fragment>
  );
}

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
  const uid = useId();
  const set = view === 'front' ? FRONT : BACK;
  const clickable = interactive && !!onMuscleClick;
  const hi = new Set(highlight ?? []);

  return (
    <svg
      viewBox="0 0 200 460"
      className={cn('h-full w-full select-none overflow-visible', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {/* Silhouette: every shape, fat neutral stroke + fill, unioned by overlap. */}
      <g
        className="text-muted-foreground/25"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={11}
        strokeLinejoin="round"
      >
        {FILLER.map((s, i) => (
          <Mirrored key={`f${i}`} shape={s} id={`${uid}-f${i}`} />
        ))}
        {Object.entries(set).flatMap(([m, shapes]) =>
          (shapes as Shape[]).map((s, i) => <Mirrored key={`${m}${i}`} shape={s} id={`${uid}-s-${m}${i}`} />),
        )}
      </g>

      {/* Muscles */}
      {MUSCLES.map((m) => {
        const shapes = set[m.id];
        if (!shapes) return null;
        const fill = colors?.[m.id] ?? 'hsl(var(--muted-foreground) / 0.32)';
        return (
          <g
            key={m.id}
            data-muscle={m.id}
            fill={fill}
            stroke={hi.has(m.id) ? 'hsl(var(--primary))' : 'hsl(var(--background) / 0.55)'}
            strokeWidth={hi.has(m.id) ? 3 : 1.2}
            className={cn(
              'transition-[fill,stroke] duration-300',
              clickable && 'cursor-pointer hover:brightness-125',
            )}
            onClick={clickable ? () => onMuscleClick!(m.id) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={clickable ? m.label : undefined}
            onKeyDown={
              clickable
                ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onMuscleClick!(m.id);
                    }
                  }
                : undefined
            }
          >
            {shapes.map((s, i) => (
              <Mirrored key={i} shape={s} id={`${uid}-${m.id}${i}`} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Front and back side by side — the shape used on Recovery Zone and profile. */
export function BodygraphPair(props: Omit<BodygraphProps, 'view'>) {
  return (
    <div className="flex items-stretch justify-center gap-2">
      <Bodygraph {...props} view="front" title="Front view" />
      <Bodygraph {...props} view="back" title="Back view" />
    </div>
  );
}
