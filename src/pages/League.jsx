import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import { Spinner, ErrorState, Tabs, EmptyState } from '../components/ui';
import LeagueTable from '../components/LeagueTable';
import Crest from '../components/Crest';
import TimeWAT from '../components/TimeWAT';
import { monoOf } from '../components/util';

function Leaders({ rows, label }) {
  if (!rows) return <Spinner />;
  if (!rows.length) return <EmptyState title="Nothing here yet" body={`${label} appear after the first confirmed result.`} />;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.playerId} className="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 first:border-0 min-h-[52px]">
          <span className="num w-6 text-slate-300">{r.pos}</span>
          {r.club && <Crest colors={r.club.crestColors} mono={monoOf(r.club)} size={26} />}
          <div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{r.name}</p><p className="text-xs text-slate-300 truncate">{r.club?.displayName}</p></div>
          <span className="num text-2xl text-gold">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Fixtures({ tier, myClubId }) {
  const [gw, setGw] = useState(null);
  const [all, setAll] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get(`/league/${tier}/fixtures`).then(({ data }) => {
      setAll(data.fixtures);
      const next = data.fixtures.find((f) => ['scheduled', 'live', 'starting'].includes(f.status));
      setGw((g) => g ?? next?.gw ?? 38);
    }).catch((e) => setErr(errMsg(e)));
  }, [tier]);
  if (err) return <ErrorState message={err} />;
  if (!all) return <Spinner label="Loading fixtures" />;
  const list = all.filter((f) => f.gw === gw);
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <button className="btn btn-ghost !px-3" disabled={gw <= 1} onClick={() => setGw(gw - 1)} aria-label="Previous gameweek">Prev</button>
        <div className="text-center"><p className="font-display text-lg">Gameweek {gw}</p>{list[0] && <TimeWAT date={list[0].kickoffAt} className="text-sm text-slate-300" />}</div>
        <button className="btn btn-ghost !px-3" disabled={gw >= 38} onClick={() => setGw(gw + 1)} aria-label="Next gameweek">Next</button>
      </div>
      <ul>
        {list.map((f) => {
          const mine = [f.home.id, f.away.id].includes(myClubId);
          const done = f.result && ['finished', 'forfeit'].includes(f.status);
          return (
            <li key={f.id} className={`border-t border-white/5 ${mine ? 'bg-gold/10' : ''}`}>
              <Link to={`/match/${f.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 min-h-[56px]">
                <span className="flex items-center gap-2 min-w-0"><Crest colors={f.home.crestColors} mono={monoOf(f.home)} size={24} /><span className="text-[13px] font-semibold truncate">{f.home.displayName}</span></span>
                <span className="num text-xl min-w-[64px] text-center">{done ? `${f.result.h} - ${f.result.a}` : f.status === 'live' ? <span className="text-pitch flex items-center gap-1 justify-center"><span className="live-dot" />LIVE</span> : '20:00'}</span>
                <span className="flex items-center gap-2 min-w-0 flex-row-reverse text-right"><Crest colors={f.away.crestColors} mono={monoOf(f.away)} size={24} /><span className="text-[13px] font-semibold truncate">{f.away.displayName}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function League() {
  const { tier } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState('table');
  const [d, setD] = useState({});
  const [err, setErr] = useState('');
  const t = Number(tier) === 2 ? 2 : 1;
  const load = () => {
    setErr('');
    api.get(`/league/${t}/table`).then(({ data }) => setD((x) => ({ ...x, table: data.rows, season: data.season }))).catch((e) => setErr(errMsg(e)));
    api.get(`/league/${t}/scorers`).then(({ data }) => setD((x) => ({ ...x, scorers: data.rows }))).catch(() => {});
    api.get(`/league/${t}/assists`).then(({ data }) => setD((x) => ({ ...x, assists: data.rows }))).catch(() => {});
  };
  useEffect(() => { setD({}); load(); const s = getSocket(); const h = (e) => e.tier === t && load(); s.on('league-update', h); return () => s.off('league-update', h); }, [t]); // eslint-disable-line
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-3xl">APEX League {t}</h1><p className="text-sm text-slate-300">Season {d.season ?? '-'} · 20 clubs · 38 gameweeks · Win 3, draw 1</p></div>
        <Tabs value={String(t)} onChange={(v) => nav(`/league/${v}`)} tabs={[{ id: '1', label: 'League 1' }, { id: '2', label: 'League 2' }]} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'table', label: 'Table' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'scorers', label: 'Top scorers' }, { id: 'assists', label: 'Top assists' }]} />
      <div className="glass overflow-hidden">
        {err ? <ErrorState message={err} onRetry={load} /> : tab === 'table' ? (d.table ? <><LeagueTable rows={d.table} tier={t} myClubId={user?.clubId} />
          <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-white/10">{t === 1 ? 'Positions 18-20 are relegated. Forfeited clubs are relegated first.' : 'Positions 1-3 are promoted.'} Tie-breakers: points, goal difference, goals scored, head-to-head, manager name.</p></> : <Spinner />)
          : tab === 'fixtures' ? <Fixtures tier={t} myClubId={user?.clubId} />
            : tab === 'scorers' ? <Leaders rows={d.scorers} label="Goals" /> : <Leaders rows={d.assists} label="Assists" />}
      </div>
    </div>
  );
}
