#!/usr/bin/env node
/**
 * Builds `backend/data/exercises.json` — the v2 exercise catalog.
 *
 * Source: yuhonas/free-exercise-db (Unlicense / public domain), pinned to a
 * commit so a rebuild is reproducible. 873 exercises with name, force, level,
 * mechanic, equipment, muscles, instructions and photographs.
 *
 * This script does all the vocabulary mapping ahead of time so the running
 * backend does zero translation: it loads the output and serves it.
 *
 *   node scripts/build-exercise-catalog.js          # rebuild
 *   node scripts/build-exercise-catalog.js --check  # self-check only, no write
 *
 * ponytail: images stay on jsDelivr rather than in this repo — 1,746 JPEGs is
 * ~90 MB, which would dwarf the app and slow every Pi deploy. If offline
 * exercise photos ever matter, mirror them into `frontend/public/exercises/`
 * and change IMAGE_BASE; nothing else needs to know.
 */
const fs = require('fs');
const path = require('path');

const UPSTREAM_SHA = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49'; // 2026-05-24
const SRC = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${UPSTREAM_SHA}/dist/exercises.json`;
const IMAGE_BASE = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${UPSTREAM_SHA}/exercises/`;

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backend', 'data', 'exercises.json');
const MUSCLES_OUT = path.join(ROOT, 'backend', 'data', 'muscles.json');
const MUSCLES_TS = path.join(ROOT, 'frontend', 'src', 'lib', 'muscles.ts');

// ── muscle mapping ────────────────────────────────────────────────
// Upstream has 17 flat muscles; we have 21 with chest, delts and abs split.
// The splits can't come from the data, so they come from the exercise name.

const DIRECT = {
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  calves: 'calves',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  adductors: 'adductors',
  abductors: 'glutes', // no abductor region on the Bodygraph; hip abduction reads as glutes
  quadriceps: 'quads',
  lats: 'lats',
  'middle back': 'upper_back',
  'lower back': 'lower_back',
  traps: 'traps',
  neck: 'neck',
};

const has = (name, re) => re.test(name);

const splitChest = (name) => {
  if (has(name, /incline|upper chest/)) return 'upper_chest';
  if (has(name, /decline|\bdip\b|dips/)) return 'lower_chest';
  return 'mid_chest';
};

const splitShoulder = (name) => {
  if (has(name, /lateral|side raise|upright row/)) return 'side_delt';
  if (has(name, /rear|reverse fl|reverse mach|face pull|bent[- ]over.*(raise|fly)/)) return 'rear_delt';
  return 'front_delt';
};

const splitAbs = (name) =>
  has(name, /oblique|twist|side bend|side crunch|windmill|wood ?chop|side plank/) ? 'obliques' : 'abs';

/** Upstream muscle + exercise name → one of our muscle ids. */
function mapMuscle(upstream, name) {
  const n = name.toLowerCase();
  if (upstream === 'chest') return splitChest(n);
  if (upstream === 'shoulders') return splitShoulder(n);
  if (upstream === 'abdominals') return splitAbs(n);
  const m = DIRECT[upstream];
  if (!m) throw new Error(`unmapped upstream muscle: ${upstream}`);
  return m;
}

const mapMuscles = (list, name) =>
  Array.from(new Set((list || []).map((u) => mapMuscle(u, name))));

// ── equipment mapping ─────────────────────────────────────────────
// Our set is the 8 glyphs in frontend/src/components/art/equipment-icon.tsx.
// ponytail: 'other' (sleds, tyres) lands on `machine` and 'foam roll' on
// `bodyweight` because drawing two more glyphs for ~20 exercises isn't worth
// it. Add glyphs and remap here if those exercises ever get prominent.
const EQUIPMENT = {
  'body only': 'bodyweight',
  machine: 'machine',
  other: 'machine',
  'foam roll': 'bodyweight',
  kettlebells: 'kettlebell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  barbell: 'barbell',
  bands: 'band',
  'medicine ball': 'plate',
  'exercise ball': 'bodyweight',
  'e-z curl bar': 'barbell',
};

