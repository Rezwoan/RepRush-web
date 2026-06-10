/** Local-time YYYY-MM-DD key. Day-bucketing must use local time (not UTC /
 *  toISOString) so it matches the calendar dates users see and pick. */
export const ymd = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
