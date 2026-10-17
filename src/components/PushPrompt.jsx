import { useEffect, useState } from 'react';
import { useInstall } from '../lib/install';
import { enablePush, disablePush, pushPermission, pushSupported, pushKey, syncSubscription } from '../lib/push';
import { useToast } from '../context/ToastContext';

const DISMISS_KEY = 'apex_push_dismissed';
const recentlyDismissed = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 3 * 864e5; } catch { return false; } };

/** Keeps this device registered once permission was granted (e.g. after signing in on a new account). */
export function usePushSync() {
  useEffect(() => { if (pushSupported() && pushPermission() === 'granted') syncSubscription().catch(() => {}); }, []);
}

/** Asks installed-app users (once, on a tap) to switch on the 7:50 PM "set up your team and click Ready" reminder. */
export function PushBanner() {
  const inst = useInstall();
  const toast = useToast();
  const [perm, setPerm] = useState(pushPermission());
  const [gone, setGone] = useState(recentlyDismissed);
  const [avail, setAvail] = useState(false);
  useEffect(() => { pushKey().then((k) => setAvail(!!k)); }, []);
  if (!inst.installed || !avail || perm !== 'default' || gone) return null;
  const go = async () => {
    const r = await enablePush(); setPerm(pushPermission());
    if (r === 'granted') toast('Match reminders are on. You will be notified at 7:50 PM on match days.', 'success');
    else if (r === 'denied') toast('Notifications are blocked. You can allow them in your phone settings for APEX FM.', 'info');
  };
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ } setGone(true); };
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3">
      <div className="glass flex items-center gap-3 p-3" role="region" aria-label="Match reminders">
        <p className="text-sm flex-1 min-w-0"><b>Get a reminder before every match</b><span className="block text-xs text-slate-300">At 7:50 PM we will remind you to set up your team and tap Ready.</span></p>
        <button className="btn btn-gold !min-h-[40px] !px-4 text-sm" onClick={go}>Turn on</button>
        <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={dismiss} aria-label="Not now">✕</button>
      </div>
    </div>
  );
}

/** Profile-menu entry for turning reminders on or off. */
export function PushMenuItem({ onDone }) {
  const toast = useToast();
  const [perm, setPerm] = useState(pushPermission());
  const [avail, setAvail] = useState(false);
  useEffect(() => { pushKey().then((k) => setAvail(!!k)); }, []);
  if (!pushSupported() || !avail) return null;
  const on = perm === 'granted';
  const click = async () => {
    if (on) { await disablePush(); toast('Match reminders turned off on this device.', 'info'); setPerm(pushPermission()); }
    else { const r = await enablePush(); setPerm(pushPermission()); toast(r === 'granted' ? 'Match reminders are on.' : 'Notifications are blocked. Allow them in your phone settings for APEX FM.', r === 'granted' ? 'success' : 'info'); }
    onDone?.();
  };
  return <button className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 text-sm font-semibold" onClick={click}>{on ? 'Turn off match reminders' : 'Turn on match reminders'}</button>;
}
