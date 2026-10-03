import { useEffect, useMemo, useState } from 'react';
import { useClub } from '../context/ClubContext';
import { useToast } from '../context/ToastContext';
import api, { errMsg } from '../lib/api';
import { FORMATIONS, FORMATION_IDS, STYLES, autoPick, teamOvr } from '../lib/formations';
import { STYLE_LABEL } from '../components/util';
import { Spinner, ErrorState } from '../components/ui';
import PlayerPortrait from '../components/PlayerPortrait';

const STYLE_HELP = { balanced: 'No bias. Solid everywhere.', possession: 'Keep the ball, fewer risks, slower tempo.', counter: 'Sit deep, hit quickly in transition.', press: 'Win it high. Costs stamina, leaves gaps.', park: 'Defend in numbers. Few chances either way.' };

export default function Tactics() {
  const { club, players, loading, error, refresh } = useClub();
  const toast = useToast();
  const [formation, setFormation] = useState('4-3-3');
  const [style, setStyle] = useState('balanced');
  const [lineup, setLineup] = useState([]);
  const [bench, setBench] = useState([]);
  const [captain, setCaptain] = useState(null);
  const [sel, setSel] = useState(null); // {t:'xi'|'bench', i}
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!club || !players) return;
    const t = club.tactics || {};
    const ids = new Set(players.map((p) => String(p._id)));
    const okXI = t.lineup?.length === 11 && t.lineup.every((x) => ids.has(String(x)));
    const f = FORMATIONS[t.formation] ? t.formation : '4-3-3';
    if (okXI) { setLineup(t.lineup.map(String)); setBench((t.bench || []).map(String).filter((x) => ids.has(x))); }
    else { const a = autoPick(players, f); setLineup(a.lineup.map((p) => String(p._id))); setBench(a.bench.map((p) => String(p._id))); }
    setFormation(f); setStyle(t.style || 'balanced'); setCaptain(t.captain ? String(t.captain) : null); setDirty(false);
  }, [club, players]);

  const byId = useMemo(() => new Map((players || []).map((p) => [String(p._id), p])), [players]);
  if (error && !club) return <ErrorState message={error} onRetry={refresh} />;
  if (!club || loading || lineup.length !== 11) return <Spinner label="Loading tactics" />;

  const slots = FORMATIONS[formation];
  const used = new Set([...lineup, ...bench]);
  const rest = players.filter((p) => !used.has(String(p._id)));
  const xi = lineup.map((id) => byId.get(id));
  const mark = () => setDirty(true);

  const changeFormation = (f) => {
    const a = autoPick(xi, f);
    setFormation(f); setLineup(a.lineup.map((p) => String(p._id))); setSel(null); mark();
  };
  // place a player id into target; swaps when the player already sits elsewhere
  const place = (target, pid) => {
    const L = [...lineup], B = [...bench];
    const get = (t) => (t.t === 'xi' ? L[t.i] : B[t.i]);
    const set = (t, v) => { if (t.t === 'xi') L[t.i] = v; else B[t.i] = v; };
    const old = get(target);
    let from = null;
    if (L.includes(pid)) from = { t: 'xi', i: L.indexOf(pid) }; else if (B.includes(pid)) from = { t: 'bench', i: B.indexOf(pid) };
    if (target.t === 'xi') {
      const gk = slots[target.i][0] === 'GK';
      const incomingGK = byId.get(pid).position === 'GK';
      if (gk !== incomingGK) { toast(gk ? 'The goalkeeper slot needs a goalkeeper.' : 'Only the goalkeeper slot can hold a goalkeeper.', 'error'); return; }
    }
    if (from && from.t === 'xi' && !old) { toast('Your XI needs 11 players. Swap with a bench player instead.', 'error'); return; }
    if (from) {
      if (from.t === 'xi' && target.t === 'bench' && slots[from.i][0] === 'GK' && old && byId.get(old).position !== 'GK') { toast('Swap goalkeepers with goalkeepers.', 'error'); return; }
      if (from.t === 'xi' && target.t === 'xi' && (slots[from.i][0] === 'GK') !== (slots[target.i][0] === 'GK')) { toast('The goalkeeper slot needs a goalkeeper.', 'error'); return; }
      set(from, old);
    }
    set(target, pid);
    const nb = B.filter(Boolean);
    setLineup(L.filter(Boolean).length === 11 ? L : lineup); setBench(nb.slice(0, 7)); mark();
  };
  const tapSlot = (t) => {
    if (!sel) { setSel(t); return; }
    if (sel.t === t.t && sel.i === t.i) { setSel(null); return; }
    const a = sel.t === 'xi' ? lineup[sel.i] : bench[sel.i];
    if (a) place(t, a); else toast('Pick a player from the squad list to fill that slot.', 'info');
    setSel(null);
  };
  const tapPlayer = (pid) => {
    if (sel) { place(sel, pid); setSel(null); }
    else toast('Tap a pitch or bench slot first, then tap a player. You can also drag.', 'info');
  };
  const addBench = (pid) => { if (bench.length < 7) { setBench([...bench, pid]); mark(); } else toast('The bench holds 7 players. Select a bench slot to swap.', 'error'); };
  const onDrop = (target, e) => { e.preventDefault(); const pid = e.dataTransfer.getData('text/plain'); if (pid && byId.has(pid)) place(target, pid); setSel(null); };
  const drag = (pid) => (e) => { e.dataTransfer.setData('text/plain', pid); };

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/tactics', { formation, style, lineup, bench, captain: captain && lineup.includes(captain) ? captain : lineup[0] });
      toast('Tactics saved. They apply at kickoff.', 'success'); setDirty(false); refresh();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const avail = (p) => !(p.injuredFor > 0 || p.suspendedFor > 0);
  const ovr = teamOvr(xi);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl">Tactics</h1><p className="text-sm text-slate-300">Best XI average <b className="text-gold num text-lg">{ovr}</b>. Saved tactics are used at kickoff. You can change style and substitutions live.</p></div>
        <button className="btn btn-gold" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving' : dirty ? 'Save tactics' : 'Saved'}</button>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="glass p-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Formation">
            {FORMATION_IDS.map((f) => <button key={f} role="radio" aria-checked={f === formation} onClick={() => changeFormation(f)} className={`btn !min-h-[44px] num text-lg ${f === formation ? 'btn-gold' : 'btn-ghost'}`}>{f}</button>)}
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-white/15" style={{ aspectRatio: '3 / 4', background: 'repeating-linear-gradient(0deg,#0d5c36 0 9.09%,#0f6a3e 9.09% 18.18%)' }}>
            <div className="absolute inset-3 border-2 border-white/60 rounded-sm pointer-events-none" />
            <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/60 pointer-events-none" />
            <div className="absolute left-1/2 top-1/2 w-24 h-24 -ml-12 -mt-12 border-2 border-white/60 rounded-full pointer-events-none" />
            <div className="absolute left-[24%] right-[24%] bottom-3 h-[15%] border-2 border-white/60 border-b-0 pointer-events-none" />
            <div className="absolute left-[24%] right-[24%] top-3 h-[15%] border-2 border-white/60 border-t-0 pointer-events-none" />
            {slots.map((s, i) => {
              const p = xi[i];
              const x = s[2] * 100, y = 100 - s[1] * 100 * 0.93 - 2;
              const on = sel?.t === 'xi' && sel.i === i;
              return (
                <button key={i} onClick={() => tapSlot({ t: 'xi', i })} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop({ t: 'xi', i }, e)} draggable={!!p} onDragStart={p && drag(String(p._id))}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[72px] min-h-[44px]" style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${s[0]} slot, ${p?.name}`}>
                  <span className={`relative rounded-full ${on ? 'ring-4 ring-pitch' : 'ring-2 ring-white/70'} ${p && !avail(p) ? 'opacity-50' : ''}`}>
                    <PlayerPortrait seed={p.portraitSeed} name={p.name} shirt={club.kit.shirt} size={46} round />
                    <span className="absolute -top-1 -right-2 num text-[11px] bg-gold text-ink rounded-md px-1 font-bold">{p.ovr}</span>
                    {captain === String(p._id) && <span className="absolute -bottom-1 -left-1 chip bg-ink text-gold border border-gold !min-w-[18px] !h-[18px]">C</span>}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold bg-ink/80 rounded px-1 truncate max-w-full">{p.name.split(' ').slice(-1)[0]}</span>
                  <span className="text-[9px] font-bold text-white/80">{s[0]}</span>
                </button>
              );
            })}
          </div>
          <div className="glass p-3">
            <p className="text-xs font-bold text-slate-300 mb-2">Substitutes ({bench.length}/7)</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => {
                const p = byId.get(bench[i]);
                const on = sel?.t === 'bench' && sel.i === i;
                return (
                  <button key={i} onClick={() => (p || !sel ? tapSlot({ t: 'bench', i }) : toast('Pick a player from the squad list to fill an empty bench slot.', 'info'))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => p && onDrop({ t: 'bench', i }, e)}
                    draggable={!!p} onDragStart={p && drag(String(p._id))} className={`rounded-xl p-1.5 min-h-[76px] flex flex-col items-center justify-center text-center ${p ? 'bg-white/8 border border-white/15' : 'border border-dashed border-white/20'} ${on ? 'ring-2 ring-pitch' : ''}`}>
                    {p ? (<><PlayerPortrait seed={p.portraitSeed} name={p.name} shirt={club.kit.shirt} size={36} round /><span className="text-[10px] font-bold truncate max-w-full mt-0.5">{p.name.split(' ').slice(-1)[0]}</span><span className="text-[10px] text-slate-300">{p.position} · {p.ovr}</span></>) : <span className="text-[10px] text-slate-500">Empty</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="glass p-4">
            <p className="font-display text-lg mb-3">Style of play</p>
            <div className="grid gap-2" role="radiogroup" aria-label="Style of play">
              {STYLES.map((s) => (
                <button key={s} role="radio" aria-checked={style === s} onClick={() => { setStyle(s); mark(); }} className={`text-left rounded-xl px-4 py-3 border transition min-h-[48px] ${style === s ? 'border-gold bg-gold/10' : 'border-white/10 hover:bg-white/5'}`}>
                  <span className="font-bold">{STYLE_LABEL[s]}</span><span className="block text-xs text-slate-300">{STYLE_HELP[s]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="glass p-4">
            <p className="font-display text-lg mb-1">Squad</p>
            <p className="text-xs text-slate-300 mb-3">{sel ? 'Now tap a player to put them in the selected slot.' : 'Tap a slot, then a player. Or drag a player onto a slot.'}</p>
            <ul className="space-y-1.5 max-h-[420px] scroll-y pr-1">
              {[...players].sort((a, b) => b.ovr - a.ovr).map((p) => {
                const id = String(p._id);
                const where = lineup.includes(id) ? 'XI' : bench.includes(id) ? 'Bench' : '';
                return (
                  <li key={id} draggable onDragStart={drag(id)}>
                    <button onClick={() => tapPlayer(id)} className={`w-full flex items-center gap-3 rounded-xl px-2 py-1.5 min-h-[52px] text-left hover:bg-white/10 ${where ? 'bg-white/5' : ''}`}>
                      <PlayerPortrait seed={p.portraitSeed} name={p.name} shirt={club.kit.shirt} size={38} round />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-bold truncate">{p.name}{captain === id && <span className="text-gold"> (C)</span>}</span><span className="block text-[11px] text-slate-300">{p.position} · STA {p.stamina}{!avail(p) && <b className="text-rose-300"> · {p.injuredFor > 0 ? 'Injured' : 'Suspended'}</b>}</span></span>
                      {where && <span className="text-[10px] font-bold text-pitch">{where}</span>}
                      <span className="num text-xl text-gold w-8 text-right">{p.ovr}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {rest.length > 0 && bench.length < 7 && <button className="btn btn-ghost w-full mt-3" onClick={() => addBench(String(rest.sort((a, b) => b.ovr - a.ovr)[0]._id))}>Add best remaining player to bench</button>}
            <div className="mt-3">
              <label className="label" htmlFor="cap">Captain (armband is display only)</label>
              <select id="cap" className="input" value={captain || lineup[0]} onChange={(e) => { setCaptain(e.target.value); mark(); }}>
                {xi.map((p) => <option key={p._id} value={String(p._id)}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
