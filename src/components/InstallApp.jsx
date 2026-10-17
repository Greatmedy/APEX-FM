import { useState } from 'react';
import { useInstall } from '../lib/install';

const DISMISS_KEY = 'apex_install_dismissed';
const recentlyDismissed = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < 7 * 864e5; } catch { return false; } };

/** Step-by-step help for browsers that cannot show the install prompt themselves. */
export function InstallHelp({ onClose, ios }) {
  const steps = ios
    ? ['Open APEX FM in Safari.', 'Tap the Share button (the square with an arrow) at the bottom of the screen.', 'Scroll down and tap "Add to Home Screen".', 'Keep the name "APEX FM" and tap Add.']
    : ['Open the browser menu (the three dots).', 'Tap "Install app" or "Add to Home screen".', 'Confirm. APEX FM appears on your home screen with its logo.'];
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end sm:place-items-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label="Add APEX FM to your home screen" onClick={onClose}>
      <div className="glass-deep w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1.25rem, var(--safe-b, 0px))' }}>
        <div className="flex items-center gap-3 mb-3">
          <img src="/icons/icon-192.png" alt="" className="w-14 h-14 rounded-2xl" />
          <div><p className="font-display text-xl leading-none">APEX FM</p><p className="text-xs text-slate-300 mt-1">Add it to your home screen</p></div>
        </div>
        <ol className="space-y-2 text-sm list-decimal pl-5">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <button className="btn btn-gold w-full mt-4" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/** Profile-menu entry. Hidden once the app is installed. */
export function InstallMenuItem({ onDone }) {
  const inst = useInstall();
  const [help, setHelp] = useState(false);
  if (inst.installed) return null;
  const go = async () => { const r = await inst.install(); if (r === 'manual') setHelp(true); else onDone?.(); };
  return (
    <>
      <button className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 text-sm font-semibold text-pitch" onClick={go}>Install app</button>
      {help && <InstallHelp ios={inst.ios} onClose={() => { setHelp(false); onDone?.(); }} />}
    </>
  );
}

/** One-line banner, shown only when installing is actually possible and the user has not waved it away this week. */
export function InstallBanner() {
  const inst = useInstall();
  const [gone, setGone] = useState(recentlyDismissed);
  const [help, setHelp] = useState(false);
  if (inst.installed || gone || !(inst.canPrompt || inst.ios)) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ } setGone(true); };
  const go = async () => { const r = await inst.install(); if (r === 'manual') setHelp(true); else if (r === 'accepted') setGone(true); };
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-3">
      <div className="glass flex items-center gap-3 p-3" role="region" aria-label="Install APEX FM">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <p className="text-sm flex-1 min-w-0"><b>Add APEX FM to your home screen</b><span className="block text-xs text-slate-300">Opens full screen like an app.</span></p>
        <button className="btn btn-gold !min-h-[40px] !px-4 text-sm" onClick={go}>{inst.canPrompt ? 'Install' : 'How'}</button>
        <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>
      {help && <InstallHelp ios={inst.ios} onClose={() => setHelp(false)} />}
    </div>
  );
}
