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
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// navigator.serviceWorker.ready can hang indefinitely if the worker is stuck
// installing. Register explicitly and race `ready` against a timeout, falling
// back to whatever registration we have (pushManager works on it regardless).
async function getRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const ready = navigator.serviceWorker.ready;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const winner = await Promise.race([ready, timeout]);
    return (winner as ServiceWorkerRegistration) || reg || null;
  } catch (e) {
    console.error('SW registration failed', e);
    return null;
  }
}

export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    const { data } = await pushApi.getVapid();
    if (!data?.publicKey) return { ok: false, reason: 'not-configured' };

    const reg = await getRegistration();
    if (!reg || !reg.pushManager) return { ok: false, reason: 'error' };

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
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    console.error(e);
  }
}
