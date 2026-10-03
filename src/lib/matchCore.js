// Shared by the server simulation and the client playback. Pure functions, no imports.
// Events are the single source of truth: state = reduce(setup, events).
// Sides: 'h' (home) and 'a' (away). Event z = ball progress toward the opponent goal from the point of view of
// the side holding the ball AFTER the event (0 own goal, 1 opponent goal). y is absolute (0 top, 1 bottom).

export const opp = (t) => (t === 'h' ? 'a' : 'h');

export const STYLE_FX = {
  balanced:   { ctrl: 0,  atk: 0,  def: 0,  press: 0,   stam: 1.0,  shot: 1.0,  hold: 0,    dz: 1.0,  tempo: 1.0 },
  possession: { ctrl: 5,  atk: 0,  def: 0,  press: 0,   stam: 1.05, shot: 0.88, hold: 0.04, dz: 0.8,  tempo: 1.1 },
  counter:    { ctrl: -3, atk: 3,  def: 1,  press: 0,   stam: 0.95, shot: 1.08, hold: 0,    dz: 1.35, tempo: 0.9 },
  press:      { ctrl: 2,  atk: 2,  def: -2, press: 1,   stam: 1.35, shot: 1.05, hold: 0,    dz: 1.1,  tempo: 0.9 },
  park:       { ctrl: -5, atk: -8, def: 7,  press: 0,   stam: 0.8,  shot: 0.7,  hold: -0.02, dz: 1.0, tempo: 1.2 },
};

const GW = { DEF: { c: 0.2, a: 0.1, d: 1 }, MID: { c: 1, a: 0.6, d: 0.5 }, ATT: { c: 0.3, a: 1, d: 0.15 } };
const newStats = () => ({ shots: 0, sot: 0, passes: 0, fouls: 0, pens: 0, corners: 0, xg: 0, poss: 0, yellow: 0, red: 0 });

export function createState(setup) {
  const mk = (s) => ({
    clubId: s.clubId, name: s.name, short: s.short, formation: s.formation, style: s.style, ai: !!s.ai, baseStyle: s.style, subsUsed: 0,
    lineup: s.lineup.map((p) => ({ ...p, a: { ...p.a } })),
    bench: s.bench.map((p) => ({ ...p, a: { ...p.a } })),
  });
  return {
    sec: 0, score: { h: 0, a: 0 }, poss: null, z: 0.5, y: 0.5, carrier: null, half: 1, finished: false,
    sides: { h: mk(setup.h), a: mk(setup.a) },
    stats: { h: newStats(), a: newStats() }, goals: [], cards: [], subs: [], lastPass: null, lastEv: null, n: 0,
  };
}

export function advance(st, to) {
  const dt = to - st.sec;
  if (dt <= 0) return;
  const mins = dt / 60;
  for (const t of ['h', 'a']) {
    const S = st.sides[t];
    const m = STYLE_FX[S.style].stam;
    for (const p of S.lineup) if (p.on) p.e = Math.max(5, p.e - mins * (0.34 + (100 - p.a.sta) / 330) * m);
  }
  if (st.poss) st.stats[st.poss].poss += dt;
  st.sec = to;
}

const findOn = (S, id) => S.lineup.find((p) => p.id === id && p.on);
const findAny = (S, id) => S.lineup.find((p) => p.id === id);

