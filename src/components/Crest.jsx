import { useId } from 'react';
import { textOn } from '../lib/kits';

/** Original crest: shield + diagonal band + monogram. Not a real club mark. */
export default function Crest({ colors = ['#14F195', '#07111F'], mono = 'AFC', size = 44, className = '' }) {
  const id = useId().replace(/:/g, '');
  const [p, s] = colors;
  const ink = textOn(p);
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 100 112" className={className} role="img" aria-label={`${mono} crest`}>
      <defs><clipPath id={id}><path d="M50 4 92 18v38c0 28-18 46-42 52C26 102 8 84 8 56V18z" /></clipPath></defs>
      <path d="M50 4 92 18v38c0 28-18 46-42 52C26 102 8 84 8 56V18z" fill={p} />
      <g clipPath={`url(#${id})`}><path d="M-10 78 110 22v26L-10 104z" fill={s} opacity=".95" /></g>
      <path d="M50 4 92 18v38c0 28-18 46-42 52C26 102 8 84 8 56V18z" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="4" />
      <text x="50" y="52" textAnchor="middle" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize={mono.length > 2 ? 28 : 34} fill={ink} stroke={p === ink ? 'none' : 'rgba(0,0,0,.25)'} strokeWidth=".6">{mono}</text>
    </svg>
  );
}
