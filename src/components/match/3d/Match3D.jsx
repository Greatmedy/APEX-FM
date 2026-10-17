import { memo, useEffect, useRef, useState } from 'react';
import { Match3DEngine } from './Match3DEngine';
import { detectQuality } from './webgl';
import { sfx } from '../../../lib/audio';
import { CAMERA_MODES } from './Match3DCamera';

const LS = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const CAM_LABEL = { broadcast: 'Broadcast', tactical: 'Tactical', action: 'Action' };
const WX_LABEL = { auto: 'Auto', sunny: 'Sunny', rainy: 'Rain' };
const TONE = { warn: 'bg-yellow-300 text-ink', freekick: 'bg-sky-500 text-white', goal: 'bg-pitch text-ink', yellow: 'bg-yellow-400 text-ink', red: 'bg-danger text-white', injury: 'bg-rose-700 text-white', sub: 'bg-violet-500 text-white', pen: 'bg-danger/90 text-white', ht: 'bg-gold text-ink', ft: 'bg-gold text-ink', foul: 'bg-orange-500 text-white', offside: 'bg-amber-400 text-ink', corner: 'bg-white/90 text-ink' };

/**
 * Three.js match view. Owns only the visual pitch area; Match.jsx keeps the score, clock, feed, controls and tactics.
 * The engine reads the existing MatchPlayer every frame, so React state is only used for rare UI (buttons, banners).
 */
