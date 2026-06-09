'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { spring } from '@/lib/motion';

interface HeatmapData {
  [date: string]: { count: number; types: string[] };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function HeatmapCalendar({ data, year }: { data: HeatmapData; year: number }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [displayYear, setDisplayYear] = useState(year);

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

  const prevMonth = () => (month === 0 ? (setMonth(11), setDisplayYear(displayYear - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setDisplayYear(displayYear + 1)) : setMonth(month + 1));

  const todayStr = today.toISOString().split('T')[0];

  const getLevel = (date: string | null) => {
    if (!date) return -1;
    const count = data[date]?.count || 0;
    return Math.min(3, count);
  };

  // blue → gold "energy" ramp
  const cellClass = (level: number, isToday: boolean) => {
    const base = 'relative w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold cursor-default';
    const ring = isToday ? ' ring-2 ring-volt-400 ring-offset-2 ring-offset-card' : '';
    if (level === -1) return `${base} opacity-0`;
    if (level === 0) return `${base} bg-secondary/50 text-muted-foreground/50${ring}`;
    if (level === 1) return `${base} bg-brand-900 text-brand-200${ring}`;
    if (level === 2) return `${base} bg-brand-600 text-white${ring}`;
    return `${base} bg-volt-gradient text-volt-900 shadow-glow-volt${ring}`;
  };

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
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={`${month}-${wi}`} className="grid grid-cols-7 gap-1">
            {week.map((date, di) => {
              const level = getLevel(date);
              const isToday = date === todayStr;
              const types = date ? data[date]?.types?.join(', ') : '';
              const dayNum = date ? parseInt(date.split('-')[2]) : null;
              return (
                <motion.div
                  key={di}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring.snappy, delay: (wi * 7 + di) * 0.006 }}
                  whileHover={level >= 0 ? { scale: 1.12, zIndex: 5 } : undefined}
                  title={date ? `${date}${types ? ' — ' + types : ''}${!data[date] ? ' — Rest day' : ''}` : ''}
                  className={cellClass(level, isToday)}
                >
                  {dayNum && <span>{dayNum}</span>}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 pt-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        <span className="w-3 h-3 rounded bg-secondary/50" />
        <span className="w-3 h-3 rounded bg-brand-900" />
        <span className="w-3 h-3 rounded bg-brand-600" />
        <span className="w-3 h-3 rounded bg-volt-400" />
        <span>More</span>
      </div>
    </div>
  );
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.1 }}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    >
      {children}
    </motion.button>
  );
}
