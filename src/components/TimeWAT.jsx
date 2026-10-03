import { fmtWAT, fmtLocal } from '../lib/time';

export default function TimeWAT({ date, className = '' }) {
  const local = fmtLocal(date);
  return (
    <span className={className}>
      <span className="font-semibold">{fmtWAT(date)}</span>
      {local && <span className="block text-[11px] text-slate-400">Your time: {local}</span>}
    </span>
  );
}
