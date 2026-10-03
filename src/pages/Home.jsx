import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../lib/api';
import { setServerNow, fmtWAT } from '../lib/time';
import { getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner, ErrorState, Modal, FormChips } from '../components/ui';
import LeagueTable from '../components/LeagueTable';
import MatchCard from '../components/MatchCard';
import BoardPanel from '../components/BoardPanel';
import Countdown from '../components/Countdown';
import Crest from '../components/Crest';
import { monoOf } from '../components/util';

function ForfeitModal({ open, onClose, club, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async () => {
    setBusy(true);
    try { await api.post('/clubs/me/forfeit', { confirm: text }); toast('You forfeited the league. Remaining games are 3-0 losses.', 'error'); onDone(); onClose(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Forfeit the league">
      <p className="text-sm text-slate-200">All your unplayed league games become <b>3-0 losses</b>. Points, goals for and goals against update immediately. You will be relegated at season end and cannot rejoin this season. This cannot be undone.</p>
      <p className="text-sm text-slate-300 mt-4">Type <b className="text-white">{club.displayName}</b> to confirm.</p>
      <input className="input mt-2" value={text} onChange={(e) => setText(e.target.value)} placeholder={club.displayName} aria-label="Confirm club name" />
      <div className="flex gap-2 mt-4">
        <button className="btn btn-ghost flex-1" onClick={onClose}>Keep playing</button>
        <button className="btn btn-danger flex-1" disabled={busy || text.trim() !== club.displayName} onClick={go}>{busy ? 'Forfeiting' : 'Forfeit league'}</button>
      </div>
    </Modal>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [full, setFull] = useState(false);
  const [forfeit, setForfeit] = useState(false);
  const load = useCallback(() => api.get('/home').then(({ data }) => { setServerNow(data.serverNow); setD(data); setErr(''); }).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => {
    load();
    const s = getSocket();
    const h = () => load();
    s.on('league-update', h);
    const t = setInterval(load, 60000);
    return () => { s.off('league-update', h); clearInterval(t); };
  }, [load]);
  if (err && !d) return <ErrorState message={err} onRetry={load} />;
  if (!d) return <Spinner label="Loading your dashboard" />;
  const { club, season } = d;
  const pre = season.phase !== 'active';
  return (
    <div className="space-y-5">
      <div className="glass p-4 sm:p-5 flex items-center gap-4">
        <Crest colors={club.crestColors} mono={monoOf(club)} size={58} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl sm:text-3xl leading-tight truncate">{club.displayName}</h1>
          <p className="text-sm text-slate-300">{club.league} · Season {season.number} · <b className="text-gold">Rank {d.rank ?? '-'}</b> · {d.played}/{d.total} played</p>
          <div className="mt-2"><FormChips form={club.seasonForm} /></div>
        </div>
      </div>

      {club.forfeited && (
        <div className="glass p-4 border-danger/60" role="alert">
          <p className="font-display text-lg text-rose-300">You forfeited this season</p>
          <p className="text-sm text-slate-200 mt-1">Remaining games were recorded as 3-0 losses. You will be relegated when the season ends and can return next season.</p>
        </div>
      )}
      {pre && (
        <div className="glass p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-lg">{season.phase === 'offseason' ? 'Off-season break' : 'Pre-season'}: Season {season.number} starts soon</p>
            <p className="text-sm text-slate-300">Gameweek 1 kicks off {fmtWAT(season.startsAt)}. Fixtures are already drawn.</p>
          </div>
          <Countdown to={season.startsAt} className="text-3xl text-pitch" />
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-5">
          <div className="glass overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <p className="font-display text-lg tracking-wide">My league table</p>
              <Link to={`/league/${club.tier}`} className="text-sm font-bold text-gold">Full page</Link>
            </div>
            <LeagueTable rows={d.table} tier={club.tier} myClubId={club.id} limit={full ? undefined : 5} />
            <button className="w-full min-h-[48px] text-sm font-bold text-pitch border-t border-white/10 hover:bg-white/5" onClick={() => setFull((f) => !f)}>{full ? 'Collapse to top 5' : 'Show all 20 clubs'}</button>
          </div>
          <BoardPanel />
        </div>
        <div className="lg:col-span-2 space-y-5">
          {d.next ? <MatchCard fx={d.next} title="Next match" myClubId={club.id} /> : <div className="glass p-4 text-sm text-slate-300">No upcoming match. Season {season.number} is complete or not yet scheduled.</div>}
          {d.last ? <MatchCard fx={d.last} title="Last result" myClubId={club.id} /> : <div className="glass p-4 text-sm text-slate-300">No results yet. Your first result will appear here after gameweek 1.</div>}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/club" className="btn btn-ghost !min-h-[56px]">My team</Link>
            <Link to="/tactics" className="btn btn-gold !min-h-[56px]">Tactics</Link>
          </div>
          {user?.role !== 'admin' && !club.forfeited && (
            <div className="rounded-2xl border border-danger/50 bg-danger/5 p-4 mt-8">
              <p className="font-display text-lg text-rose-300">Danger zone</p>
              <p className="text-xs text-slate-300 mt-1">Quit the league for the rest of the season. You will be relegated.</p>
              <button className="btn btn-danger mt-3 w-full" onClick={() => setForfeit(true)}>Forfeit league</button>
            </div>
          )}
        </div>
      </div>
      <ForfeitModal open={forfeit} onClose={() => setForfeit(false)} club={club} onDone={load} />
    </div>
  );
}