export function applyEvent(st, ev) {
  advance(st, ev.s);
  const t = ev.t, o = opp(t);
  const S = st.sides[t], X = st.stats[t], Y = st.stats[o];
  if (ev.z !== undefined) { st.z = ev.z; if (ev.y !== undefined) st.y = ev.y; }
  const holder = { kickoff: t, goalkick: t, pass: t, dribble: t, tackle: t, interception: t, shot: t, goal: t, save: t, miss: t, corner: t, pen: t, foul: o }[ev.k];
  if (holder) st.poss = holder;
  if (ev.k !== 'pass' && ev.k !== 'yellow' && ev.k !== 'red' && ev.k !== 'sub' && ev.k !== 'style' && ev.k !== 'injury') st.lastPass = null;
  const min = Math.min(90, Math.floor(ev.s / 60) + 1);
  switch (ev.k) {
    case 'kickoff': case 'goalkick': st.carrier = ev.p || st.carrier; break;
    case 'pass': X.passes++; st.carrier = ev.q; st.lastPass = { t, p: ev.p, q: ev.q }; break;
    case 'dribble': st.carrier = ev.p; break;
    case 'tackle': st.carrier = ev.p; break;
    case 'interception': st.carrier = ev.p; Y.passes++; break;
    case 'foul': X.fouls++; st.carrier = ev.q; break;
    case 'pen': X.pens++; break;
    case 'corner': X.corners++; st.carrier = ev.p; break;
    case 'shot': X.shots++; X.xg += ev.xg || 0; st.carrier = null; break;
    case 'goal':
      X.sot++; st.score[t]++; st.carrier = null;
      st.goals.push({ s: ev.s, m: min, t, p: ev.p, q: ev.q || null, pen: !!ev.pen });
      break;
    case 'save': Y.sot++; st.carrier = ev.p; break;
    case 'miss': st.carrier = null; break;
    case 'yellow': { const p = findOn(S, ev.p); if (p) p.y++; X.yellow++; st.cards.push({ s: ev.s, m: min, t, p: ev.p, c: 'y' }); break; }
    case 'red': { const p = findOn(S, ev.p); if (p) { p.r = 1; p.on = 0; } X.red++; st.cards.push({ s: ev.s, m: min, t, p: ev.p, c: 'r', why: ev.why }); break; }
    case 'injury': { const p = findOn(S, ev.p); if (p) p.inj = 1; break; }
    case 'style': S.style = ev.style; break;
    case 'sub': {
      const out = findOn(S, ev.p); const bi = S.bench.findIndex((p) => p.id === ev.q);
      if (out && bi >= 0) {
        const inn = S.bench.splice(bi, 1)[0];
        out.on = 0; inn.on = 1; inn.sx = out.sx; inn.sy = out.sy; inn.role = out.role; inn.sg = out.sg; inn.e = 100;
        inn.f0 = posFactorLocal(inn.g, out.sg);
        S.lineup.push(inn); S.subsUsed++;
        st.subs.push({ s: ev.s, m: min, t, out: ev.p, in: ev.q, forced: !!ev.forced });
      }
      break;
    }
    case 'halftime': st.half = 2; st.poss = null; break;
    case 'fulltime': st.finished = true; st.poss = null; break;
    default: break;
  }
  st.lastEv = ev; st.n++;
}

const ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export function posFactorLocal(g, sg) {
  if (g === sg) return 1;
  if (g === 'GK' || sg === 'GK') return 0.5;
  return Math.abs(ORDER[g] - ORDER[sg]) === 1 ? 0.92 : 0.85;
}

export function teamRatings(S) {
  let c = 0, cw = 0, a = 0, aw = 0, d = 0, dw = 0, gk = 45, n = 0;
  for (const p of S.lineup) {
    if (!p.on) continue;
    n++;
    const f = p.f0 * (0.78 + 0.22 * (p.e / 100)) * (p.inj ? 0.6 : 1);
    const x = p.a;
    if (p.sg === 'GK') { gk = (p.g === 'GK' ? x.def : x.def * 0.45) * f; continue; }
    const W = GW[p.sg];
    c += W.c * (x.pas * 0.45 + x.dri * 0.25 + x.phy * 0.15 + x.sta * 0.15) * f; cw += W.c;
    a += W.a * (x.sho * 0.4 + x.dri * 0.25 + x.pac * 0.2 + x.pas * 0.15) * f; aw += W.a;
    d += W.d * (x.def * 0.6 + x.phy * 0.25 + x.pac * 0.15) * f; dw += W.d;
  }
  const man = 1 - 0.06 * (11 - n);
  const fx = STYLE_FX[S.style] || STYLE_FX.balanced;
  return {
    ctrl: (cw ? c / cw : 40) * man + fx.ctrl, atk: (aw ? a / aw : 40) * man + fx.atk, def: (dw ? d / dw : 40) * man + fx.def, gk, n,
  };
}

export const minuteOf = (s) => Math.min(90, Math.floor(s / 60) + 1);
