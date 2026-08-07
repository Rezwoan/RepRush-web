/**
 * RepRush theme engine.
 *
 * A theme is a small seed (a few hues + a mode), not a hand-written block of CSS.
 * `themeVars()` derives the full variable set from that seed, so adding a theme is
 * one line here instead of ~25 lines of CSS that drift out of sync with the others.
 *
 * The variables produced are exactly the ones `globals.css` / `tailwind.config.ts`
 * already consume (HSL triplets, no `hsl()` wrapper).
 *
 * ponytail: derived palettes, not designed ones. If a specific theme ever needs a
 * hand-tuned value, add an `overrides` field rather than forking the generator.
 */

export type ThemeMode = 'dark' | 'light';
export type ThemeGroup = 'default' | 'special' | 'seasonal' | 'prismatic' | 'color';

export interface Theme {
  id: string;
  name: string;
  group: ThemeGroup;
  mode: ThemeMode;
  /** Cost in the earned soft currency. 0 = always available. */
  price: number;
  /** Neutral surface hue + how much colour bleeds into the greys. */
  base: number;
  baseSat: number;
  /** Interactive colour. */
  primary: number;
  primarySat?: number;
  /** Secondary highlight (streaks, celebration). */
  accent: number;
  accentSat?: number;
  /** Optional page-level gradient wash, for the "prismatic" set. */
  wash?: [string, string];
  /** Escape hatch for values the generator can't derive. */
  overrides?: Partial<Record<string, string>>;
}

const hsl = (h: number, s: number, l: number) => `${h} ${s}% ${l}%`;

// ── contrast ────────────────────────────────────────────────────────
/**
 * The brand cobalt at 50% lightness carries white text at **3.9:1**, and AA
 * wants 4.5. Darkening `--primary` to fix it breaks the other direction —
 * `text-primary` on the page background falls to 4.2 — so there is no single
 * lightness that satisfies both, and the two uses need two tokens.
 *
 * `--primary-fill` is the one white sits on. Its lightness is *found*, not
 * fixed: green reads far brighter than blue at the same L, so a constant would
 * be too dark for some of the 34 themes and still failing on others.
 */
function rgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const luminance = (h: number, s: number, l: number) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** Contrast of white against this colour. 21 is black, 1 is white on white. */
export const contrastWithWhite = (h: number, s: number, l: number) =>
  1.05 / (luminance(h, s, l) + 0.05);

/** The lightest shade of this hue that still carries white text at AA. */
export function fillLightness(h: number, s: number, start: number, target = 4.5): number {
  for (let l = start; l >= 20; l -= 1) if (contrastWithWhite(h, s, l) >= target) return l;
  return 20;
}

/** Derive the full CSS-variable set for a theme. */
export function themeVars(t: Theme): Record<string, string> {
  const dark = t.mode === 'dark';
  const b = t.base;
  const bs = t.baseSat;
  const ps = t.primarySat ?? 92;
  const as = t.accentSat ?? 96;

  // Surfaces step away from the page background in the same direction as the mode.
  const L = dark
    ? { bg: 7, card: 10, elevated: 14, popover: 9, border: 18, input: 15, fg: 96, muted: 62 }
    : { bg: 98, card: 100, elevated: 96, popover: 100, border: 88, input: 96, fg: 14, muted: 40 };

  return {
    '--background': hsl(b, bs, L.bg),
    '--foreground': hsl(b, Math.min(bs + 8, 40), L.fg),

    '--card': hsl(b, bs - 2 < 0 ? 0 : bs - 2, L.card),
    '--card-foreground': hsl(b, Math.min(bs + 8, 40), L.fg),
    '--elevated': hsl(b, bs - 4 < 0 ? 0 : bs - 4, L.elevated),

    '--popover': hsl(b, bs, L.popover),
    '--popover-foreground': hsl(b, Math.min(bs + 8, 40), L.fg),

    '--primary': hsl(t.primary, ps, dark ? 50 : 45),
    '--primary-fill': hsl(t.primary, ps, fillLightness(t.primary, ps, dark ? 50 : 45)),
    '--primary-foreground': hsl(0, 0, 100),

    '--secondary': hsl(b, bs - 4 < 0 ? 0 : bs - 4, dark ? 16 : 94),
    '--secondary-foreground': hsl(b, Math.min(bs + 4, 30), dark ? 92 : 18),

    '--accent': hsl(t.accent, as, dark ? 51 : 46),
    '--accent-foreground': hsl(t.accent, 85, dark ? 9 : 98),

    '--muted': hsl(b, bs - 4 < 0 ? 0 : bs - 4, L.elevated),
    '--muted-foreground': hsl(b, Math.max(bs - 8, 8), L.muted),

    '--success': hsl(152, 60, dark ? 45 : 38),
    '--success-foreground': hsl(0, 0, 100),
    '--warning': hsl(38, 94, dark ? 52 : 45),
    '--warning-foreground': hsl(30, 85, dark ? 9 : 98),
    '--destructive': hsl(0, 76, dark ? 60 : 52),
    '--destructive-foreground': hsl(0, 0, 100),

    '--border': hsl(b, Math.max(bs - 6, 6), L.border),
    '--input': hsl(b, Math.max(bs - 4, 6), L.input),
    '--ring': hsl(t.primary, ps, 56),

    '--wash-a': t.wash?.[0] ?? `hsl(${t.primary} ${ps}% 50% / 0.10)`,
    '--wash-b': t.wash?.[1] ?? `hsl(${t.accent} ${as}% 51% / 0.05)`,

    ...(t.overrides ?? {}),
  };
}

