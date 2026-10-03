import { mulberryLite } from './util';

const SKIN = ['#F1C7A5', '#E0A982', '#C68863', '#A56B45', '#7C4A2D', '#5A3220'];
const HAIR = ['#14110F', '#2B1B10', '#5A3A1C', '#B8863B', '#D9D2C5', '#7C2D12'];

/** Generated illustrated portrait from the player's seed (no photographs). */
export default function PlayerPortrait({ seed = 1, name = '', shirt = '#14F195', size = 72, round = false }) {
  const r = mulberryLite(seed);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const style = Math.floor(r() * 5);
  const initials = name.split(' ').filter(Boolean).map((w) => w[0]).slice(-2).join('').toUpperCase();
  const bg = `hsl(${Math.floor(r() * 40) + 205} 45% 22%)`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`${round ? 'rounded-full' : 'rounded-xl'} shrink-0`} role="img" aria-label={`Portrait of ${name}`}>
      <rect width="100" height="100" fill={bg} />
      <circle cx="50" cy="40" r="46" fill="rgba(255,255,255,.06)" />
      <path d="M8 100c2-24 18-34 42-34s40 10 42 34z" fill={shirt} />
      <path d="M38 66c4 8 20 8 24 0l-3-8H41z" fill={skin} opacity=".95" />
      <rect x="43" y="52" width="14" height="14" rx="5" fill={skin} />
      <ellipse cx="50" cy="38" rx="19" ry="22" fill={skin} />
      {style === 0 && <path d="M30 34c0-16 10-22 21-22s19 7 19 22c-4-8-10-11-20-11s-16 3-20 11z" fill={hair} />}
      {style === 1 && <path d="M31 33c1-14 9-19 19-19s18 5 19 19c-3-5-6-7-19-7s-16 2-19 7z" fill={hair} />}
      {style === 2 && <g fill={hair}><circle cx="36" cy="26" r="9" /><circle cx="50" cy="20" r="10" /><circle cx="64" cy="26" r="9" /><circle cx="31" cy="36" r="6" /><circle cx="69" cy="36" r="6" /></g>}
      {style === 3 && <path d="M31 30c2-12 10-17 19-17s17 5 19 17c-6-3-12-4-19-4s-13 1-19 4z" fill={hair} opacity=".55" />}
      {style === 4 && <path d="M30 36c-2-18 9-26 21-26 13 0 22 8 19 26-2-9-8-14-20-14S32 27 30 36z" fill={hair} />}
      <circle cx="43" cy="40" r="1.8" fill="#111" /><circle cx="57" cy="40" r="1.8" fill="#111" />
      <path d="M44 49c3 2.5 9 2.5 12 0" stroke="#111" strokeOpacity=".55" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {initials && <text x="50" y="92" textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="12" fontWeight="600" fill="rgba(255,255,255,.9)">{initials}</text>}
    </svg>
  );
}
