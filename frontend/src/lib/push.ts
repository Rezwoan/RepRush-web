import { pushApi } from './api';

export type PushResult = { ok: boolean; reason?: 'unsupported' | 'denied' | 'not-configured' | 'error' };

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    const { data } = await pushApi.getVapid();
    if (!data?.publicKey) return { ok: false, reason: 'not-configured' };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }
    await pushApi.subscribe(sub.toJSON());
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, reason: 'error' };
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.error(e);
  }
}