const T = (
  id: string,
  name: string,
  group: ThemeGroup,
  mode: ThemeMode,
  price: number,
  base: number,
  baseSat: number,
  primary: number,
  accent: number,
  extra: Partial<Theme> = {},
): Theme => ({ id, name, group, mode, price, base, baseSat, primary, accent, ...extra });

/**
 * The catalog. `dark` is the product's identity — logo cobalt + volt gold on
 * blue-tinted slate — and is what every screen is designed against.
 */
export const THEMES: Theme[] = [
  // ── Default (free) ──────────────────────────────────────────────
  T('dark', 'Dark', 'default', 'dark', 0, 216, 33, 210, 44),
  T('light', 'Light', 'default', 'light', 0, 216, 24, 210, 40),

  // ── Special ─────────────────────────────────────────────────────
  T('retro', 'Retro', 'special', 'light', 200, 44, 30, 24, 160),
  T('twilight', 'Twilight Space', 'special', 'dark', 200, 258, 38, 268, 190),
  T('gymbros', 'Classic GymBros', 'special', 'dark', 200, 0, 0, 0, 40, { primarySat: 0, accentSat: 90 }),
  T('darkest', 'Darkest', 'special', 'dark', 200, 240, 8, 210, 44, {
    overrides: { '--background': '0 0% 0%', '--card': '0 0% 4%' },
  }),

  // ── Seasonal ────────────────────────────────────────────────────
  T('autumn', 'Autumn Vibes', 'seasonal', 'dark', 150, 18, 30, 24, 38),
  T('winter', 'Winter Whisper', 'seasonal', 'light', 150, 210, 22, 200, 190),
  T('spring', 'Spring Blossom', 'seasonal', 'light', 150, 120, 20, 140, 330),
  T('summer', 'Summer Breeze', 'seasonal', 'light', 150, 48, 26, 190, 40),

  // ── Prismatic (gradient wash) ───────────────────────────────────
  T('dusk', 'Dusk Horizon', 'prismatic', 'dark', 500, 28, 22, 32, 268, {
    wash: ['hsl(28 80% 50% / 0.16)', 'hsl(268 70% 50% / 0.12)'],
  }),
  T('neon', 'Neon Rider', 'prismatic', 'dark', 500, 288, 32, 310, 190, {
    wash: ['hsl(310 90% 55% / 0.18)', 'hsl(190 90% 55% / 0.12)'],
  }),
  T('steel', 'Steel Emulsion', 'prismatic', 'dark', 500, 214, 14, 208, 200, {
    wash: ['hsl(208 30% 60% / 0.14)', 'hsl(214 20% 40% / 0.10)'],
  }),
  T('crimson', 'Crimson Scale', 'prismatic', 'dark', 500, 356, 28, 352, 20, {
    wash: ['hsl(352 85% 50% / 0.18)', 'hsl(20 90% 50% / 0.10)'],
  }),
  T('azure', 'Azure Scale', 'prismatic', 'dark', 500, 224, 34, 214, 190, {
    wash: ['hsl(214 92% 52% / 0.18)', 'hsl(190 90% 50% / 0.10)'],
  }),
  T('cotton', 'Cotton Candy', 'prismatic', 'light', 500, 320, 26, 330, 200, {
    wash: ['hsl(330 90% 70% / 0.20)', 'hsl(200 90% 70% / 0.16)'],
  }),
  T('jade', 'Jade Apple', 'prismatic', 'light', 500, 145, 24, 152, 90, {
    wash: ['hsl(152 60% 55% / 0.20)', 'hsl(90 70% 55% / 0.14)'],
  }),
  T('lemonberry', 'Lemon Berry', 'prismatic', 'light', 500, 40, 30, 36, 330, {
    wash: ['hsl(45 95% 60% / 0.22)', 'hsl(330 85% 60% / 0.14)'],
  }),

  // ── Colour pairs ────────────────────────────────────────────────
  ...([
    ['cherry', 'Cherry', 352, 8],
    ['lime', 'Lime', 96, 140],
    ['blueberry', 'Blueberry', 224, 200],
    ['aqua', 'Aqua', 184, 160],
    ['amber', 'Amber', 38, 20],
    ['rose', 'Rose', 336, 300],
    ['grape', 'Grape', 276, 300],
  ] as const).flatMap(([id, name, hue, accent]) => [
    T(`${id}-dark`, `${name} Dark`, 'color', 'dark', 125, hue, 26, hue, accent),
    T(`${id}-light`, `${name} Light`, 'color', 'light', 125, hue, 20, hue, accent),
  ]),
  T('mono-dark', 'Monochrome Dark', 'color', 'dark', 125, 220, 6, 220, 220, { primarySat: 10, accentSat: 12 }),
  T('mono-light', 'Monochrome Light', 'color', 'light', 125, 220, 6, 220, 220, { primarySat: 10, accentSat: 12 }),
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'dark';

export const getTheme = (id: string | null | undefined): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];

