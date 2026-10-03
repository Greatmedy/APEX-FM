import { useState } from 'react';
import api, { errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { STYLES } from '../../lib/formations';
import { STYLE_LABEL } from '../util';

/** Live-only manager controls: style of play and up to 5 substitutions. Applied from the next event. */
export default function MatchControls({ fixtureId, side, st }) {
  const toast = useToast();
  const S = st.sides[side];
  const [out, setOut] = useState('');
  const [inn, setInn] = useState('');
  const [busy, setBusy] = useState(false);
  const pitch = S.lineup.filter((p) => p.on);
  const left = 5 - S.subsUsed;
  const send = async (path, body, ok) => {
    setBusy(true);
    try { await api.post(`/matches/${fixtureId}/${path}`, body); toast(ok, 'success'); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="glass p-4 space-y-4">
      <div>
        <p className="font-display text-lg tracking-wide mb-2">Style of play</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STYLES.map((s) => (
            <button key={s} disabled={busy || S.style === s} onClick={() => send('style', { style: s }, `${STYLE_LABEL[s]} queued. Applies from the next event.`)} className={`btn !min-h-[44px] text-sm ${S.style === s ? 'btn-gold' : 'btn-ghost'}`}>{STYLE_LABEL[s]}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2"><p className="font-display text-lg tracking-wide">Substitutions</p><span className="text-xs font-bold text-slate-300">{left} of 5 left</span></div>
        {left <= 0 ? <p className="text-sm text-slate-300">All substitutions used.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="label">Off</p>
              <div className="space-y-1 max-h-48 scroll-y pr-1">
                {pitch.map((p) => (
                  <button key={p.id} onClick={() => setOut(p.id)} className={`w-full flex items-center gap-2 px-3 min-h-[44px] rounded-lg text-left text-sm border ${out === p.id ? 'border-danger bg-danger/10' : 'border-white/10 hover:bg-white/5'}`}>
                    <span className="num w-6 text-slate-300">{p.num}</span><span className="flex-1 truncate font-semibold">{p.name}</span>
                    <span className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden"><span className="block h-full" style={{ width: `${p.e}%`, background: p.e > 65 ? '#14F195' : p.e > 40 ? '#E2B657' : '#E11D48' }} /></span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">On</p>
              <div className="space-y-1 max-h-48 scroll-y pr-1">
                {S.bench.map((p) => (
                  <button key={p.id} onClick={() => setInn(p.id)} className={`w-full flex items-center gap-2 px-3 min-h-[44px] rounded-lg text-left text-sm border ${inn === p.id ? 'border-pitch bg-pitch/10' : 'border-white/10 hover:bg-white/5'}`}>
                    <span className="num w-6 text-slate-300">{p.num}</span><span className="flex-1 truncate font-semibold">{p.name}</span><span className="text-xs text-slate-300">{p.pos} · {p.a.ovr}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {left > 0 && <button className="btn btn-gold w-full mt-3" disabled={busy || !out || !inn} onClick={() => send('sub', { out, in: inn }, 'Substitution queued. Applies from the next event.').then(() => { setOut(''); setInn(''); })}>Make substitution</button>}
      </div>
    </div>
  );
}
