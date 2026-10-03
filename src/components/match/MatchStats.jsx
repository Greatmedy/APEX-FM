import { useState } from 'react';
import { useToast } from '../../context/ToastContext';

const Row = ({ label, h, a, fmt = (x) => x }) => {
  const tot = (Number(h) + Number(a)) || 1;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between text-sm"><span className="num text-lg w-14">{fmt(h)}</span><span className="text-xs font-bold text-slate-300">{label}</span><span className="num text-lg w-14 text-right">{fmt(a)}</span></div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10 mt-1 gap-0.5"><div className="bg-gold" style={{ width: `${(h / tot) * 100}%` }} /><div className="bg-pitch" style={{ width: `${(a / tot) * 100}%` }} /></div>
    </div>
  );
};

export default function MatchStats({ stats, goals, cards, setup, result }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!stats || !setup) return null;
  const nm = (side, id) => (setup[side].lineup.find((p) => p.id === id) || setup[side].bench.find((p) => p.id === id))?.name || 'Unknown';
  const h = stats.h, a = stats.a;
  const text = `APEX FM 2027 · GW${setup.gameweek}\n${setup.h.name} ${result.h} - ${result.a} ${setup.a.name}\n` +
    `${(goals || []).map((g) => `${g.m}' ${g.pn}${g.q ? ` (${g.qn})` : ''}`).join(', ') || 'No goals'}\nPossession ${h.possession}-${a.possession} · Shots ${h.shots}-${a.shots} · xG ${h.xg}-${a.xg}`;
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); toast('Result copied. Paste it in the group.', 'success'); setTimeout(() => setCopied(false), 2000); } catch { toast('Copy failed. Select the text and copy it manually.', 'error'); } };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="glass p-4">
        <div className="flex justify-between font-display text-sm mb-1"><span className="text-gold truncate">{setup.h.short}</span><span className="text-pitch truncate">{setup.a.short}</span></div>
        <Row label="Possession" h={h.possession} a={a.possession} fmt={(x) => x + '%'} />
        <Row label="Shots" h={h.shots} a={a.shots} />
        <Row label="On target" h={h.sot} a={a.sot} />
        <Row label="Passes" h={h.passes} a={a.passes} />
        <Row label="Fouls" h={h.fouls} a={a.fouls} />
        <Row label="Penalties" h={h.penalties} a={a.penalties} />
        <Row label="Expected goals (APEX xG)" h={h.xg} a={a.xg} fmt={(x) => Number(x).toFixed(2)} />
      </div>
      <div className="space-y-4">
        <div className="glass p-4">
          <p className="font-display text-lg mb-2">Goals and assists</p>
          {(goals || []).length === 0 ? <p className="text-sm text-slate-300">No goals.</p> : (
            <ul className="space-y-2">{goals.map((g, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="num w-9 text-slate-300">{g.m}'</span><span><b>{g.pn}</b> <span className="text-slate-400">({setup[g.t].short}){g.pen ? ' pen' : ''}</span>{g.qn && <span className="block text-xs text-slate-300">Assist: {g.qn}</span>}</span></li>
            ))}</ul>
          )}
        </div>
        <div className="glass p-4">
          <p className="font-display text-lg mb-2">Cards</p>
          {(cards || []).length === 0 ? <p className="text-sm text-slate-300">No cards.</p> : (
            <ul className="space-y-1.5">{cards.map((c, i) => (
              <li key={i} className="flex items-center gap-3 text-sm"><span className="num w-9 text-slate-300">{c.m}'</span><span className={`inline-block w-3 h-4 rounded-sm ${c.c === 'r' ? 'bg-danger' : 'bg-yellow-400'}`} /><span>{nm(c.t, c.p)} <span className="text-slate-400">({setup[c.t].short})</span></span></li>
            ))}</ul>
          )}
        </div>
        <button className="btn btn-ghost w-full" onClick={copy}>{copied ? 'Copied' : 'Copy result card'}</button>
      </div>
    </div>
  );
}
