'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Send, Dumbbell, Pill } from 'lucide-react';
import { usersApi, pushApi } from '@/lib/api';
import { pushSupported, isPushEnabled, enablePush, disablePush } from '@/lib/push';
import { Card, CardHeader } from '@/components/ui/card';

export default function NotificationSettings({ profile, onChanged }: { profile: any; onChanged: () => void }) {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [prefs, setPrefs] = useState({
    remindWorkouts: profile?.remindWorkouts !== false,
    remindSupplements: profile?.remindSupplements !== false,
  });

  useEffect(() => {
    setSupported(pushSupported());
    isPushEnabled().then(setEnabled);
  }, []);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  const toggleMaster = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        flash('Reminders turned off.');
      } else {
        const res = await enablePush();
        if (res.ok) { setEnabled(true); flash('Reminders on! We sent a test notification.'); await pushApi.test().catch(() => {}); }
        else flash(
          res.reason === 'denied' ? 'Permission denied — enable notifications in your browser settings.'
          : res.reason === 'not-configured' ? 'Push isn’t configured on the server yet.'
          : res.reason === 'unsupported' ? 'Your browser doesn’t support push notifications.'
          : 'Could not enable notifications.',
        );
      }
    } finally { setBusy(false); }
  };

  const setPref = async (key: 'remindWorkouts' | 'remindSupplements', value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    try { await usersApi.updateProfile({ [key]: value }); onChanged(); } catch (e) { console.error(e); }
  };

  return (
    <Card className="p-5">
      <CardHeader icon={enabled ? <Bell size={16} /> : <BellOff size={16} />} title="Reminders" />

      {!supported ? (
        <p className="text-sm text-muted-foreground">Push notifications aren’t supported in this browser. Install the app to your home screen for reminders.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Push notifications</p>
              <p className="text-xs text-muted-foreground">Gentle nudges to train and take your creatine.</p>
            </div>
            <button onClick={toggleMaster} disabled={busy}
              className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-brand-500' : 'bg-secondary'}`}>
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white flex items-center justify-center transition-transform ${enabled ? 'translate-x-5' : ''}`}>
                {busy && <Loader2 size={12} className="animate-spin text-brand-500" />}
              </span>
            </button>
          </div>

          {msg && <p className="text-xs text-brand-300 mt-2">{msg}</p>}

          {enabled && (
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <PrefRow icon={<Dumbbell size={14} />} label="Workout reminders" desc="If you haven’t trained by evening"
                value={prefs.remindWorkouts} onChange={(v) => setPref('remindWorkouts', v)} />
              <PrefRow icon={<Pill size={14} />} label="Supplement reminders" desc="If creatine isn’t logged that day"
                value={prefs.remindSupplements} onChange={(v) => setPref('remindSupplements', v)} />
              <button onClick={() => pushApi.test().then(() => flash('Test notification sent.')).catch(() => flash('Could not send test.'))}
                className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1.5">
                <Send size={13} /> Send a test notification
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function PrefRow({ icon, label, desc, value, onChange }: { icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-muted-foreground flex-shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm">{label}</p>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-brand-500' : 'bg-secondary'}`}>
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );
}
