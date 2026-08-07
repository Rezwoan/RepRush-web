'use client';
/**
 * Metric ⇄ imperial (P13).
 *
 * The Units setting has existed since P10 and the onboarding funnel has asked
 * for lb/ft since P4 — and both answers went nowhere: every screen printed kg
 * regardless. This is the one place that knows the difference.
 *
 * **The stored number is always metric.** kg and cm are what the database
 * holds, what the rank engine scales against and what the API speaks; imperial
 * exists at the edges, on the way to a screen and on the way back from a
 * keypad. Converting anywhere deeper would mean two units in one column.
 *
 * The conversion arithmetic itself came from `app/welcome/config.ts`, which has
 * used it since P4 and self-checks the round-trips; it lives here now and that
 * file re-exports it, so there is still one copy.
 */
import { useEffect, useState } from 'react';
import { getPrefs } from './feedback';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** 70 in → `5′ 10″`. */
export function feetInches(totalInches: number): string {
  const whole = Math.round(totalInches);
  return `${Math.floor(whole / 12)}′ ${whole % 12}″`;
}

export type UnitSystem = 'metric' | 'imperial';

/**
 * Thousands separators, and no `.0` on a whole number. `en-US` is pinned rather
 * than left to the runtime locale: the app is English, and a browser set to
 * German would otherwise render `6.460 kg` and fail the self-check below for a
 * reason that has nothing to do with weight.
 */
const num = (v: number, dp: number) =>
  (Math.round(v * 10 ** dp) / 10 ** dp).toLocaleString('en-US', { maximumFractionDigits: dp });

export interface Units {
  system: UnitSystem;
  imperial: boolean;
  /** `kg` or `lb` — the label on its own. */
  w: 'kg' | 'lb';
  /** A stored kg as a display *number*, for inputs and pickers. */
  wv: (kg: number, dp?: number) => number;
  /** A display number back to the kg that gets stored. */
  wkg: (display: number) => number;
  /** The number alone, grouped and rounded — for when the unit is its own element. */
  n: (kg: number, dp?: number) => string;
  /** `"84.6 kg"` / `"186.5 lb"`. */
  weight: (kg: number, dp?: number) => string;
  /** `"178 cm"` / `"5′ 10″"`. */
  height: (cm: number) => string;
  /** Session volume and other big totals — never fractional. */
  volume: (kg: number) => string;
  /**
   * The keypad's step. 2.5 kg is the smallest pair of change plates; 5 lb is
   * the imperial equivalent, and ±1 kg would be ±2.2 lb, which is not a plate.
   */
  step: number;
}

function build(system: UnitSystem): Units {
  const imperial = system === 'imperial';
  const wv = (kg: number, dp = 1) => {
    const v = imperial ? kgToLb(kg) : kg;
    return Math.round(v * 10 ** dp) / 10 ** dp;
  };
  return {
    system,
    imperial,
    w: imperial ? 'lb' : 'kg',
    wv,
    // Rounded to 10 g. 135 lb is 61.23496995 kg exactly, and storing that puts
    // a nine-decimal float in a column a metric user might one day read back.
    // Finer than any plate, so nothing is lost.
    wkg: (display: number) =>
      imperial ? Math.round(lbToKg(display) * 100) / 100 : display,
    n: (kg: number, dp = 0) => num(imperial ? kgToLb(kg) : kg, dp),
    weight: (kg: number, dp = 1) => `${num(imperial ? kgToLb(kg) : kg, dp)} ${imperial ? 'lb' : 'kg'}`,
    height: (cm: number) => (imperial ? feetInches(cmToIn(cm)) : `${Math.round(cm)} cm`),
    volume: (kg: number) => `${num(imperial ? kgToLb(kg) : kg, 0)} ${imperial ? 'lb' : 'kg'}`,
    step: imperial ? 5 : 2.5,
  };
}

export const METRIC = build('metric');
export const IMPERIAL = build('imperial');

export const unitsFor = (system: UnitSystem) => (system === 'imperial' ? IMPERIAL : METRIC);

/**
 * Metric until mounted, then whatever the profile says.
 *
 * Preferences live in localStorage, which the server render cannot see, so
 * reading them during render would make the first client pass disagree and
 * React would throw away the tree (the P1 lesson, in `MEMORY.md §9`). Every
 * screen that shows a weight fetches it first, so the numbers arrive after this
 * has settled and nothing visibly flips.
 */
export function useUnits(): Units {
  const [u, setU] = useState<Units>(METRIC);
  useEffect(() => setU(unitsFor(getPrefs().units)), []);
  return u;
}

// ── self-check ──────────────────────────────────────────────────────
export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(`units: ${m}`);
  };
  // Round-trips, because a wrong one mis-ranks every imperial user.
  if (Math.abs(lbToKg(kgToLb(80)) - 80) > 1e-9) fail('kg⇄lb round trip drifted');
  if (Math.abs(inToCm(cmToIn(178)) - 178) > 1e-9) fail('cm⇄in round trip drifted');
  if (Math.abs(kgToLb(100) - 220.462) > 0.01) fail('100 kg should be ~220.46 lb');
  if (feetInches(70) !== '5′ 10″') fail('70 in should read 5′ 10″');
  if (feetInches(72) !== '6′ 0″') fail('72 in should read 6′ 0″');

  // A metric user must see exactly what was stored, to the digit.
  if (METRIC.weight(84.6) !== '84.6 kg') fail('metric weight should pass through');
  if (METRIC.weight(100, 0) !== '100 kg') fail('a whole kg should not grow a decimal');
  if (IMPERIAL.weight(100) !== '220.5 lb') fail('100 kg should read 220.5 lb');
  if (METRIC.height(178) !== '178 cm') fail('metric height should be cm');
  if (IMPERIAL.height(178) !== '5′ 10″') fail('178 cm should read 5′ 10″');

  // The keypad round-trip: what is typed must come back as what it was.
  for (const u of [METRIC, IMPERIAL])
    if (Math.abs(u.wkg(u.wv(102.5, 2)) - 102.5) > 0.01)
      fail(`${u.system} keypad round trip drifted`);
  // …and what is stored must be a tidy number, not a nine-decimal float.
  if (IMPERIAL.wkg(135) !== 61.23) fail('135 lb should store as 61.23 kg');
  if (METRIC.wkg(102.5) !== 102.5) fail('metric must pass through untouched');

  // Volume is where a stray decimal is loudest — six digits of it.
  if (METRIC.volume(6460.4) !== '6,460 kg') fail('volume should be whole and grouped');
  return 'units ok';
};
