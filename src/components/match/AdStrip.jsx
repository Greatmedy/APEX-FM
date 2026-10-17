import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/api';

/** Sponsor strip for the 2D pitch: same admin lineup as the 3D boards, rotating every 5 seconds, client-side only. */
export default function AdStrip({ brands }) {
  const [i, setI] = useState(0);
  const n = brands?.length || 0;
  useEffect(() => { setI(0); if (n < 2) return undefined; const t = setInterval(() => setI((x) => (x + 1) % n), 5000); return () => clearInterval(t); }, [n]);
  if (!n) return null;
  const b = brands[i % n];
  return (
    <div className="mb-2 flex items-center justify-center gap-3 rounded-lg bg-ink/80 border border-white/10 px-3 h-9 overflow-hidden" aria-label={`Sponsor: ${b.name}`}>
      {b.url && <img key={b.id} src={/^https?:/i.test(b.url) ? b.url : API_URL + b.url} alt="" className="h-6 w-auto max-w-[96px] object-contain bg-white rounded px-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <span className="font-display tracking-wide text-sm truncate">{b.name}</span>
    </div>
  );
}
