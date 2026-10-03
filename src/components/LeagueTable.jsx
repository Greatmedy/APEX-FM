import { Link } from 'react-router-dom';
import Crest from './Crest';
import { monoOf } from './util';

/** Table rows from /league/:tier/table. Every club shows its manager tag via displayName. */
export default function LeagueTable({ rows = [], tier = 1, myClubId, limit, className = '' }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const zone = (pos) => (tier === 1 ? (pos >= 18 ? 'bg-danger' : pos <= 4 ? 'bg-pitch' : '') : pos <= 3 ? 'bg-pitch' : '');
  const me = rows.find((r) => String(r.club.id) === String(myClubId));
  const list = limit && me && !shown.includes(me) ? [...shown, me] : shown;
  return (
    <div className={className}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-300 text-left">
            <th className="py-2 pl-3 w-8 font-semibold">#</th><th className="font-semibold">Club</th>
            <th className="w-7 text-center font-semibold">P</th><th className="w-7 text-center font-semibold">W</th><th className="w-7 text-center font-semibold">D</th><th className="w-7 text-center font-semibold">L</th>
            <th className="w-8 text-center font-semibold hidden sm:table-cell">GF</th><th className="w-8 text-center font-semibold hidden sm:table-cell">GA</th>
            <th className="w-9 text-center font-semibold">GD</th><th className="w-9 pr-3 text-center font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const mine = String(r.club.id) === String(myClubId);
            return (
              <tr key={r.club.id} className={`border-t border-white/5 ${mine ? 'bg-gold/10' : ''}`}>
                <td className="py-2 pl-3 relative"><span className={`absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r ${zone(r.pos)}`} /><span className="num">{r.pos}</span></td>
                <td className="py-1 pr-2">
                  <Link to={mine ? '/club' : `/clubs/${r.club.id}`} className="flex items-center gap-2 min-h-[44px]">
                    <Crest colors={r.club.crestColors} mono={monoOf(r.club)} size={24} />
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold text-[13px] leading-tight ${r.club.forfeited ? 'line-through text-slate-400' : ''}`}>{r.club.displayName}</span>
                    </span>
                  </Link>
                </td>
                <td className="num text-center">{r.played}</td><td className="num text-center">{r.won}</td><td className="num text-center">{r.drawn}</td><td className="num text-center">{r.lost}</td>
                <td className="num text-center hidden sm:table-cell">{r.gf}</td><td className="num text-center hidden sm:table-cell">{r.ga}</td>
                <td className="num text-center">{r.gd > 0 ? '+' + r.gd : r.gd}</td>
                <td className="num text-center pr-3 text-gold text-base">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
