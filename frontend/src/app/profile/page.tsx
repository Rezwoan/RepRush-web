'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Save, Key, LogOut, Download, Ruler, Weight } from 'lucide-react';
import { usersApi, workoutsApi, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getInitials, epley1RM } from '@/lib/utils';
import OnboardingBanner from '@/components/layout/onboarding-banner';
import { PageTransition, Item } from '@/components/ui/motion-primitives';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { refresh, logout } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [prs, setPRs] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', heightCm: '', weightKg: '' });
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwaInstallable, setPwaInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    usersApi.getProfile().then((r) => {
      setProfile(r.data);
      setForm({ name: r.data.name || '', heightCm: r.data.heightCm || '', weightKg: r.data.weightKg || '' });
    });
    workoutsApi.getPRs().then((r) => setPRs(r.data));
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); setPwaInstallable(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await usersApi.updateProfile({
        name: form.name,
        heightCm: form.heightCm ? parseFloat(form.heightCm) : undefined,
        weightKg: form.weightKg ? parseFloat(form.weightKg) : undefined,
      });
      await refresh();
      setEditing(false);
      usersApi.getProfile().then((r) => setProfile(r.data));
    } finally { setSaving(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await usersApi.uploadImage(reader.result as string);
      await refresh();
      usersApi.getProfile().then((r) => setProfile(r.data));
    };
    reader.readAsDataURL(file);
  };

  const changePassword = async () => {
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('Minimum 8 characters'); return; }
    try {
      await authApi.changePassword(pwForm.oldPassword, pwForm.newPassword);
      setPwSuccess(true);
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e: any) {
      setPwError(e?.response?.data?.message || 'Failed to change password');
    }
  };

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') { setPwaInstallable(false); setDeferredPrompt(null); }
  };

  const handleLogout = async () => { await logout(); router.replace('/login'); };

  const bigThreePRs = ['bench', 'squat', 'deadlift'].map((type) => ({
    type,
    pr: prs.filter((p) => p.exerciseType === type && p.isCurrentSeason).sort((a: any, b: any) => b.weightKg - a.weightKg)[0],
  }));

  if (!profile) return <div className="flex items-center justify-center h-64"><div className="loader-ring" /></div>;

  return (
    <PageTransition className="space-y-5 max-w-2xl mx-auto">
      <OnboardingBanner />
      <h1 className="text-2xl font-display font-extrabold tracking-tight">Profile</h1>

      {/* Profile card */}
      <Item standalone>
        <Card className="p-6" interactive>
          <div className="flex items-start gap-5">
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-brand-gradient flex items-center justify-center text-white font-display font-bold text-2xl overflow-hidden shadow-glow-brand">
                {profile.profileImage ? <img src={profile.profileImage} alt="avatar" className="w-full h-full object-cover" /> : getInitials(profile.name || profile.email)}
              </div>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-volt-gradient rounded-full flex items-center justify-center shadow-lg">
                <Camera size={13} className="text-volt-900" />
              </motion.button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

            <div className="flex-1">
              {editing ? (
                <div className="space-y-2">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="field" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Ruler size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} placeholder="Height (cm)" type="number" className="field pl-8" />
                    </div>
                    <div className="relative">
                      <Weight size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} placeholder="Weight (kg)" type="number" step="0.5" className="field pl-8" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveProfile} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xl font-display font-bold">{profile.name || 'No name set'}</p>
                  <p className="text-muted-foreground text-sm">{profile.email}</p>
                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground nums">
                    {profile.heightCm && <span className="flex items-center gap-1"><Ruler size={13} /> {profile.heightCm} cm</span>}
                    {profile.weightKg && <span className="flex items-center gap-1"><Weight size={13} /> {profile.weightKg} kg</span>}
                  </div>
                  <button onClick={() => setEditing(true)} className="text-brand-400 text-sm mt-2 hover:text-brand-300 transition-colors">Edit profile</button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </Item>

      {/* PRs */}
      <Item standalone>
        <Card className="p-5" interactive>
          <CardHeader accent="volt" title="Personal Records" />
          <div className="grid grid-cols-3 gap-3">
            {bigThreePRs.map(({ type, pr }) => (
              <div key={type} className="text-center p-3 bg-secondary/50 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">{type}</p>
                {pr ? (
                  <>
                    <p className="text-xl font-display font-bold text-volt-400 nums">{pr.weightKg} kg</p>
                    <p className="text-xs text-muted-foreground mt-0.5 nums">× {pr.reps} · ~{epley1RM(pr.weightKg, pr.reps)} 1RM</p>
                  </>
                ) : <p className="text-muted-foreground text-xl font-bold">—</p>}
              </div>
            ))}
          </div>
        </Card>
      </Item>

      {/* Change password */}
      <Item standalone>
        <Card className="p-5">
          <CardHeader icon={<Key size={16} />} title="Change Password" />
          <AnimatePresence>
            {pwSuccess && <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-success text-sm mb-3">Password changed successfully.</motion.p>}
            {pwError && <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-destructive text-sm mb-3">{pwError}</motion.p>}
          </AnimatePresence>
          <div className="space-y-2">
            <input type="password" value={pwForm.oldPassword} onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })} placeholder="Current password" className="field" />
            <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="New password" className="field" />
            <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} placeholder="Confirm new password" className="field" />
            <Button variant="secondary" size="sm" onClick={changePassword}>Update Password</Button>
          </div>
        </Card>
      </Item>

      {/* PWA install */}
      <AnimatePresence>
        {pwaInstallable && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Card className="p-5">
              <div className="flex items-center gap-4">
                <img src="/icon.png" alt="RepRush" className="w-12 h-12 rounded-2xl flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Install RepRush</p>
                  <p className="text-xs text-muted-foreground">Add to your home screen for the full app experience</p>
                </div>
                <Button size="sm" onClick={installPWA}><Download size={14} /> Install</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout */}
      <motion.button whileTap={{ scale: 0.98 }} onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 text-muted-foreground border border-border rounded-2xl hover:border-destructive/40 hover:text-destructive hover:bg-destructive/5 transition-colors text-sm font-medium">
        <LogOut size={16} /> Sign out
      </motion.button>
    </PageTransition>
  );
}
