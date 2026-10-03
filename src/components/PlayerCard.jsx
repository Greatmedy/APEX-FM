import PlayerPortrait from './PlayerPortrait';

const Bar = ({ label, v }) => (
  <div className="flex items-center gap-2">
    <span className="w-7 text-[10px] font-bold text-slate-300">{label}</span>
    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: v >= 85 ? '#14F195' : v >= 70 ? '#E2B657' : '#94a3b8' }} /></div>
    <span className="num w-6 text-right text-xs">{v}</span>
  </div>
);
export const Stars = ({ n }) => <span aria-label={`${n} stars`} className="text-gold text-xs tracking-tighter">{'★'.repeat(n)}<span className="text-white/20">{'★'.repeat(5 - n)}</span></span>;

export default function PlayerCard({ p, shirt = '#14F195', full = true, onClick, selected, badge }) {
  const form = p.form?.length ? (p.form.reduce((s, x) => s + x, 0) / p.form.length).toFixed(1) : null;
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={`glass p-3 transition ${onClick ? 'cursor-pointer hover:bg-white/15' : ''} ${selected ? 'ring-2 ring-pitch' : ''} ${p.unavailable || p.injuredFor > 0 || p.suspendedFor > 0 ? 'opacity-70' : ''}`}>
      <div className="flex gap-3">
        <div className="relative">
          <PlayerPortrait seed={p.portraitSeed} name={p.name} shirt={shirt} size={full ? 76 : 56} />
          <span className="absolute -bottom-1 -right-1 num text-[11px] bg-ink border border-white/20 rounded-md px-1.5">#{p.number}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{p.name}</p>
              <p className="text-xs text-slate-300">{p.position} · {p.country}</p>
            </div>
            <div className="text-right">
              <div className="num text-3xl leading-none text-gold">{p.ovr}</div>
              <Stars n={p.stars} />
            </div>
          </div>
          {(p.injuredFor > 0 || p.suspendedFor > 0) && <span className="inline-block mt-1 chip !px-2 bg-danger/80 text-white">{p.injuredFor > 0 ? 'Injured' : 'Suspended'}</span>}
          {badge}
        </div>
      </div>
      {full && (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
            <Bar label="PAC" v={p.pace} /><Bar label="DRI" v={p.dribbling} />
            <Bar label="SHO" v={p.shooting} /><Bar label="DEF" v={p.defending} />
            <Bar label="PAS" v={p.passing} /><Bar label="PHY" v={p.physical} />
          </div>
          <div className="grid grid-cols-3 gap-1 mt-3 text-[11px] text-slate-300">
            <span>Stamina <b className="text-white">{p.stamina}</b></span>
            <span>Skill moves <b className="text-white">{p.skillMoves}★</b></span>
            <span>{p.foot} foot</span>
            <span>Age <b className="text-white">{p.age}</b></span>
            <span>{p.heightCm} cm</span>
            <span>{p.weightKg} kg</span>
          </div>
          {form && <p className="text-[11px] text-slate-300 mt-2">Form <b className="text-pitch">{form}</b> avg of last {p.form.length}</p>}
        </>
      )}
    </div>
  );
}