function Match3D({ player, kits, mode, playing, speed, ads, onFail, className = '' }) {
  const host = useRef(null), engine = useRef(null), wrap = useRef(null), banner = useRef(null);
  const [cam, setCam] = useState(() => LS('apex_cam', 'broadcast'));
  const [wx, setWx] = useState(() => LS('apex_wx', 'auto'));
  const [toast, setToast] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const [full, setFull] = useState('none'); // none | native | pseudo (iPhone Safari has no element fullscreen)
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const latest = useRef({});
  latest.current = { player, kits, mode, playing, speed, ads, cam, wx };

  useEffect(() => {
    let e;
    const L = latest.current;
    try {
      e = new Match3DEngine({
        host: host.current, player: L.player, kits: L.kits, quality: detectQuality(), weather: L.wx, camMode: L.cam, ads: L.ads || [],
        onFail: (m) => onFail?.(m),
        ui: {
          overlay: (o) => { if (o.kind === 'replay') return; clearTimeout(banner.current); setToast(o); banner.current = setTimeout(() => setToast(null), o.kind === 'goal' ? 3600 : o.kind === 'injury' ? 5200 : 2600); },
          sfx: { kick: () => sfx.kick?.(), card: () => sfx.card?.(), sub: () => sfx.sub?.() },
          onReplay: (on) => { setReplaying(on); if (on) setToast(null); },
        },
      });
      e.setTime(L);
    } catch (err) { console.warn('[3D] init failed', err); onFail?.(err?.message || 'WebGL could not start.'); return undefined; }
    engine.current = e;
    return () => { clearTimeout(banner.current); e.dispose(); engine.current = null; };
    // eslint-disable-next-line
  }, []);
  useEffect(() => { const e = engine.current; if (e && player && e.player !== player) e.setPlayer(player, kits); }, [player]); // eslint-disable-line
  useEffect(() => { engine.current?.setKits(kits); }, [kits]);
  useEffect(() => { engine.current?.setTime({ mode, playing, speed }); }, [mode, playing, speed]);
  useEffect(() => { engine.current?.setAds(ads || []); }, [ads]);
  useEffect(() => { engine.current?.setCameraMode(cam); LSset('apex_cam', cam); }, [cam]);
  useEffect(() => { engine.current?.setWeather(wx); LSset('apex_wx', wx); }, [wx]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setFull((f) => (f === 'native' ? 'none' : f)); };
    const onSize = () => setPortrait(window.innerHeight > window.innerWidth);
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('resize', onSize); window.addEventListener('orientationchange', onSize);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); window.removeEventListener('resize', onSize); window.removeEventListener('orientationchange', onSize); };
  }, []);
  // Full screen without native support: lock page scroll while the match covers the screen.
  useEffect(() => {
    if (full !== 'pseudo') return undefined;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [full]);
  const unlock = () => { try { screen.orientation?.unlock?.(); } catch { /* not supported */ } };
  const exitFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
    unlock(); setFull('none');
  };
  /** Android/desktop: real fullscreen + landscape lock. iPhone: cover the screen and rotate the view to landscape ourselves. */
  const enterFull = async () => {
    const el = wrap.current;
    try {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        await req.call(el, { navigationUI: 'hide' });
        setFull('native');
        try { await screen.orientation?.lock?.('landscape'); } catch { /* lock needs fullscreen; ignore if refused */ }
        return;
      }
    } catch { /* fall through to the CSS version */ }
    setFull('pseudo');
  };
  const toggleFull = () => (full === 'none' ? enterFull() : exitFull());
  const pseudoStyle = full === 'pseudo'
    ? (portrait
      ? { position: 'fixed', zIndex: 9999, top: 0, left: 0, width: '100vh', height: '100vw', transformOrigin: 'top left', transform: 'translateX(100vw) rotate(90deg)', borderRadius: 0, background: '#000' }
      : { position: 'fixed', zIndex: 9999, inset: 0, width: '100vw', height: '100vh', borderRadius: 0, background: '#000' })
    : undefined;
  if (pseudoStyle && typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh')) {
    if (portrait) { pseudoStyle.width = '100dvh'; pseudoStyle.height = '100dvw'; pseudoStyle.transform = 'translateX(100dvw) rotate(90deg)'; } else { pseudoStyle.width = '100dvw'; pseudoStyle.height = '100dvh'; }
  }
  const inFull = full !== 'none';
  const teamName = (t) => (t && player?.setup?.[t]?.short) || '';

  return (
    <div ref={wrap} style={pseudoStyle} className={`relative w-full overflow-hidden rounded-xl bg-[#0a1220] ${inFull ? '!rounded-none' : ''} ${full === 'native' ? 'h-screen' : ''} ${className}`}>
      <div ref={host} className={inFull ? 'h-full w-full' : 'aspect-[4/3] sm:aspect-video w-full'} role="img" aria-label="3D match view" />
      <div className="absolute top-2 flex flex-wrap gap-1" style={{ left: 'max(0.5rem, var(--safe-l))' }}>
        {CAMERA_MODES.map((m) => <button key={m} onClick={() => setCam(m)} aria-pressed={cam === m} className={`px-2.5 min-h-[32px] rounded-lg text-[11px] font-bold backdrop-blur ${cam === m ? 'bg-pitch text-ink' : 'bg-ink/70 text-white border border-white/15'}`}>{CAM_LABEL[m]}</button>)}
      </div>
      <div className="absolute top-2 flex gap-1" style={{ right: 'max(0.5rem, var(--safe-r))' }}>
        {Object.keys(WX_LABEL).map((m) => <button key={m} onClick={() => setWx(m)} aria-pressed={wx === m} aria-label={`Weather ${WX_LABEL[m]}`} className={`px-2 min-h-[32px] rounded-lg text-[11px] font-bold backdrop-blur ${wx === m ? 'bg-gold text-ink' : 'bg-ink/70 text-white border border-white/15'}`}>{WX_LABEL[m]}</button>)}
        <button onClick={toggleFull} aria-label="Toggle fullscreen" className="px-2 min-h-[32px] rounded-lg text-[11px] font-bold bg-ink/70 text-white border border-white/15 backdrop-blur">{inFull ? 'Exit' : 'Full'}</button>
      </div>
      {replaying && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[7%] bg-black/80" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-[7%] bg-black/80" />
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[9%] flex items-center gap-2 rounded-md bg-danger px-3 py-1 text-white shadow-lg" role="status" aria-live="polite">
            <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" /><span className="font-display tracking-widest text-lg leading-none">GOAL REPLAY</span>
          </div>
        </>
      )}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3" role="status">
          <div className={`rounded-xl px-4 py-2 text-center shadow-lg ${TONE[toast.kind] || 'bg-ink/90 text-white'} ${toast.kind === 'goal' ? 'scale-110' : ''}`}>
            <p className="font-display tracking-wide text-xl leading-none">{toast.title}{toast.team ? ` · ${teamName(toast.team)}` : ''}</p>
            {toast.sub && <p className="text-xs font-bold mt-1">{toast.sub}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
export default memo(Match3D);
