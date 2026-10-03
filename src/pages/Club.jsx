import { useState } from 'react';
import { useClub } from '../context/ClubContext';
import { useToast } from '../context/ToastContext';
import api, { errMsg } from '../lib/api';
import { Spinner, ErrorState, Stat, FormChips, Tabs } from '../components/ui';
import Crest from '../components/Crest';
import PlayerCard from '../components/PlayerCard';
import { monoOf } from '../components/util';

export default function Club() {
  const { club, players, ovr, rank, record, league, loading, error, refresh } = useClub();
  const toast = useToast();
  const [stadium, setStadium] = useState(null);
  const [kit, setKit] = useState(null);
  const [tab, setTab] = useState('ALL');
  if (error && !club) return <ErrorState message={error} onRetry={refresh} />;
  if (!club || loading) return <Spinner label="Loading your club" />;
  const sName = stadium ?? club.stadiumName;
  const k = kit ?? club.kit;
  const save = async () => {
    try { await api.put('/clubs/me/identity', { stadiumName: sName, kit: k }); toast('Club identity saved', 'success'); setStadium(null); setKit(null); refresh(); } catch (e) { toast(errMsg(e), 'error'); }
  };
  const dirty = stadium !== null || kit !== null;
  const groups = { ALL: null, GK: ['GK'], DEF: ['CB', 'LB', 'RB'], MID: ['CDM', 'CM', 'CAM'], ATT: ['LW', 'RW', 'ST'] };
  const list = players.filter((p) => !groups[tab] || groups[tab].includes(p.position));
  return (
    <div className="space-y-5">
      <div className="glass p-5 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Crest colors={club.crestColors} mono={monoOf(club)} size={84} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight">{club.displayName}</h1>
            <p className="text-sm text-slate-300">{league}{rank ? ` · Rank ${rank}` : ''}</p>
            <div className="mt-2"><FormChips form={club.seasonForm} /></div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:w-80">
          <Stat label="Team OVR" value={ovr} accent="gold" />
          <Stat label="Fans" value={club.fans.toLocaleString()} />
          <Stat label="Points" value={record?.pts ?? 0} accent="pitch" />
        </div>
      </div>
      <div className="glass p-5 grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="stadium">Stadium name</label>
          <input id="stadium" className="input" value={sName} maxLength={40} onChange={(e) => setStadium(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">Opponents visit this ground. Default is the well-known stadium.</p>
        </div>
        <div>
          <p className="label">Jersey colours</p>
          <div className="flex gap-3">
            {[['shirt', 'Shirt'], ['shorts', 'Shorts'], ['number', 'Numbers']].map(([key, lab]) => (
              <label key={key} className="flex-1 text-xs text-slate-300 font-semibold">
                {lab}
                <input type="color" className="block w-full h-11 mt-1 rounded-lg bg-transparent border border-white/20 cursor-pointer" value={k[key]} onChange={(e) => setKit({ ...k, [key]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
        {dirty && <div className="md:col-span-2 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => { setStadium(null); setKit(null); }}>Discard</button><button className="btn btn-gold" onClick={save}>Save changes</button></div>}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-xl tracking-wide">Squad ({players.length})</h2>
        <Tabs value={tab} onChange={setTab} tabs={[['ALL', 'All'], ['GK', 'GK'], ['DEF', 'Defenders'], ['MID', 'Midfield'], ['ATT', 'Attack']].map(([id, label]) => ({ id, label }))} />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((p) => <PlayerCard key={p._id} p={p} shirt={club.kit.shirt} badge={String(club.tactics?.captain) === String(p._id) ? <span className="inline-block mt-1 ml-1 chip !px-2 bg-gold text-ink">C</span> : null} />)}
      </div>
    </div>
  );
}
