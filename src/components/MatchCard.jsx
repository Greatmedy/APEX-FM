import { Link } from 'react-router-dom';
import Crest from './Crest';
import TimeWAT from './TimeWAT';
import { monoOf } from './util';

export function TeamLine({ club, align = 'left', big }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <Crest colors={club.crestColors} mono={monoOf(club)} size={big ? 44 : 30} />
      <p className={`font-display leading-tight truncate ${big ? 'text-lg' : 'text-sm'}`}>{club.displayName}</p>
    </div>
  );
}

export default function MatchCard({ fx, title, myClubId, cta = 'Match details' }) {
  if (!fx) return null;
  const mineHome = String(fx.home.id) === String(myClubId);
  const venue = (mineHome ? fx.home : fx.away).stadiumName;
  const done = fx.result && ['finished', 'forfeit'].includes(fx.status);
  const my = mineHome ? fx.result?.h : fx.result?.a, their = mineHome ? fx.result?.a : fx.result?.h;
  const outcome = done ? (my > their ? 'Win' : my === their ? 'Draw' : 'Loss') : null;
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-300">{title} · GW {fx.gw}</p>
        {fx.status === 'live' && <span className="flex items-center gap-2 text-xs font-bold text-pitch"><span className="live-dot" />LIVE</span>}
        {outcome && <span className={`chip !px-2 ${outcome === 'Win' ? 'bg-pitch text-ink' : outcome === 'Draw' ? 'bg-slate-500' : 'bg-danger'}`}>{outcome}</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamLine club={fx.home} />
        <div className="num text-3xl px-2 text-center min-w-[72px]">{done ? `${fx.result.h} - ${fx.result.a}` : 'vs'}</div>
        <TeamLine club={fx.away} align="right" />
      </div>
      <div className="flex items-end justify-between gap-3 mt-4">
        <div className="text-sm text-slate-300 min-w-0">
          {!done && <TimeWAT date={fx.kickoffAt} />}
          <p className="text-xs text-slate-400 truncate">{mineHome ? 'Home' : 'Away'} · {venue}</p>
          {fx.result?.forfeitBy && <p className="text-xs text-rose-300 mt-1">Settled by forfeit, 3-0</p>}
        </div>
        <Link to={`/match/${fx.id}`} className="btn btn-gold shrink-0">{fx.status === 'live' ? 'Watch live' : cta}</Link>
      </div>
    </div>
  );
}
