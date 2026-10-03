import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errMsg } from '../lib/api';
import { Spinner, ErrorState, Stat, FormChips } from '../components/ui';
import Crest from '../components/Crest';
import PlayerCard from '../components/PlayerCard';
import { monoOf } from '../components/util';

export default function ClubPublic() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => { setD(null); setErr(''); api.get(`/clubs/${id}`).then(({ data }) => setD(data)).catch((e) => setErr(errMsg(e))); };
  useEffect(load, [id]); // eslint-disable-line
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!d) return <Spinner label="Loading squad" />;
  const { club, players, ovr, rank } = d;
  return (
    <div className="space-y-5">
      <div className="glass p-5 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Crest colors={club.crestColors} mono={monoOf(club)} size={76} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight">{club.displayName}</h1>
            <p className="text-sm text-slate-300">{club.league}{rank ? ` · Rank ${rank}` : ''} · {club.stadiumName}</p>
            <div className="mt-2"><FormChips form={club.seasonForm} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-64"><Stat label="Team OVR" value={ovr} accent="gold" /><Stat label="Fans" value={club.fans.toLocaleString()} /></div>
      </div>
      <p className="text-xs text-slate-400">Formation and style are hidden until the match goes live.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map((p) => <PlayerCard key={p._id} p={p} shirt={club.kit?.shirt} />)}
      </div>
    </div>
  );
}
