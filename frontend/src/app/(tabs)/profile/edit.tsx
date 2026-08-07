'use client';
/**
 * Edit Profile (SPEC §9) — a live preview of the header, cosmetic pickers over
 * what you own, then the display info.
 *
 * The preview is the real `ProfileHeaderCard`, not a copy of it: a preview that
 * can disagree with the thing it previews is worse than none.
 */
import { useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { profileApi, usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { AVATARS } from '@/app/welcome/config';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ImageCropper } from '@/components/ui/image-cropper';
import { Mascot, type MascotPose } from '@/components/art/mascot';
import { cn } from '@/lib/utils';
import { ProfileHeaderCard } from './header';
import { Panel } from './panel';
import type { Cosmetic, Overview } from './types';

type Picker = 'avatar' | 'title' | 'border' | 'banner' | null;

export function EditProfile({
  data,
  onBack,
  onSaved,
}: {
  data: Overview;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { refresh } = useAuth();
  const [header, setHeader] = useState(data.header);
  const [name, setName] = useState(data.header.name ?? '');
  const [username, setUsername] = useState(data.header.username ?? '');
  const [bio, setBio] = useState(data.header.bio ?? '');
  const [picker, setPicker] = useState<Picker>(null);
  const [owned, setOwned] = useState<Cosmetic[] | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openPicker = async (p: Picker) => {
    setPicker(p);
    if (p && p !== 'avatar' && !owned) {
      const res = await profileApi.store().catch(() => null);
      setOwned(res?.data.items ?? []);
    }
  };

  const equip = async (c: Cosmetic) => {
    setHeader({ ...header, cosmetics: { ...header.cosmetics, [c.kind]: c } });
    setPicker(null);
    await profileApi.update({ [`${c.kind}Id`]: c.id }).catch(() => {});
    onSaved();
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await profileApi.update({ name, username, bio });
      await refresh();
      onSaved();
      onBack();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not save.');
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Edit profile"
      onBack={onBack}
      action={
        <button onClick={save} disabled={busy} aria-label="Save" className="press text-primary">
          <Check size={24} />
        </button>
      }
    >
      <div className="space-y-4">
        <ProfileHeaderCard header={header} level={data.levels.level} />

        <div className="grid grid-cols-2 gap-2">
          <Button variant="chunkyLight" className="col-span-2" onClick={() => openPicker('avatar')}>
            Avatar
          </Button>
          <label className="press flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card py-3 font-bold">
            <Camera size={16} /> Picture
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCropSrc(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <Button variant="chunkyLight" onClick={() => openPicker('title')}>
            Title
          </Button>
          <Button variant="chunkyLight" onClick={() => openPicker('border')}>
            Border
          </Button>
          <Button variant="chunkyLight" onClick={() => openPicker('banner')}>
            Banner
          </Button>
        </div>

        <section className="surface space-y-3 p-4">
          <h2 className="font-extrabold">Display info</h2>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Username
            </span>
            <div className="flex items-center rounded-2xl border-2 border-border bg-card px-4 focus-within:border-primary">
              <span className="font-bold text-muted-foreground">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                className="w-full bg-transparent py-3 pl-1 font-semibold outline-none"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Display name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Bio
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 200))}
              rows={3}
              className="w-full resize-none rounded-2xl border-2 border-border bg-card px-4 py-3 font-semibold outline-none focus:border-primary"
            />
            <span className="nums mt-1 block text-right text-xs text-muted-foreground">
              {bio.length}/200
            </span>
          </label>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <Button variant="chunky" size="cta" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {header.username && (
            <Button
              variant="chunkyOutline"
              onClick={() => window.open(`/u/${header.username}`, '_blank')}
            >
              Preview public profile
            </Button>
          )}
        </section>
      </div>

      <Sheet open={picker === 'avatar'} onOpenChange={() => setPicker(null)} title="Pick an avatar">
        <div className="grid grid-cols-3 gap-3 pb-2">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              onClick={async () => {
                setHeader({ ...header, avatarId: a.id, profileImage: null });
                setPicker(null);
                await profileApi.update({ avatarId: a.id }).catch(() => {});
                onSaved();
              }}
              className={cn(
                'press grid place-items-center rounded-2xl border-2 p-3',
                header.avatarId === a.id ? 'border-primary bg-primary/10' : 'border-border bg-card',
              )}
            >
              <Mascot pose={a.id as MascotPose} size={56} />
              <span className="mt-1 text-xs font-bold">{a.label}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={picker !== null && picker !== 'avatar'}
        onOpenChange={() => setPicker(null)}
        title={`Pick a ${picker ?? ''}`}
      >
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pb-2">
          {(owned ?? [])
            .filter((c) => c.kind === picker)
            .map((c) => (
              <button
                key={c.id}
                disabled={!c.owned}
                onClick={() => equip(c)}
                className={cn(
                  'press flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left',
                  header.cosmetics[c.kind]?.id === c.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card',
                  !c.owned && 'opacity-50',
                )}
              >
                <span className="h-9 w-16 shrink-0 rounded-lg" style={{ background: c.paint }} />
                <span className="flex-1 font-bold">{c.label}</span>
                {!c.owned && <span className="nums text-sm font-bold">{c.price} 🥚</span>}
              </button>
            ))}
          {owned === null && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        </div>
      </Sheet>

      {cropSrc && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4">
          <ImageCropper
            src={cropSrc}
            busy={busy}
            onCancel={() => setCropSrc(null)}
            onConfirm={async (base64) => {
              setBusy(true);
              try {
                const res = await usersApi.uploadImage(base64);
                setHeader({ ...header, profileImage: res.data?.profileImage ?? base64 });
                await refresh();
                onSaved();
              } catch {
                setError('Could not upload that picture.');
              }
              setBusy(false);
              setCropSrc(null);
            }}
          />
        </div>
      )}
    </Panel>
  );
}
