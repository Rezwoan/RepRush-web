'use client';
/**
 * Volt — the RepRush mascot. Hand-authored SVG, built from the logo's cobalt +
 * volt-gold palette with the lightning bolt as its chest marking.
 *
 * Poses swap only the arms, eyes and mouth over a shared body, so adding one is
 * a few paths rather than a new character.
 */
import { useSvgId } from '@/lib/svg-id';
import { cn } from '@/lib/utils';

export type MascotPose = 'idle' | 'cheer' | 'flex' | 'fire' | 'sleep' | 'sad';

const BODY =
  'M70 24 C102 24 118 45 118 77 C118 110 99 126 70 126 C41 126 22 110 22 77 C22 45 38 24 70 24 Z';
const TUFT = 'M64 26 L78 2 L72 22 L88 8 L74 30 Z';
const CHEST_BOLT = 'M76 62 L60 88 h10 l-5 20 L82 80 H72 Z';

const ARMS: Record<MascotPose, string[]> = {
  idle: ['M26 84 C16 88 12 98 16 106', 'M114 84 C124 88 128 98 124 106'],
  cheer: ['M28 70 C14 58 10 42 14 30', 'M112 70 C126 58 130 42 126 30'],
  flex: ['M28 78 C14 76 8 62 16 50 C22 42 32 44 34 54', 'M112 78 C126 76 132 62 124 50 C118 42 108 44 106 54'],
  fire: ['M28 76 C14 72 8 58 16 46', 'M112 76 C126 72 132 58 124 46'],
  sleep: ['M26 88 C16 94 14 104 18 110', 'M114 88 C124 94 126 104 122 110'],
  sad: ['M26 92 C18 100 16 110 20 116', 'M114 92 C122 100 124 110 120 116'],
};

/** Hot palette for the streak pose; everything else uses the brand blues. */
const SKIN = {
  fire: { light: '#FFB03A', dark: '#F26B21', band: '#FFE08A' },
  cool: { light: '#4FA8F7', dark: '#0F62B8', band: '#FABA0C' },
};

export interface MascotProps {
  pose?: MascotPose;
  size?: number;
  className?: string;
  /** Gentle bob. Off inside dense lists. */
  float?: boolean;
}

export function Mascot({ pose = 'idle', size = 120, className, float = false }: MascotProps) {
  const uid = useSvgId();
  const hot = pose === 'fire';
  const c = hot ? SKIN.fire : SKIN.cool;
  const asleep = pose === 'sleep';
  const sad = pose === 'sad';

  return (
    <svg
      width={size}
      height={size * (160 / 140)}
      viewBox="0 0 140 160"
      className={cn('shrink-0 overflow-visible', float && 'animate-float-soft', className)}
      role="img"
      aria-label={`Volt the RepRush mascot, ${pose}`}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
        <radialGradient id={`${uid}-flame`} cx="0.5" cy="0.65" r="0.6">
          <stop offset="0%" stopColor="#FFD75E" />
          <stop offset="70%" stopColor="#FF8A1E" />
          <stop offset="100%" stopColor="#FF8A1E" stopOpacity={0} />
        </radialGradient>
      </defs>

      {hot && (
        <path
          d="M70 -6 C92 22 108 40 108 70 C108 102 92 122 70 122 C48 122 32 102 32 70 C32 40 48 22 70 -6 Z"
          fill={`url(#${uid}-flame)`}
          opacity={0.9}
        />
      )}

      {/* ground shadow */}
      <ellipse cx={70} cy={150} rx={34} ry={7} fill="#000" opacity={0.22} />

      {/* legs */}
      <g fill={c.dark}>
        <rect x={54} y={118} width={13} height={28} rx={6.5} />
        <rect x={73} y={118} width={13} height={28} rx={6.5} />
        <ellipse cx={60.5} cy={146} rx={9} ry={5} fill="#fff" />
        <ellipse cx={79.5} cy={146} rx={9} ry={5} fill="#fff" />
      </g>

      {/* arms */}
      <g
        stroke={c.dark}
        strokeWidth={11}
        strokeLinecap="round"
        fill="none"
      >
        {ARMS[pose].map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* ears */}
      <ellipse cx={22} cy={70} rx={11} ry={15} fill={c.dark} />
      <ellipse cx={118} cy={70} rx={11} ry={15} fill={c.dark} />

      {/* body */}
      <path d={TUFT} fill={c.dark} />
      <path d={BODY} fill={`url(#${uid}-body)`} />
      <path d={CHEST_BOLT} fill="#fff" opacity={0.16} />

      {/* headband */}
      <path
        d="M27 54 C40 44 100 44 113 54 L110 64 C98 55 42 55 30 64 Z"
        fill={c.band}
      />

      {/* eyes */}
      {asleep || sad ? (
        <g stroke="#0B1220" strokeWidth={4} strokeLinecap="round" fill="none">
          {asleep ? (
            <>
              <path d="M46 82 q10 8 20 0" />
              <path d="M74 82 q10 8 20 0" />
            </>
          ) : (
            <>
              <path d="M46 86 q10 -8 20 0" />
              <path d="M74 86 q10 -8 20 0" />
            </>
          )}
        </g>
      ) : (
        <g>
          <ellipse cx={56} cy={84} rx={10} ry={12} fill="#fff" />
          <ellipse cx={84} cy={84} rx={10} ry={12} fill="#fff" />
          <circle cx={57} cy={86} r={5} fill="#0B1220" />
          <circle cx={85} cy={86} r={5} fill="#0B1220" />
          <circle cx={59} cy={83} r={1.8} fill="#fff" />
          <circle cx={87} cy={83} r={1.8} fill="#fff" />
        </g>
      )}

      {/* mouth */}
      <path
        d={
          sad
            ? 'M60 106 q10 -7 20 0'
            : pose === 'cheer' || pose === 'flex'
              ? 'M58 102 q12 14 24 0 q-12 6 -24 0'
              : 'M62 104 q8 6 16 0'
        }
        fill={pose === 'cheer' || pose === 'flex' ? '#0B1220' : 'none'}
        stroke="#0B1220"
        strokeWidth={3.5}
        strokeLinecap="round"
      />

      {asleep && (
        <g fill="#fff" opacity={0.8} fontWeight={800} fontSize={13}>
          <text x={104} y={40}>z</text>
          <text x={114} y={26} fontSize={10}>z</text>
        </g>
      )}
      {(pose === 'cheer' || pose === 'flex') && (
        <g fill="#FABA0C">
          <path d="M14 22 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          <path d="M124 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" />
        </g>
      )}
    </svg>
  );
}

/** Mascot + speech bubble — the onboarding and coaching pattern. */
export function MascotSays({
  children,
  pose = 'idle',
  size = 84,
  className,
}: {
  children: React.ReactNode;
  pose?: MascotPose;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Mascot pose={pose} size={size} />
      <div className="relative mt-2 flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-[15px] font-medium leading-snug">
        <span
          aria-hidden
          className="absolute -left-1.5 top-5 h-3 w-3 rotate-45 border-b border-l border-border bg-card"
        />
        {children}
      </div>
    </div>
  );
}
