import api from './api';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/** Public key from the server; null when push is not configured there. */
export async function pushKey() { try { return (await api.get('/push/key')).data.key || null; } catch { return null; } }

/** Subscribe this device and register it on the signed-in account. Safe to call repeatedly. */
export async function syncSubscription() {
  const key = await pushKey();
  if (!key || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return true;
}

/** Must be called from a tap. Resolves 'granted' | 'denied' | 'default' | 'unavailable'. */
export async function enablePush() {
  if (!pushSupported() || !(await pushKey())) return 'unavailable';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') await syncSubscription().catch(() => {});
  return perm;
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* nothing to remove */ }
}
