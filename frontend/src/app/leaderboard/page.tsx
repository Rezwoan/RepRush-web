'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, Scale } from 'lucide-react';
import { leaderboardApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getInitials } from '@/lib/utils';
import { PageTransition, Stagger, Item } from '@/components/ui/motion-primitives';
import { spring } from '@/lib/motion';

type Tab = 'rss' | 'wilks' | 'progress';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('rss');
  const [data, setData] = useState<Record<Tab, any[]>>({ rss: [], wilks: [], progress: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      leaderboardApi.getRelativeStrength().then((r) => ({ key: 'rss', data: r.data })),
      leaderboardApi.getWilks().then((r) => ({ key: 'wilks', data: r.data })),
      leaderboardApi.getProgressRate().then((r) => ({ key: 'progress', data: r.data })),
    ]).then((results) => {
      const newData = { rss: [], wilks: [], progress: [] } as typeof data;
      results.forEach((r) => { (newData as any)[r.key] = r.data; });
      setData(newData);
    }).finally(() => setLoading(false));
  }, []);

  const tabs = [
    { key: 'rss' as Tab, label: 'Relative Strength', short: 'Strength', icon: <Scale size={14} />, description: '(Bench + Squat + Deadlift) ÷ Bodyweight' },
    { key: 'wilks' as Tab, label: 'Wilks Score', short: 'Wilks', icon: <Trophy size={14} />, description: 'IPF powerlifting coefficient, bodyweight-adjusted' },
    { key: 'progress' as Tab, label: 'Progress Rate', short: 'Progress', icon: <TrendingUp size={14} />, description: 'Average weekly volume improvement over 8 weeks' },
  ];

  const currentData = data[tab];
  const rankEmoji = ['🥇', '🥈', '🥉'];

  return (
    <PageTransition className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
        <Trophy size={24} className="text-volt-400" /> Leaderboard
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-xl p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab === t.key && <motion.span layoutId="lb-tab" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-brand-gradient shadow-glow-brand" />}
            <span className="relative z-10">{t.icon}</span>
            <span className="relative z-10 hidden sm:inline">{t.label}</span>
            <span className="relative z-10 sm:hidden">{t.short}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground -mt-2">{tabs.find((t) => t.key === tab)?.description}</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="loader-ring" /></div>
      ) : currentData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy size={40} className="mx-auto mb-3 opacity-30" />
          <p>No data yet. Log some sessions to appear on the board!</p>
        </div>
      ) : (
        <Stagger className="space-y-2" key={tab}>
          {currentData.map((entry: any, i: number) => {
            const isMe = entry.userId === user?.id;
            const podium = i < 3;
            return (
              <Item key={entry.userId}>
                <motion.div whileHover={{ x: 3 }} transition={spring.snappy}
                  className={`relative rounded-2xl border p-4 flex items-center gap-4 overflow-hidden ${
                    isMe ? 'border-brand-500/50 bg-brand-500/[0.08]' : 'border-border bg-card'
                  }`}>
                  {i === 0 && <span className="absolute inset-x-0 top-0 h-0.5 bg-volt-gradient" />}
                  <div className={`text-2xl font-display font-bold w-9 text-center ${podium ? '' : 'text-muted-foreground nums'}`}>
                    {podium ? rankEmoji[i] : `#${entry.rank}`}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold overflow-hidden flex-shrink-0">
                    {entry.profileImage ? <img src={entry.profileImage} alt={entry.name} className="w-full h-full object-cover" /> : getInitials(entry.name || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${isMe ? 'text-brand-300' : 'text-foreground'}`}>
                      {entry.name || 'User'} {isMe && <span className="text-xs text-brand-400">(you)</span>}
                    </p>
                    {tab !== 'progress' ? (
                      <p className="text-xs text-muted-foreground nums">
                        B:{Math.round(entry.bench)} · S:{Math.round(entry.squat)} · D:{Math.round(entry.deadlift)}kg
                        {entry.weightKg && ` · ${entry.weightKg}kg BW`}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Avg weekly improvement</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-display font-bold nums ${i === 0 ? 'text-volt-400' : 'text-foreground'}`}>
                      {tab === 'progress' ? `${entry.score > 0 ? '+' : ''}${entry.score}%` : entry.score}
                    </p>
                    <p className="text-xs text-muted-foreground">{tab === 'rss' ? 'ratio' : tab === 'wilks' ? 'pts' : 'per week'}</p>
                  </div>
                </motion.div>
              </Item>
            );
          })}
        </Stagger>
      )}
    </PageTransition>
  );
}
