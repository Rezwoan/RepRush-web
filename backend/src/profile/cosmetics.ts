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
export type CosmeticKind = 'title' | 'border' | 'banner';

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
];

export const COSMETIC_BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_COSMETIC: Record<CosmeticKind, string> = {
  title: 'title.rookie',
  border: 'border.plain',
  banner: 'banner.slate',
};

/** Free cosmetics are owned by everyone; nothing has to be written to grant them. */
export const freeIds = () => COSMETICS.filter((c) => c.free).map((c) => c.id);

export function __selfcheck() {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`cosmetics selfcheck: ${msg}`);
  };
  assert(new Set(COSMETICS.map((c) => c.id)).size === COSMETICS.length, 'ids are unique');
  for (const kind of ['title', 'border', 'banner'] as CosmeticKind[]) {
    const free = COSMETICS.filter((c) => c.kind === kind && c.free);
    // Without a free one, a new account has nothing equipped and the header
    // renders a hole until they can afford something.
    assert(free.length === 1, `${kind} has exactly one free default`);
    assert(free[0].id === DEFAULT_COSMETIC[kind], `${kind}'s default is its free one`);
    assert(free[0].price === 0, `${kind}'s free default costs nothing`);
  }
  assert(
    COSMETICS.every((c) => c.free || c.price > 0),
    'every purchasable cosmetic has a price',
  );
  return true;
}
