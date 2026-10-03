import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState } from '../components/ui';
import Crest from '../components/Crest';
import TimeWAT from '../components/TimeWAT';
import { monoOf } from '../components/util';

export default function Fixtures() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.get('/matches/mine').then(({ data }) => setD(data)).catch((e) => setErr(errMsg(e)));
  useEffect(() => { load(); }, []);
  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!d) return <Spinner label="Loading your fixtures" />;
  const my = user.clubId;
  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-3xl">My fixtures</h1><p className="text-sm text-slate-300">Season {d.season} · Mondays and Thursdays at 20:00 WAT</p></div>
      <div className="glass overflow-hidden">
        {d.fixtures.map((f) => {
          const home = String(f.home.id) === String(my);
          const done = f.result && ['finished', 'forfeit'].includes(f.status);
          const mine = done ? (home ? f.result.h : f.result.a) : null, theirs = done ? (home ? f.result.a : f.result.h) : null;
          const opp = home ? f.away : f.home;
          return (
            <Link key={f.id} to={`/match/${f.id}`} className="flex items-center gap-3 px-4 py-3 border-t border-white/5 first:border-0 hover:bg-white/5 min-h-[64px]">
              <span className="num w-9 text-slate-300">GW{f.gw}</span>
              <Crest colors={opp.crestColors} mono={monoOf(opp)} size={30} />
              <div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{home ? 'vs' : 'at'} {opp.displayName}</p><TimeWAT date={f.kickoffAt} className="text-xs text-slate-300" /></div>
              {done ? <span className={`num text-xl px-2.5 py-1 rounded-lg ${mine > theirs ? 'bg-pitch text-ink' : mine === theirs ? 'bg-slate-600' : 'bg-danger'}`}>{f.result.h}-{f.result.a}</span>
                : f.status === 'live' ? <span className="text-pitch font-bold text-sm flex items-center gap-1"><span className="live-dot" />LIVE</span> : <span className="text-xs text-slate-400 font-bold">{f.status === 'void' ? 'Void' : 'Scheduled'}</span>}
            </Link>
          );
        })}
        {d.fixtures.length === 0 && <p className="p-6 text-sm text-slate-300">No fixtures yet.</p>}
      </div>
    </div>
  );
}
