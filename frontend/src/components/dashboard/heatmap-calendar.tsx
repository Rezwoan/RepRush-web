'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Dumbbell, Pill, X } from 'lucide-react';
import { spring } from '@/lib/motion';
import { localDateKey } from '@/lib/utils';

// Distinct, white-text-friendly colours assigned per workout split (deterministic
// by the sorted set of split names the user actually trains).
const SPLIT_PALETTE = ['#0a80f5', '#7c3aed', '#e0760a', '#0e9f6e', '#db2777', '#0891b2', '#6366f1', '#ca8a04'];

interface HeatmapData {
  [date: string]: { count: number; types: string[] };
}
interface SupplementDay {
  [date: string]: { name: string; total: number; unit: string; color?: string }[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function HeatmapCalendar({
  data,
  year,
  supplementData = {},
  onSelectDate,
  selectedDate,
}: {
  data: HeatmapData;
  year: number;
  supplementData?: SupplementDay;
  onSelectDate?: (date: string | null) => void;
  selectedDate?: string | null; // controlled selection (falls back to internal)
}) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [displayYear, setDisplayYear] = useState(year);
  const [internalSel, setInternalSel] = useState<string | null>(null);
  const selected = selectedDate !== undefined ? selectedDate : internalSel;
  const select = (d: string | null) => { if (selectedDate === undefined) setInternalSel(d); onSelectDate?.(d); };

  const { weeks, sessionsThisMonth } = useMemo(() => {
    const lastDay = new Date(displayYear, month + 1, 0);
    const startPad = new Date(displayYear, month, 1).getDay();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push(`${displayYear}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, sessionsThisMonth: cells.filter((d) => d && data[d]).length };
  }, [data, month, displayYear]);

  const prevMonth = () => { select(null); month === 0 ? (setMonth(11), setDisplayYear(displayYear - 1)) : setMonth(month - 1); };
  const nextMonth = () => { select(null); month === 11 ? (setMonth(0), setDisplayYear(displayYear + 1)) : setMonth(month + 1); };

  const todayStr = localDateKey(today);

  // Stable colour per workout split (sorted set of names → palette).
  const typeColor = useMemo(() => {
    const types = new Set<string>();
    Object.values(data).forEach((v) => (v.types || []).forEach((t) => types.add(t)));
    const map: Record<string, string> = {};
    Array.from(types).sort().forEach((t, i) => { map[t] = SPLIT_PALETTE[i % SPLIT_PALETTE.length]; });
    return map;
  }, [data]);
  const colorOf = (t?: string) => (t && typeColor[t]) || SPLIT_PALETTE[0];

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtNum = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <NavBtn onClick={prevMonth}><ChevronLeft size={16} /></NavBtn>
        <motion.div key={`${month}-${displayYear}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="text-center">
          <p className="text-sm font-display font-semibold">{MONTHS[month]} {displayYear}</p>
          <p className="text-xs text-muted-foreground">{sessionsThisMonth} session{sessionsThisMonth !== 1 ? 's' : ''} this month</p>
        </motion.div>
        <NavBtn onClick={nextMonth}><ChevronRight size={16} /></NavBtn>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((d) => <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>)}
      </div>

      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={`${month}-${wi}`} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              if (!date) return <div key={di} className="w-9 h-9" />;
              const isToday = date === todayStr;
              const isSel = selected === date;
              const dayNum = parseInt(date.split('-')[2]);
              const types = data[date]?.types || [];
              const has = types.length > 0;
              const bg = has ? colorOf(types[0]) : undefined;
              const supps = supplementData[date] || [];
              const ring = isToday ? ' ring-2 ring-volt-400 ring-offset-2 ring-offset-card'
                : isSel ? ' ring-2 ring-brand-400 ring-offset-2 ring-offset-card' : '';
              return (
                <motion.div
                  key={di}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring.snappy, delay: (wi * 7 + di) * 0.006 }}
                  whileHover={{ scale: 1.12, zIndex: 5 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => select(isSel ? null : date)}
                  style={bg ? { backgroundColor: bg } : undefined}
                  className={`relative w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold cursor-pointer ${has ? 'text-white' : 'bg-secondary/40 text-muted-foreground/60'}${ring}`}
                >
                  {/* one concentric inner ring per supplement taken that day */}
                  {supps.slice(0, 4).map((s, i) => (
                    <span key={i} className="absolute rounded-md pointer-events-none"
                      style={{ inset: 2 + i * 2.5, border: `1.5px solid ${s.color || '#34d399'}` }} />
                  ))}
                  <span className="relative z-10">{dayNum}</span>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[10px] text-muted-foreground">
        {Object.entries(typeColor).map(([t, c]) => (
          <span key={t} className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: c }} />{t}</span>
        ))}
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary/60" /> Rest</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-inset ring-volt-400" /> Today</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-md border-[1.5px] border-success" /> Supplement</span>
      </div>

      {/* Day detail */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-xl border border-border bg-secondary/40 p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-sm font-semibold">{fmtDate(selected)}</p>
                <button onClick={() => select(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={15} /></button>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Dumbbell size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {data[selected]?.types?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {data[selected].types.map((t, i) => {
                          const c = colorOf(t);
                          return (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-md flex items-center gap-1.5" style={{ background: `${c}22`, color: c }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{t}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Rest day — no workout logged</span>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Pill size={14} className="text-volt-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {supplementData[selected]?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {supplementData[selected].map((s, i) => {
                          const c = s.color || '#34d399';
                          return (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-md nums flex items-center gap-1.5" style={{ background: `${c}22`, color: c }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{s.name} {fmtNum(s.total)}{s.unit}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No supplements logged</span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground pt-0.5">Edit this day’s creatine &amp; supplements in the sections below ↓</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.1 }}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
      {children}
    </motion.button>
  );
}
