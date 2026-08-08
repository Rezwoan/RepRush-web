/**
 * The cosmetic catalog (SPEC §9 → Store / Inventory / Edit Profile).
 *
 * Everything about a cosmetic lives here, including how it looks: the frontend
 * renders what this says rather than keeping a parallel table of gradients, so
 * adding one is a single line in a single file. The alternative — ids here,
 * colours over there — is two files that have to agree, and eventually don't.
 *
 * Prices are in the earned currency (SPEC §10). Nothing is bought with money:
 * see MEMORY → Decisions, 2026-08-06.
 */
export type CosmeticKind = 'title' | 'border' | 'banner' | 'theme';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  label: string;
  price: number;
  /** CSS colour or gradient the frontend paints it with. */
  paint: string;
  /** Free and owned by everyone from the start. */
  free?: boolean;
}

export const COSMETICS: Cosmetic[] = [
  // ── titles ──────────────────────────────────────────────────────
  { id: 'title.rookie', kind: 'title', label: 'Rookie', price: 0, paint: 'hsl(var(--muted-foreground))', free: true },
  { id: 'title.grinder', kind: 'title', label: 'The Grinder', price: 300, paint: 'linear-gradient(90deg,#7dd3fc,#0284c7)' },
  { id: 'title.ironheart', kind: 'title', label: 'Ironheart', price: 500, paint: 'linear-gradient(90deg,#fca5a5,#dc2626)' },
  { id: 'title.earlybird', kind: 'title', label: 'Early Bird', price: 500, paint: 'linear-gradient(90deg,#fde68a,#f59e0b)' },
  { id: 'title.unbroken', kind: 'title', label: 'Unbroken', price: 900, paint: 'linear-gradient(90deg,#c4b5fd,#7c3aed)' },
  { id: 'title.apex', kind: 'title', label: 'Apex', price: 1500, paint: 'linear-gradient(90deg,#fbbf24,#f97316,#dc2626)' },

  // ── avatar borders ──────────────────────────────────────────────
  { id: 'border.plain', kind: 'border', label: 'Plain', price: 0, paint: 'hsl(var(--border))', free: true },
  { id: 'border.volt', kind: 'border', label: 'Volt', price: 250, paint: 'linear-gradient(135deg,#faba0c,#e0a009)' },
  { id: 'border.cobalt', kind: 'border', label: 'Cobalt', price: 250, paint: 'linear-gradient(135deg,#0462b2,#38bdf8)' },
  { id: 'border.ember', kind: 'border', label: 'Ember', price: 600, paint: 'linear-gradient(135deg,#f97316,#dc2626)' },
  { id: 'border.aurora', kind: 'border', label: 'Aurora', price: 1200, paint: 'conic-gradient(from 0deg,#38bdf8,#a78bfa,#f472b6,#38bdf8)' },

  // ── banners ─────────────────────────────────────────────────────
  { id: 'banner.slate', kind: 'banner', label: 'Slate', price: 0, paint: 'linear-gradient(135deg,#1e293b,#334155)', free: true },
  { id: 'banner.brand', kind: 'banner', label: 'RepRush', price: 200, paint: 'linear-gradient(135deg,#0462b2,#0284c7 60%,#faba0c)' },
  { id: 'banner.dusk', kind: 'banner', label: 'Dusk', price: 450, paint: 'linear-gradient(135deg,#7c3aed,#db2777)' },
  { id: 'banner.forge', kind: 'banner', label: 'Forge', price: 800, paint: 'linear-gradient(135deg,#111827,#dc2626 70%,#f59e0b)' },
  { id: 'banner.summit', kind: 'banner', label: 'Summit', price: 1400, paint: 'linear-gradient(135deg,#0ea5e9,#22d3ee 50%,#f0fdfa)' },

  // ── themes ──────────────────────────────────────────────────────
  // Themes were free from P1 and `Theme.price` sat unused in
  // `frontend/src/lib/themes.ts` while SPEC §9 showed them priced. They are
  // ordinary cosmetics now. Ownership is checked here, but which theme is
  // *applied* stays a client preference: the pre-paint boot script has to pick
  // one before any request could answer, and it has to work offline.
  //
  // ponytail: id and price are duplicated from `lib/themes.ts`. Two lists that
  // have to agree — the frontend asserts every THEME id has a store entry when
  // the Themes screen loads, which is the cheapest place to catch a drift.
  // Fold into the build script alongside the muscle taxonomy if it ever bites.
  { id: 'theme.dark', kind: 'theme', label: 'Dark', price: 0, paint: 'linear-gradient(135deg,hsl(210 85% 52%),hsl(44 90% 55%))', free: true },
  { id: 'theme.light', kind: 'theme', label: 'Light', price: 0, paint: 'linear-gradient(135deg,hsl(210 85% 52%),hsl(40 90% 55%))', free: true },
  { id: 'theme.mono-dark', kind: 'theme', label: 'Monochrome Dark', price: 125, paint: 'linear-gradient(135deg,hsl(220 85% 52%),hsl(220 60% 70%))' },
  { id: 'theme.mono-light', kind: 'theme', label: 'Monochrome Light', price: 125, paint: 'linear-gradient(135deg,hsl(220 40% 70%),hsl(220 20% 90%))' },
  { id: 'theme.autumn', kind: 'theme', label: 'Autumn Vibes', price: 150, paint: 'linear-gradient(135deg,hsl(24 85% 52%),hsl(38 90% 55%))' },
  { id: 'theme.winter', kind: 'theme', label: 'Winter Whisper', price: 150, paint: 'linear-gradient(135deg,hsl(200 85% 52%),hsl(190 90% 55%))' },
  { id: 'theme.spring', kind: 'theme', label: 'Spring Blossom', price: 150, paint: 'linear-gradient(135deg,hsl(140 85% 52%),hsl(330 90% 55%))' },
  { id: 'theme.summer', kind: 'theme', label: 'Summer Breeze', price: 150, paint: 'linear-gradient(135deg,hsl(190 85% 52%),hsl(40 90% 55%))' },
  { id: 'theme.retro', kind: 'theme', label: 'Retro', price: 200, paint: 'linear-gradient(135deg,hsl(24 85% 52%),hsl(160 90% 55%))' },
  { id: 'theme.twilight', kind: 'theme', label: 'Twilight Space', price: 200, paint: 'linear-gradient(135deg,hsl(268 85% 52%),hsl(190 90% 55%))' },
  { id: 'theme.gymbros', kind: 'theme', label: 'Classic GymBros', price: 200, paint: 'linear-gradient(135deg,hsl(0 85% 52%),hsl(40 90% 55%))' },
  { id: 'theme.darkest', kind: 'theme', label: 'Darkest', price: 200, paint: 'linear-gradient(135deg,hsl(210 85% 40%),hsl(44 90% 45%))' },
  { id: 'theme.dusk', kind: 'theme', label: 'Dusk Horizon', price: 500, paint: 'linear-gradient(135deg,hsl(32 85% 52%),hsl(268 90% 55%))' },
  { id: 'theme.neon', kind: 'theme', label: 'Neon Rider', price: 500, paint: 'linear-gradient(135deg,hsl(310 85% 52%),hsl(190 90% 55%))' },
  { id: 'theme.steel', kind: 'theme', label: 'Steel Emulsion', price: 500, paint: 'linear-gradient(135deg,hsl(208 85% 52%),hsl(200 90% 55%))' },
  { id: 'theme.crimson', kind: 'theme', label: 'Crimson Scale', price: 500, paint: 'linear-gradient(135deg,hsl(352 85% 52%),hsl(20 90% 55%))' },
  { id: 'theme.azure', kind: 'theme', label: 'Azure Scale', price: 500, paint: 'linear-gradient(135deg,hsl(214 85% 52%),hsl(190 90% 55%))' },
  { id: 'theme.cotton', kind: 'theme', label: 'Cotton Candy', price: 500, paint: 'linear-gradient(135deg,hsl(330 85% 52%),hsl(200 90% 55%))' },
  { id: 'theme.jade', kind: 'theme', label: 'Jade Apple', price: 500, paint: 'linear-gradient(135deg,hsl(152 85% 52%),hsl(90 90% 55%))' },
  { id: 'theme.lemonberry', kind: 'theme', label: 'Lemon Berry', price: 500, paint: 'linear-gradient(135deg,hsl(36 85% 52%),hsl(330 90% 55%))' },
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_COSMETIC: Record<CosmeticKind, string> = {
  title: 'title.rookie',
  border: 'border.plain',
  banner: 'banner.slate',
  theme: 'theme.dark',
};

/** The kinds that are *equipped* on the profile. Themes are applied client-side. */
export const EQUIPPABLE_KINDS: CosmeticKind[] = ['title', 'border', 'banner'];

/** Free cosmetics are owned by everyone; nothing has to be written to grant them. */
export const freeIds = () => COSMETICS.filter((c) => c.free).map((c) => c.id);

export function __selfcheck() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`cosmetics selfcheck: ${msg}`);
  };
  assert(new Set(COSMETICS.map((c) => c.id)).size === COSMETICS.length, 'ids are unique');
  for (const kind of ['title', 'border', 'banner', 'theme'] as CosmeticKind[]) {
    const free = COSMETICS.filter((c) => c.kind === kind && c.free);
    // Without a free one, a new account has nothing equipped and the header
    // renders a hole until they can afford something. Themes have two — light
    // and dark — because charging someone for the ability to use the app in
    // daylight is not a cosmetic decision.
    assert(free.length >= 1, `${kind} has a free default`);
    assert(
      free.some((c) => c.id === DEFAULT_COSMETIC[kind]),
      `${kind}'s default is one of its free ones`,
    );
    assert(
      free.every((c) => c.price === 0),
      `${kind}'s free cosmetics cost nothing`,
    );
  }
  assert(
    COSMETICS.every((c) => c.free || c.price > 0),
    'every purchasable cosmetic has a price',
  );
  return true;
}
