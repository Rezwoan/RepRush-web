'use client';
/**
 * Settings (SPEC §9) — a grouped list with sub-screens.
 *
 * Every preference here writes through `PATCH /profile` and is read back by the
 * screens that care, so nothing in this file is decorative. The ones that are
 * genuinely someone else's job (a feature request form, a review link) say so
 * rather than pretending.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { authApi, profileApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { cachePref } from '@/lib/feedback';
import { THEMES } from '@/lib/themes';
import { Button } from '@/components/ui/button';
import { Segmented, Toggle } from '@/components/ui/controls';
import { SparkAmount } from '@/components/ui/spark';
import { ArtAttribution } from '@/components/art/attribution';
import NotificationSettings from '@/components/profile/notification-settings';
import { cn } from '@/lib/utils';
import { Group, Panel, Row } from './panel';
import type { Cosmetic, Overview, Preferences } from './types';

type Screen =
  | 'root'
  | 'account'
  | 'units'
  | 'themes'
  | 'notifications'
  | 'calendar'
  | 'analysis'
  | 'other'
  | 'about';

export function SettingsPanel({
  data,
  onBack,
  onChanged,
  onView,
}: {
  data: Overview;
  onBack: () => void;
  onChanged: () => void;
  onView: (view: string) => void;
}) {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const { themeId, setThemeId } = useTheme();
  const [screen, setScreen] = useState<Screen>('root');
  const [themeStore, setThemeStore] = useState<{ currency: number; items: Cosmetic[] } | null>(null);
  const [themeError, setThemeError] = useState('');

  useEffect(() => {
    if (screen !== 'themes' || themeStore) return;
    profileApi
      .store()
      .then((r) => setThemeStore(r.data))
      .catch(() => setThemeStore(null));
  }, [screen, themeStore]);

  const buyTheme = async (id: string) => {
    setThemeError('');
    try {
      const r = await profileApi.buy(`theme.${id}`);
      setThemeStore(r.data);
      setThemeId(id);
    } catch (e: any) {
      setThemeError(e?.response?.data?.message ?? 'Could not buy that theme.');
    }
  };

  const [prefs, setPrefs] = useState<Preferences>(data.preferences);
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  // The browser only offers the install prompt once, through an event it fires
  // when it feels like it — so it has to be caught and kept.
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const set = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    // Haptics, SFX and the rest alert are read from the cached profile blob, not
    // from this screen's state — patch it too or a flipped switch would only
    // take effect after the next `/auth/me`.
    cachePref(key as any, value as any);
    await profileApi.update({ preferences: { [key]: value } }).catch(() => {});
    onChanged();
  };

  const back = () => (screen === 'root' ? onBack() : setScreen('root'));

  if (screen === 'units') {
    return (
      <Panel title="Units" onBack={back}>
        <Segmented
          options={[
            { value: 'metric', label: 'Metric (kg, cm)' },
            { value: 'imperial', label: 'Imperial (lb, in)' },
          ]}
          value={prefs.units}
          onChange={(v) => set('units', v as Preferences['units'])}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          Weights are stored in kilograms either way — this only changes how they are shown, so
          switching back and forth can never round your history away.
        </p>
      </Panel>
    );
  }

  if (screen === 'themes') {
    // Ownership comes from the store; the *applied* theme stays a client
    // preference, because the pre-paint boot script has to choose one before
    // any request could answer and it has to work offline.
    const price = (id: string) => themeStore?.items.find((c) => c.id === `theme.${id}`);
    return (
      <Panel
        title="Themes"
        onBack={back}
        action={
          <span className="nums rounded-full bg-secondary px-3 py-1 text-sm font-extrabold">
            <SparkAmount amount={themeStore?.currency ?? 0} size={14} />
          </span>
        }
      >
        {themeError && <p className="mb-3 text-sm font-semibold text-destructive">{themeError}</p>}
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => {
            const item = price(t.id);
            const owned = !item || item.owned || item.free;
            return (
              <button
                key={t.id}
                onClick={() => (owned ? setThemeId(t.id) : void buyTheme(t.id))}
                className={cn(
                  'press flex items-center gap-2 rounded-2xl border-2 p-3 text-left',
                  themeId === t.id ? 'border-primary bg-primary/10' : 'border-border bg-card',
                  !owned && 'opacity-80',
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-full border border-border"
                  style={{ background: `hsl(${t.primary} ${t.primarySat ?? 92}% 50%)` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{t.name}</span>
                  {!owned && item && (
                    <SparkAmount amount={item.price} size={11} className="text-xs" />
                  )}
                </span>
                {themeId === t.id && owned && <Check size={16} className="text-primary" />}
                {!owned && <Lock size={14} className="shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Locked themes are bought with Spark, the same as any other cosmetic. Light and Dark are
          always free.
        </p>
      </Panel>
    );
  }

  if (screen === 'calendar') {
    const first = prefs.weekStart === 'sunday' ? 0 : 1;
    const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return (
      <Panel title="Calendar" onBack={back}>
        <Segmented
          options={[
            { value: 'monday', label: 'Start Monday' },
            { value: 'sunday', label: 'Start Sunday' },
          ]}
          value={prefs.weekStart}
          onChange={(v) => set('weekStart', v as Preferences['weekStart'])}
        />
        <div className="surface mt-4 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Preview
          </p>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="text-xs font-bold text-muted-foreground">
                {letters[(first + i) % 7]}
              </span>
            ))}
            {Array.from({ length: 28 }, (_, i) => (
              <span key={i} className="nums rounded-lg bg-muted/60 py-1.5 text-xs font-semibold">
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    );
  }

  if (screen === 'analysis') {
    return (
      <Panel title="Analysis" onBack={back}>
        <Segmented
          options={[
            { value: 'rolling', label: 'Last 7 / 30 days' },
            { value: 'calendar', label: 'This week / month' },
          ]}
          value={prefs.analysisWindow}
          onChange={(v) => set('analysisWindow', v as Preferences['analysisWindow'])}
        />
        <p className="mt-3 text-sm text-muted-foreground">
          {prefs.analysisWindow === 'rolling'
            ? 'Windows are measured back from today, so a Monday and a Friday are compared the same way.'
            : 'Windows start at the beginning of the week or month, so the number resets when it does.'}
        </p>
      </Panel>
    );
  }

  if (screen === 'other') {
    return (
      <Panel title="Other preferences" onBack={back}>
        <Group title="App layout">
          <Row
            label="Suggested workouts"
            sub="Show the generated session on Home"
            right={
              <Toggle
                checked={prefs.suggestedWorkouts}
                onChange={(v) => set('suggestedWorkouts', v)}
                label="Suggested workouts"
              />
            }
          />
          <Row
            label="Bigger discovery posts"
            sub="Single column instead of the two-up grid"
            right={
              <Toggle
                checked={prefs.biggerDiscoveryPosts}
                onChange={(v) => set('biggerDiscoveryPosts', v)}
                label="Bigger discovery posts"
              />
            }
          />
        </Group>
        <Group title="Sharing">
          <Row
            label="Auto-share workouts"
            sub="Finished sessions go to Discovery by default — you can still change it per workout"
            right={
              <Toggle
                checked={prefs.autoShare}
                onChange={(v) => set('autoShare', v)}
                label="Auto-share workouts"
              />
            }
          />
        </Group>
        <Group title="Feel">
          <Row
            label="Haptic feedback"
            right={<Toggle checked={prefs.haptics} onChange={(v) => set('haptics', v)} label="Haptics" />}
          />
          <Row
            label="Audio & SFX"
            right={<Toggle checked={prefs.sfx} onChange={(v) => set('sfx', v)} label="Audio and SFX" />}
          />
          <Row
            label="Rest timer alert"
            sub="Chime and vibrate when rest ends"
            right={
              <Toggle checked={prefs.restAlert} onChange={(v) => set('restAlert', v)} label="Rest alert" />
            }
          />
        </Group>
      </Panel>
    );
  }

  if (screen === 'notifications') {
    return (
      <Panel title="Notifications" onBack={back}>
        <NotificationSettings profile={user} onChanged={() => refresh()} />
      </Panel>
    );
  }

  if (screen === 'account') {
    return (
      <Panel title="Account" onBack={back}>
        <Group title="Sign in">
          <Row label="Email" right={<span className="text-sm text-muted-foreground">{user?.email}</span>} />
        </Group>
        <section className="surface space-y-3 p-4">
          <h2 className="font-extrabold">Change password</h2>
          <input
            type="password"
            placeholder="Current password"
            value={pw.oldPassword}
            onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })}
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          <input
            type="password"
            placeholder="New password (8+ characters)"
            value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
          />
          {pwMsg && <p className="text-sm font-semibold text-muted-foreground">{pwMsg}</p>}
          <Button
            variant="chunky"
            disabled={pw.newPassword.length < 8 || !pw.oldPassword}
            onClick={async () => {
              try {
                await authApi.changePassword(pw.oldPassword, pw.newPassword);
                setPw({ oldPassword: '', newPassword: '' });
                setPwMsg('Password changed.');
              } catch (err: any) {
                setPwMsg(err?.response?.data?.message ?? 'That did not work.');
              }
            }}
          >
            Change password
          </Button>
        </section>
      </Panel>
    );
  }

  if (screen === 'about') {
    return (
      <Panel title="About" onBack={back}>
        <div className="surface space-y-2 p-4 text-sm">
          <p className="font-extrabold">RepRush</p>
          <p className="text-muted-foreground">
            Train. Track. Rush. Every set you log gets ranked.
          </p>
        </div>
        <div className="mt-4">
          <ArtAttribution />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Settings" onBack={back}>
      <Group title="User">
        <Row label="Profile" onClick={() => onView('edit')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Account" onClick={() => setScreen('account')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Referrals" onClick={() => router.push('/friends')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Statistics" onClick={() => onView('statistics')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Health log" onClick={() => onView('health')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
      </Group>

      <Group title="Preferences">
        <Row label="Units" sub={prefs.units === 'metric' ? 'kg · cm' : 'lb · in'} onClick={() => setScreen('units')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Themes" sub={`${THEMES.length} available`} onClick={() => setScreen('themes')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Notifications" onClick={() => setScreen('notifications')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Analysis" sub={prefs.analysisWindow === 'rolling' ? 'Rolling windows' : 'Calendar windows'} onClick={() => setScreen('analysis')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Calendar" sub={`Week starts ${prefs.weekStart}`} onClick={() => setScreen('calendar')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        <Row label="Other preferences" onClick={() => setScreen('other')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
      </Group>

      {installPrompt && (
        <Group title="App">
          <Row
            label="Install RepRush"
            sub="Add it to your home screen — it works offline"
            onClick={async () => {
              installPrompt.prompt();
              await installPrompt.userChoice.catch(() => undefined);
              setInstallPrompt(null);
            }}
            right={<ChevronRight size={18} className="text-muted-foreground" />}
          />
        </Group>
      )}

      <Group title="Resources">
        {/* P10 pulled a Feedback tile because it opened a "coming soon" for a
            form with no backend. This one is real, and its reader — the admin
            list below — shipped in the same change. */}
        <Row
          label="Send feedback"
          sub="Tell us what is broken or what is missing"
          onClick={() => onView('feedback')}
          right={<ChevronRight size={18} className="text-muted-foreground" />}
        />
        <Row label="About & attributions" onClick={() => setScreen('about')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
        {user?.role === 'admin' && (
          <>
            <Row
              label="Feedback inbox"
              sub="What users have reported"
              onClick={() => onView('feedback-admin')}
              right={<ChevronRight size={18} className="text-muted-foreground" />}
            />
            <Row label="Admin" sub="User management" onClick={() => router.push('/admin')} right={<ChevronRight size={18} className="text-muted-foreground" />} />
          </>
        )}
      </Group>

      <Group title="Session">
        <Row
          label="Log out"
          danger
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
        />
      </Group>
    </Panel>
  );
}
