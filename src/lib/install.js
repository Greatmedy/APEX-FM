import { useEffect, useState } from 'react';

/* "Add to home screen". Chrome/Edge/Android expose beforeinstallprompt (captured at load because it can fire before React mounts).
 * iOS Safari has no prompt API, so we show instructions instead. */
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const isIOS = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  const installed = isStandalone();
  return {
    installed,
    canPrompt: !!deferred,
    ios: isIOS(),
    /** resolves 'accepted' | 'dismissed' | 'manual' (no native prompt available: show instructions) */
    async install() {
      if (!deferred) return 'manual';
      const e = deferred; deferred = null; notify();
      e.prompt();
      const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
      return outcome;
    },
  };
}