export const THEME_GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: 'default', label: 'Default Themes' },
  { id: 'special', label: 'Special Themes' },
  { id: 'seasonal', label: 'Seasonal Themes' },
  { id: 'prismatic', label: 'Prismatic Themes' },
  { id: 'color', label: 'Color Themes' },
];

/** Apply a theme to a DOM element (defaults to <html>). */
export function applyTheme(id: string, el?: HTMLElement) {
  const theme = getTheme(id);
  const root = el ?? document.documentElement;
  const vars = themeVars(theme);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
}

// ── self-check ────────────────────────────────────────────────────
// Every theme must produce a complete, well-formed variable set, and ids
// must be unique — a duplicate id silently shadows a theme in the picker.
export const __selfcheck = () => {
  const ids = new Set<string>();
  for (const t of THEMES) {
    if (ids.has(t.id)) throw new Error(`duplicate theme id: ${t.id}`);
    ids.add(t.id);
    const v = themeVars(t);
    for (const key of ['--background', '--foreground', '--primary', '--border', '--card']) {
      const val = v[key];
      if (!val) throw new Error(`${t.id}: missing ${key}`);
      // HSL triplet ("H S% L%") or a raw colour from an override.
      if (!/^-?[\d.]+ [\d.]+% [\d.]+%$/.test(val) && !val.startsWith('hsl'))
        throw new Error(`${t.id}: malformed ${key} = "${val}"`);
    }
    // The whole point of `--primary-fill`. Checked for every theme, because a
    // hue that fails AA in theme 27 is otherwise invisible until someone with
    // low vision opens theme 27.
    const [fh, fs, fl] = (v['--primary-fill'] ?? '').match(/[\d.]+/g)!.map(Number);
    const ratio = contrastWithWhite(fh, fs, fl);
    if (ratio < 4.5) throw new Error(`${t.id}: white on --primary-fill is ${ratio.toFixed(2)}:1`);
    // …and it must not have gone so dark it stopped looking like the brand.
    if (fl < 30) throw new Error(`${t.id}: --primary-fill went to ${fl}% lightness`);
  }
  if (!THEMES.some((t) => t.id === DEFAULT_THEME)) throw new Error('DEFAULT_THEME not in catalog');
  if (contrastWithWhite(0, 0, 100) > 1.01) throw new Error('white on white should be 1:1');
  if (Math.abs(contrastWithWhite(0, 0, 0) - 21) > 0.1) throw new Error('white on black should be 21:1');
  return `${THEMES.length} themes ok`;
};
