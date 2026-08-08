/**
 * Adding and removing set rows mid-session, without losing what was logged.
 *
 * ## Why this is its own file
 *
 * The server identifies a set by its number *within* its exercise. So a row
 * inserted or removed in the middle of the list silently re-points every logged
 * set below it — delete row 2 of 4 and the set you logged as 3 starts reading
 * as 2, against a different target. Nothing on screen would look wrong; the
 * history would just quietly be someone else's.
 *
 * Each function therefore returns both the new rows and a `map` saying where
 * every old row went (`GONE` for a row that no longer exists). The caller
 * rewrites the logged sets that moved. Pure and separate from the screen
 * because this is the part worth checking, and a component is the one place you
 * cannot check anything.
 */

/** A row's destination when it no longer exists. */
export const GONE = -1;

export interface Reshape<T> {
  rows: T[];
  /** `map[oldIndex]` → new index, or `GONE`. */
  map: number[];
}

/** Drop the row at `index`. */
export function removeRow<T>(rows: T[], index: number): Reshape<T> {
  return {
    rows: rows.filter((_, i) => i !== index),
    map: rows.map((_, i) => (i === index ? GONE : i > index ? i - 1 : i)),
  };
}

/** Put `row` at `index`, pushing everything from there down. */
export function insertRow<T>(rows: T[], index: number, row: T): Reshape<T> {
  const at = Math.max(0, Math.min(index, rows.length));
  return {
    rows: [...rows.slice(0, at), row, ...rows.slice(at)],
    map: rows.map((_, i) => (i >= at ? i + 1 : i)),
  };
}

/** Put `row` on the end. Nothing moves, which is why this is the cheap case. */
export function appendRow<T>(rows: T[], row: T): Reshape<T> {
  return { rows: [...rows, row], map: rows.map((_, i) => i) };
}

// ── self-check ────────────────────────────────────────────────────
export const __selfcheck = () => {
  const fail = (m: string) => {
    throw new Error(`set-rows: ${m}`);
  };
  const eq = (a: unknown, b: unknown, m: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m} — got ${JSON.stringify(a)}`);
  };
  const abcd = ['a', 'b', 'c', 'd'];

  // Removing from the middle: the rows below move up by one, and the removed
  // one is gone. This is the case that silently corrupted logged sets.
  eq(removeRow(abcd, 1).rows, ['a', 'c', 'd'], 'removing the second row leaves a, c, d');
  eq(removeRow(abcd, 1).map, [0, GONE, 1, 2], 'rows below a removal shift up by one');

  eq(removeRow(abcd, 3).map, [0, 1, 2, GONE], 'removing the last row moves nothing');
  eq(removeRow(abcd, 0).map, [GONE, 0, 1, 2], 'removing the first row shifts everything');
  eq(removeRow(['only'], 0).rows, [], 'the list can be emptied — the caller decides whether to');

  // Inserting a warm-up at the top pushes every working set down one.
  eq(insertRow(abcd, 0, 'w').rows, ['w', 'a', 'b', 'c', 'd'], 'a warm-up goes above the work');
  eq(insertRow(abcd, 0, 'w').map, [1, 2, 3, 4], 'everything below an insert shifts down');
  eq(insertRow(abcd, 2, 'w').map, [0, 1, 3, 4], 'only rows at or after the insert move');
  eq(insertRow(abcd, 99, 'w').rows, [...abcd, 'w'], 'an index past the end appends');
  eq(insertRow([], 0, 'w').rows, ['w'], 'inserting into nothing gives one row');

  // Appending is the only reshape where no logged set has to be rewritten.
  eq(appendRow(abcd, 'e').map, [0, 1, 2, 3], 'appending moves nothing');
  eq(appendRow(abcd, 'e').rows, [...abcd, 'e'], 'appending puts the row last');

  // Every map must name a real destination, or a logged set gets rewritten to
  // a row that is not there.
  for (const r of [removeRow(abcd, 1), insertRow(abcd, 1, 'w'), appendRow(abcd, 'e')]) {
    if (r.map.length !== abcd.length) fail('a map has one entry per original row');
    for (const to of r.map) {
      if (to !== GONE && !(to >= 0 && to < r.rows.length)) fail(`map points outside the new rows`);
    }
    // No two surviving rows may land on the same index, or one set overwrites
    // another's position.
    const landed = r.map.filter((t) => t !== GONE);
    if (new Set(landed).size !== landed.length) fail('two rows landed on the same index');
  }

  return 'set rows ok';
};
