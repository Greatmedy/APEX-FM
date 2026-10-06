// slot: [role, x (0 own goal -> 1 opp goal, attacking perspective), y (0..1 top->bottom)]
export const FORMATIONS = {
  '4-3-3': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['CM', .42, .27], ['CDM', .37, .5], ['CM', .42, .73], ['LW', .66, .13], ['ST', .72, .5], ['RW', .66, .87]],
  '4-2-3-1': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['CDM', .36, .36], ['CDM', .36, .64], ['LM', .56, .12], ['CAM', .56, .5], ['RM', .56, .88], ['ST', .73, .5]],
  '4-4-2': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['LM', .46, .1], ['CM', .42, .37], ['CM', .42, .63], ['RM', .46, .9], ['ST', .70, .36], ['ST', .70, .64]],
  '3-5-2': [['GK', .05, .5], ['CB', .2, .25], ['CB', .18, .5], ['CB', .2, .75], ['LM', .44, .07], ['CM', .42, .3], ['CDM', .36, .5], ['CM', .42, .7], ['RM', .44, .93], ['ST', .70, .36], ['ST', .70, .64]],
  '5-3-2': [['GK', .05, .5], ['LWB', .27, .07], ['CB', .2, .27], ['CB', .18, .5], ['CB', .2, .73], ['RWB', .27, .93], ['CM', .42, .28], ['CDM', .37, .5], ['CM', .42, .72], ['ST', .70, .36], ['ST', .70, .64]],
  '4-1-4-1': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['CDM', .34, .5], ['LM', .5, .1], ['CM', .47, .37], ['CM', .47, .63], ['RM', .5, .9], ['ST', .72, .5]],
  '3-4-3': [['GK', .05, .5], ['CB', .2, .25], ['CB', .18, .5], ['CB', .2, .75], ['LM', .42, .1], ['CM', .4, .38], ['CM', .4, .62], ['RM', .42, .9], ['LW', .66, .15], ['ST', .72, .5], ['RW', .66, .85]],
  '5-4-1': [['GK', .05, .5], ['LWB', .27, .07], ['CB', .2, .27], ['CB', .18, .5], ['CB', .2, .73], ['RWB', .27, .93], ['LM', .46, .12], ['CM', .42, .38], ['CM', .42, .62], ['RM', .46, .88], ['ST', .72, .5]],
  '4-3-2-1': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['CM', .4, .27], ['CDM', .36, .5], ['CM', .4, .73], ['CAM', .58, .33], ['CAM', .58, .67], ['ST', .73, .5]],
  '4-4-1-1': [['GK', .05, .5], ['LB', .22, .1], ['CB', .2, .37], ['CB', .2, .63], ['RB', .22, .9], ['LM', .46, .1], ['CM', .42, .37], ['CM', .42, .63], ['RM', .46, .9], ['CF', .6, .5], ['ST', .74, .5]],
};
export const FORMATION_IDS = Object.keys(FORMATIONS);
export const STYLES = ['balanced', 'possession', 'counter', 'press', 'park'];

const DEF = ['CB', 'LB', 'RB', 'LWB', 'RWB'];
const MID = ['CDM', 'CM', 'CAM', 'LM', 'RM'];
export const groupOf = (pos) => (pos === 'GK' ? 'GK' : DEF.includes(pos) ? 'DEF' : MID.includes(pos) ? 'MID' : 'ATT');

const ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
/** Multiplier for playing a natural-group player in a slot of another group. */
export function posFactor(g, sg) {
  if (g === sg) return 1;
  if (g === 'GK' || sg === 'GK') return 0.5;
  return Math.abs(ORDER[g] - ORDER[sg]) === 1 ? 0.92 : 0.85;
}
export function fitScore(p, role) {
  if (p.position === role) return 4;
  const g = groupOf(p.position), sg = groupOf(role);
  if (g === sg) return 0;
  if (g === 'GK' || sg === 'GK') return -60;
  return Math.abs(ORDER[g] - ORDER[sg]) === 1 ? -9 : -16;
}
/** Greedy best XI + 7 subs from a squad for a formation. Players: objects with _id, position, ovr. */
export function autoPick(players, formation, unavailable = new Set()) {
  const slots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const pool = players.filter((p) => !unavailable.has(String(p._id)));
  const used = new Set();
  const lineup = new Array(slots.length).fill(null);
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a][0] === 'GK' ? -1 : slots[b][0] === 'GK' ? 1 : 0));
  for (const i of order) {
    let best = null, bs = -1e9;
    for (const p of pool) {
      if (used.has(String(p._id))) continue;
      const sc = p.ovr + fitScore(p, slots[i][0]);
      if (sc > bs) { bs = sc; best = p; }
    }
    if (best) { used.add(String(best._id)); lineup[i] = best; }
  }
  const rest = pool.filter((p) => !used.has(String(p._id))).sort((a, b) => b.ovr - a.ovr);
  const bench = [];
  const take = (pred) => { const i = rest.findIndex(pred); if (i >= 0 && bench.length < 7) bench.push(rest.splice(i, 1)[0]); };
  take((p) => p.position === 'GK');
  take((p) => groupOf(p.position) === 'DEF'); take((p) => groupOf(p.position) === 'DEF');
  take((p) => groupOf(p.position) === 'MID'); take((p) => groupOf(p.position) === 'MID');
  take((p) => groupOf(p.position) === 'ATT');
  while (bench.length < 7 && rest.length) bench.push(rest.shift());
  return { lineup, bench };
}
export const teamOvr = (lineup) => {
  const l = lineup.filter(Boolean);
  return l.length ? Math.round(l.reduce((s, p) => s + p.ovr, 0) / l.length) : 0;
};