// ── per-exercise defaults upstream doesn't carry ──────────────────
// Rep range and rest are what the workout builder seeds a set with.
const DEFAULTS = {
  powerlifting: [3, 5, 240],
  'olympic weightlifting': [3, 5, 240],
  strongman: [5, 8, 180],
  plyometrics: [6, 10, 120],
  cardio: [12, 20, 60],
  stretching: [10, 15, 30],
};

/** category + mechanic → [minReps, maxReps, restSeconds] */
function defaultsFor(category, mechanic) {
  if (DEFAULTS[category]) return DEFAULTS[category];
  return mechanic === 'isolation' ? [8, 12, 90] : [5, 8, 180];
}

// ── legacy name → catalog id ──────────────────────────────────────
// The 31 distinct `workout_sets.exerciseName` values in the v1 database, plus
// the v1 seed plan's names. Hand-checked, not fuzzy-matched: 31 rows is small
// enough that a wrong guess is a worse trade than typing them out.
// `null` = deliberately unmatched (no catalog equivalent).
const LEGACY = {
  'Barbell Bench Press': 'Barbell_Bench_Press_-_Medium_Grip',
  'Incline DB Press': 'Incline_Dumbbell_Press',
  'Incline DB Curls': 'Incline_Dumbbell_Curl',
  'Close-Grip Bench Press': 'Close-Grip_Barbell_Bench_Press',
  'Heavy DB Supinating Curls': 'Alternate_Incline_Dumbbell_Curl',
  'V-Grip Lat Pulldowns': 'V-Bar_Pulldown',
  'Chest-Supported T-Bar Row': 'T-Bar_Row_with_Handle',
  'Barbell Squats': 'Barbell_Squat',
  'Rope Triceps Pushdowns': 'Triceps_Pushdown_-_Rope_Attachment',
  'EZ Bar Skullcrushers': 'EZ-Bar_Skullcrusher',
  'DB Lateral Raises': 'Side_Lateral_Raise',
  'Close Grip EZ Bar Curls': 'Close-Grip_EZ_Bar_Curl',
  'Overhead Press': 'Standing_Military_Press',
  'Lat Pulldowns (Wide Grip)': 'Wide-Grip_Lat_Pulldown',
  'DB Hammer Curls': 'Hammer_Curls',
  'Hack Squats': 'Hack_Squat',
  'Seated DB Press': 'Seated_Dumbbell_Press',
  'Pec Deck Machine Flyes': 'Butterfly',
  'Overhead Cable Extensions': 'Cable_Rope_Overhead_Triceps_Extension',
  'Barbell Rows': 'Bent_Over_Barbell_Row',
  'Romanian Deadlifts': 'Romanian_Deadlift',
  'DB Rear Delt Flyes': 'Reverse_Flyes',
  'Leg Extensions': 'Leg_Extensions',
  'Seated Leg Curls': 'Seated_Leg_Curl',
  'Seated Calf Raises': 'Seated_Calf_Raise',
  'Barbell Bicep Curls': 'Barbell_Curl',
  'Lying Leg Curls': 'Lying_Leg_Curls',
  'Leg Press': 'Leg_Press',
  'Standing Calf Raises': 'Standing_Calf_Raises',
  'Seated calf raises': 'Seated_Calf_Raise',
  'Core Exercise (User Choice)': null,
};

// ── build ─────────────────────────────────────────────────────────

