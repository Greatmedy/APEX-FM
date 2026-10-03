export function mulberryLite(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const monoOf = (club) => (club?.short || (club?.name || 'AF').slice(0, 3)).toUpperCase();
export const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const posGroup = (p) => (p === 'GK' ? 'GK' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p) ? 'DEF' : ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p) ? 'MID' : 'ATT');
export const STYLE_LABEL = { balanced: 'Balanced', possession: 'Possession', counter: 'Counter', press: 'High press', park: 'Park the bus' };
export const LEAGUE_BADGE = { EPL: ['EPL', '#8B5CF6'], LALIGA: ['LL', '#F97316'], SERIEA: ['SA', '#0EA5E9'], BUNDES: ['BL', '#EF4444'] };
