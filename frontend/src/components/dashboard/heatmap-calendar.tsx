'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Dumbbell, Pill, X } from 'lucide-react';
import { spring } from '@/lib/motion';

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
}: {
  data: HeatmapData;
  year: number;
  supplementData?: SupplementDay;
}) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [displayYear, setDisplayYear] = useState(year);
  const [selected, setSelected] = useState<string | null>(null);

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

  const prevMonth = () => { setSelected(null); month === 0 ? (setMonth(11), setDisplayYear(displayYear - 1)) : setMonth(month - 1); };
  const nextMonth = () => { setSelected(null); month === 11 ? (setMonth(0), setDisplayYear(displayYear + 1)) : setMonth(month + 1); };

  const todayStr = today.toISOString().split('T')[0];
  const getLevel = (date: string | null) => (!date ? -1 : Math.min(3, data[date]?.count || 0));

  const cellClass = (level: number, isToday: boolean, isSelected: boolean) => {
    const base = 'relative w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold cursor-pointer';
    const ring = isSelected ? ' ring-2 ring-brand-400 ring-offset-2 ring-offset-card'
      : isToday ? ' ring-2 ring-volt-400 ring-offset-2 ring-offset-card' : '';
    if (level === -1) return `${base} opacity-0 pointer-events-none`;
    if (level === 0) return `${base} bg-secondary/50 text-muted-foreground/50${ring}`;
    if (level === 1) return `${base} bg-brand-900 text-brand-200${ring}`;
    if (level === 2) return `${base} bg-brand-600 text-white${ring}`;
    return `${base} bg-volt-gradient text-volt-900 shadow-glow-volt${ring}`;
  };

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
              const level = getLevel(date);
              const isToday = date === todayStr;
              const dayNum = date ? parseInt(date.split('-')[2]) : null;
              const supps = date ? supplementData[date] || [] : [];
              return (
                <motion.div
                  key={di}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring.snappy, delay: (wi * 7 + di) * 0.006 }}
                  whileHover={level >= 0 ? { scale: 1.12, zIndex: 5 } : undefined}
                  whileTap={level >= 0 ? { scale: 0.92 } : undefined}
                  onClick={() => date && setSelected(selected === date ? null : date)}
                  className={cellClass(level, isToday, selected === date)}
                >
                  {/* one concentric inner ring per supplement taken that day */}
                  {supps.slice(0, 4).map((s, i) => (
                    <span key={i} className="absolute rounded-md pointer-events-none"
                      style={{ inset: 2 + i * 2.5, border: `1.5px solid ${s.color || '#34d399'}` }} />
                  ))}
                  {dayNum && <span className="relative z-10">{dayNum}</span>}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-[1.5px] border-success" /> supplement ring</span>
        <span className="flex items-center gap-1.5">
          Less
          <span className="w-3 h-3 rounded bg-secondary/50" />
          <span className="w-3 h-3 rounded bg-brand-900" />
          <span className="w-3 h-3 rounded bg-brand-600" />
          <span className="w-3 h-3 rounded bg-volt-400" />
          More
        </span>
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
                <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={15} /></button>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Dumbbell size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    {data[selected]?.types?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {data[selected].types.map((t, i) => (
                          <span key={i} className="text-xs bg-brand-500/15 text-brand-200 px-2 py-0.5 rounded-md">{t}</span>
                        ))}
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
