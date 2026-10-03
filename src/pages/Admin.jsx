import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorState, Tabs, Field } from '../components/ui';
import { fmtWAT } from '../lib/time';

function Overview({ ov, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rollover = async (force) => {
    if (force && !window.confirm('Void every unplayed fixture and start the next season now?')) return;
    setBusy(true);
    try { const { data } = await api.post('/admin/season/next', { force }); toast(`Season ${data.season} created`, 'success'); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="glass p-4"><p className="text-xs text-slate-300">Season</p><p className="num text-3xl text-gold">{ov.season?.number}</p><p className="text-xs text-slate-400">Starts {ov.season && fmtWAT(ov.season.startsAt)}</p></div>
        <div className="glass p-4"><p className="text-xs text-slate-300">Live match runners</p><p className="num text-3xl text-pitch">{ov.liveRunners}</p></div>
        <div className="glass p-4"><p className="text-xs text-slate-300">Waitlist</p><p className="num text-3xl">{ov.waitlist}</p></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {ov.slots.map((s) => (
          <div key={s.tier} className="glass p-4"><p className="font-display text-lg">APEX League {s.tier}</p><p className="text-sm text-slate-300 mt-1">{s.humans} human · {s.ai} AI · <b className="text-pitch">{s.free} free slot{s.free === 1 ? '' : 's'}</b></p></div>
        ))}
      </div>
      <div className="glass p-4">
        <p className="font-display text-lg mb-2">Season controls</p>
        <p className="text-sm text-slate-300 mb-3">The cron job rolls the season over automatically after gameweek 38. Use this if it missed.</p>
        <div className="flex flex-wrap gap-2"><button className="btn btn-gold" disabled={busy} onClick={() => rollover(false)}>Run next-season job</button><button className="btn btn-danger" disabled={busy} onClick={() => rollover(true)}>Force (void unplayed games)</button></div>
      </div>
      <div className="glass p-4"><p className="font-display text-lg mb-2">Forfeits ({ov.forfeits.length})</p>{ov.forfeits.length === 0 ? <p className="text-sm text-slate-300">No forfeits this season.</p> : <ul className="text-sm space-y-1">{ov.forfeits.map((c) => <li key={c._id}>{c.displayName} · League {c.leagueTier}</li>)}</ul>}</div>
      <div className="glass p-4"><p className="font-display text-lg mb-2">Live fixtures</p>{ov.liveFixtures.length === 0 ? <p className="text-sm text-slate-300">None right now.</p> : <ul className="text-sm space-y-1">{ov.liveFixtures.map((f) => <li key={f._id}>League {f.leagueTier} GW{f.gameweek} · {f.running ? <span className="text-pitch">running</span> : <span className="text-rose-300">no runner (crashed?)</span>}</li>)}</ul>}</div>
      <div className="glass p-4"><p className="font-display text-lg mb-2">AI clubs ({ov.ai.length})</p><div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-200 max-h-64 scroll-y">{ov.ai.map((c) => <p key={c._id}>L{c.leagueTier} · {c.displayName}</p>)}</div></div>
    </div>
  );
}

const FIELDS = ['name', 'position', 'ovr', 'pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical', 'stamina', 'skillMoves', 'age'];
function Players() {
  const toast = useToast();
  const [clubs, setClubs] = useState([]);
  const [cid, setCid] = useState('');
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);
  useEffect(() => { api.get('/admin/clubs').then(({ data }) => setClubs(data.clubs)).catch((e) => toast(errMsg(e), 'error')); }, []); // eslint-disable-line
  const pick = (id) => { setCid(id); setEdit(null); if (id) api.get(`/admin/clubs/${id}/players`).then(({ data }) => setList(data.players)).catch((e) => toast(errMsg(e), 'error')); };
  const save = async () => {
    try { const { data } = await api.put(`/admin/players/${edit._id}`, edit); setList((l) => l.map((p) => (p._id === data.player._id ? data.player : p))); setEdit(null); toast('Player updated', 'success'); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <div className="space-y-4">
      <Field label="Club"><select className="input" value={cid} onChange={(e) => pick(e.target.value)}><option value="">Select a club</option>{clubs.map((c) => <option key={c._id} value={c._id}>L{c.leagueTier} · {c.displayName}{c.isAI ? ' (AI)' : ''}</option>)}</select></Field>
      {edit && (
        <div className="glass p-4">
          <p className="font-display text-lg mb-3">Edit {edit.name}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{FIELDS.map((f) => <Field key={f} label={f}><input className="input" value={edit[f] ?? ''} onChange={(e) => setEdit({ ...edit, [f]: e.target.value })} /></Field>)}</div>
          <div className="flex gap-2 mt-4"><button className="btn btn-gold" onClick={save}>Save player</button><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      <div className="glass overflow-hidden">{list.map((p) => (
        <button key={p._id} onClick={() => setEdit({ ...p })} className="w-full flex items-center gap-3 px-4 py-2.5 border-t border-white/5 first:border-0 hover:bg-white/5 text-left min-h-[48px]">
          <span className="num w-8 text-gold text-lg">{p.ovr}</span><span className="flex-1 font-semibold text-sm truncate">{p.name}</span><span className="text-xs text-slate-300">{p.position}</span>
        </button>
      ))}{!list.length && <p className="p-5 text-sm text-slate-300">Choose a club to edit its players.</p>}</div>
    </div>
  );
}

function Fixtures() {
  const toast = useToast();
  const [status, setStatus] = useState('live');
  const [list, setList] = useState(null);
  const [score, setScore] = useState({});
  const load = useCallback(() => api.get('/admin/fixtures', { params: { status } }).then(({ data }) => setList(data.fixtures)).catch((e) => toast(errMsg(e), 'error')), [status]); // eslint-disable-line
  useEffect(() => { setList(null); load(); }, [load]);
  const force = async (f) => {
    const s = score[f.id] || {};
    if (!window.confirm('Force this result? Only use it to repair a crashed match.')) return;
    try { await api.post(`/admin/fixtures/${f.id}/force`, { home: Number(s.h ?? 0), away: Number(s.a ?? 0) }); toast('Result forced', 'success'); load(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  return (
    <div className="space-y-4">
      <Tabs value={status} onChange={setStatus} tabs={['live', 'scheduled', 'finished'].map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      {!list ? <Spinner /> : list.length === 0 ? <p className="text-sm text-slate-300">No {status} fixtures.</p> : (
        <div className="glass overflow-hidden">{list.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-white/5 first:border-0">
            <span className="num text-slate-300 w-14">L{f.tier} GW{f.gw}</span>
            <span className="flex-1 min-w-[200px] text-sm font-semibold">{f.home.displayName} v {f.away.displayName}{f.result && <b className="text-gold"> {f.result.h}-{f.result.a}</b>}</span>
            <input className="input !w-16 !min-h-[40px] text-center" inputMode="numeric" placeholder="H" onChange={(e) => setScore({ ...score, [f.id]: { ...score[f.id], h: e.target.value } })} aria-label="Home goals" />
            <input className="input !w-16 !min-h-[40px] text-center" inputMode="numeric" placeholder="A" onChange={(e) => setScore({ ...score, [f.id]: { ...score[f.id], a: e.target.value } })} aria-label="Away goals" />
            <button className="btn btn-danger !min-h-[40px]" onClick={() => force(f)}>Force result</button>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function Settings({ ov, reload }) {
  const toast = useToast();
  const [link, setLink] = useState(ov.whatsappLink || '');
  const save = async (e) => {
    e.preventDefault();
    try { await api.put('/admin/config', { whatsappLink: link }); toast('WhatsApp link saved', 'success'); reload(); } catch (er) { toast(errMsg(er), 'error'); }
  };
  return (
    <form onSubmit={save} className="glass p-5 max-w-xl space-y-3">
      <Field label="WhatsApp managers group link" hint="Shown to every manager as an icon in the top bar. Leave empty to hide it."><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/..." /></Field>
      <button className="btn btn-gold">Save link</button>
    </form>
  );
}

export default function Admin() {
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');
  const load = useCallback(() => api.get('/admin/overview').then(({ data }) => setOv(data)).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!ov) return <Spinner label="Loading admin" />;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Admin</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'players', label: 'Players' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'settings', label: 'Settings' }]} />
      {tab === 'overview' && <Overview ov={ov} reload={load} />}
      {tab === 'players' && <Players />}
      {tab === 'fixtures' && <Fixtures />}
      {tab === 'settings' && <Settings ov={ov} reload={load} />}
    </div>
  );
}