function transform(raw) {
  return raw
    .map((e) => {
      const [repMin, repMax, restSec] = defaultsFor(e.category, e.mechanic);
      return {
        id: e.id,
        name: e.name,
        primary: mapMuscles(e.primaryMuscles, e.name),
        secondary: mapMuscles(e.secondaryMuscles, e.name).filter(
          (m) => !mapMuscles(e.primaryMuscles, e.name).includes(m),
        ),
        equipment: EQUIPMENT[e.equipment] || 'machine',
        force: e.force || null,
        level: e.level,
        mechanic: e.mechanic || null,
        category: e.category,
        repMin,
        repMax,
        restSec,
        images: e.images || [],
        instructions: e.instructions || [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The muscle taxonomy, parsed out of the frontend's `muscles.ts`. That file is
 * the single source of truth (the Bodygraph art is drawn against it); the
 * backend gets a generated copy so the rank engine's size weights can never
 * drift from the picture the user is looking at.
 */
function frontendMuscles() {
  const src = fs.readFileSync(MUSCLES_TS, 'utf8');
  const body = src.slice(src.indexOf('export const MUSCLES'), src.indexOf('] as const'));
  const re = /id: '([a-z_]+)',\s*label: '([^']+)',\s*group: '([a-z]+)',\s*view: '([a-z]+)',\s*size: (\d+)/g;
  const muscles = Array.from(body.matchAll(re)).map((m) => ({
    id: m[1],
    label: m[2],
    group: m[3],
    view: m[4],
    size: Number(m[5]),
  }));
  if (muscles.length < 15) throw new Error(`could not parse muscles from ${MUSCLES_TS}`);
  return muscles;
}

const frontendMuscleIds = () => new Set(frontendMuscles().map((m) => m.id));

function check(exercises) {
  const ids = frontendMuscleIds();
  const byId = new Map(exercises.map((e) => [e.id, e]));

  for (const e of exercises) {
    for (const m of [...e.primary, ...e.secondary]) {
      if (!ids.has(m)) throw new Error(`${e.id}: muscle "${m}" is not in muscles.ts`);
    }
    if (!e.primary.length) throw new Error(`${e.id}: no primary muscle`);
    if (e.repMin > e.repMax) throw new Error(`${e.id}: bad rep range`);
  }

  for (const [legacy, id] of Object.entries(LEGACY)) {
    if (id !== null && !byId.has(id)) throw new Error(`legacy alias "${legacy}" → missing id "${id}"`);
  }

  // Anchor points for the name-driven splits — these are the whole reason the
  // mapping is more than a lookup table, so they get asserted.
  const anchors = {
    Incline_Dumbbell_Press: 'upper_chest',
    Decline_Barbell_Bench_Press: 'lower_chest',
    'Barbell_Bench_Press_-_Medium_Grip': 'mid_chest',
    Side_Lateral_Raise: 'side_delt',
    Reverse_Flyes: 'rear_delt',
    Standing_Military_Press: 'front_delt',
    Russian_Twist: 'obliques',
    Crunches: 'abs',
  };
  for (const [id, expected] of Object.entries(anchors)) {
    const e = byId.get(id);
    if (!e) throw new Error(`anchor exercise missing: ${id}`);
    if (!e.primary.includes(expected)) {
      throw new Error(`${id}: expected primary ${expected}, got ${e.primary.join('+')}`);
    }
  }

  if (exercises.length < 800) throw new Error(`only ${exercises.length} exercises — upstream changed?`);
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  let raw;
  if (checkOnly && fs.existsSync(OUT)) {
    const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    check(out.exercises);
    console.log(`ok — ${out.exercises.length} exercises, ${Object.keys(out.aliases).length} aliases`);
    return;
  }

  console.log(`fetching ${SRC}`);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`upstream fetch failed: ${res.status}`);
  raw = await res.json();

  const exercises = transform(raw);
  check(exercises);

  const out = {
    source: 'https://github.com/yuhonas/free-exercise-db',
    licence: 'Unlicense (public domain)',
    upstreamSha: UPSTREAM_SHA,
    imageBase: IMAGE_BASE,
    aliases: LEGACY,
    exercises,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`wrote ${OUT} — ${exercises.length} exercises, ${kb} KB`);

  const muscles = frontendMuscles();
  fs.writeFileSync(MUSCLES_OUT, JSON.stringify(muscles, null, 1));
  console.log(`wrote ${MUSCLES_OUT} — ${muscles.length} muscles`);
}

main().catch((err) => {
  console.error(String(err.message || err));
  process.exit(1);
});
