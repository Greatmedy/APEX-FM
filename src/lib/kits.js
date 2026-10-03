const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
export const textOn = (hex) => { const [r, g, b] = rgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#07111F' : '#FFFFFF'; };

/** Pick on-pitch kits so the two teams never look the same. */
export function pickKits(h, a) {
  const home = { shirt: h?.shirt || '#E2B657', number: h?.number || textOn(h?.shirt || '#E2B657') };
  let away = { shirt: a?.shirt || '#14F195', number: a?.number || textOn(a?.shirt || '#14F195') };
  if (dist(home.shirt, away.shirt) < 110) {
    const alt = [a?.shorts, a?.number, '#FFFFFF', '#111827'].filter(Boolean).find((c) => dist(c, home.shirt) > 150) || '#111827';
    away = { shirt: alt, number: textOn(alt) };
  }
  return { h: home, a: away };
}
export const GK_KIT = { h: { shirt: '#F5D547', number: '#07111F' }, a: { shirt: '#FF7AB8', number: '#07111F' } };
