import { PITCH_L, PITCH_W, simToWorldX, simToWorldZ, clamp, hashStr, attackDir } from './Match3DMath';

/*
 * Presentation adapter: turns MatchPlayer state (authoritative, event-sourced) into render-friendly data.
 * It is a translation layer only: formation slots + ball position -> where each on-pitch player should be standing.
 * It makes no football decisions and never changes MatchPlayer state.
 *
 * presentation state shape:
 *  { ball:{x,y,carrier}, players:[{id,team,number,name,role,position,x,y,active,isGoalkeeper, wx, wz, urgent}],
 *    event:{type,playerId,targetPlayerId,timestamp,side,index}, score:{h,a}, clock:number, poss }
 */
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class StateAdapter {
  constructor() {
    this.recs = new Map();
    this.players = [];
    this.ball = { x: 0.5, y: 0.5, carrier: null, wx: 0, wz: 0 };
    this.event = null; this.score = { h: 0, a: 0 }; this.clock = 0; this.poss = null;
    this.exempt = new Set();
    this.time = 0;
  }
  /** Recompute targets from the current MatchPlayer state. Cheap: ~22 players, no allocation after warm-up. */
  update(player, time) {
    const st = player.st; this.time = time;
    const b = player.ball;
    this.ball.x = b.x; this.ball.y = b.y; this.ball.carrier = st.carrier; this.ball.wx = simToWorldX(b.x); this.ball.wz = simToWorldZ(b.y);
    this.score = st.score; this.clock = st.sec; this.poss = st.poss;
    const le = st.lastEv;
    this.event = le ? { type: le.k, playerId: le.p, targetPlayerId: le.q, timestamp: le.s, side: le.t, index: le.i } : null;
    const k = le ? le.k : null;
    this.players.length = 0;
    const bxw = this.ball.wx, bzw = this.ball.wz;
    for (const t of ['h', 'a']) {
      const S = st.sides[t], dir = attackDir(t);
      const bz = t === 'h' ? b.x : 1 - b.x;
      const own = st.poss === t;
      const rows = [];
      for (const p of S.lineup) {
        if (!p.on) continue;
        const gkSlot = p.sg === 'GK';
        const kk = gkSlot ? 0.1 : p.sg === 'DEF' ? 0.38 : p.sg === 'MID' ? 0.5 : 0.42;
        let px = p.sx + (bz - 0.5) * kk + (st.poss ? (own ? 0.05 : -0.03) : 0);
        px = gkSlot ? clamp(px, 0.02, 0.14) : clamp(px, 0.04, 0.97);
        const ay0 = t === 'h' ? p.sy : 1 - p.sy;
        const ay = ay0 + (b.y - 0.5) * (gkSlot ? 0.1 : 0.2);
        let wx, wz;
        if (gkSlot) {
          const depth = 1.4 + 9.5 * smooth(bz);
          wx = dir > 0 ? -PITCH_L / 2 + depth : PITCH_L / 2 - depth;
          wz = simToWorldZ(0.5 + (b.y - 0.5) * 0.14);
        } else {
          const ax = t === 'h' ? px : 1 - px;
          wx = simToWorldX(clamp(ax, 0.01, 0.99)); wz = simToWorldZ(clamp(ay, 0.04, 0.96));
          const j = hashStr(p.id) % 628 / 100;
          wx += Math.sin(time * 0.7 + j) * 0.9; wz += Math.cos(time * 0.55 + j) * 0.9; // restless idle drift
        }
        let rec = this.recs.get(p.id);
        if (!rec) { rec = { id: p.id }; this.recs.set(p.id, rec); }
        rec.team = t; rec.number = p.num; rec.name = p.name; rec.role = p.role; rec.position = p.pos; rec.entry = p;
        rec.isGoalkeeper = gkSlot && p.g === 'GK'; rec.active = true; rec.urgent = 0.3; rec.carrier = false;
        rec.wx = wx; rec.wz = wz; rec.x = wx / PITCH_L + 0.5; rec.y = wz / PITCH_W + 0.5; rec.injured = !!p.inj;
        rows.push(rec);
      }
      // play shape: nearest two defenders close the ball down, nearest two team-mates offer support
      const field = rows.filter((r) => !r.entry.sg || r.entry.sg !== 'GK');
      const byDist = field.map((r) => ({ r, d: Math.hypot(r.wx - bxw, r.wz - bzw) })).sort((a, c) => a.d - c.d);
      if (st.poss && !own) {
        byDist.slice(0, 2).forEach(({ r }, i) => { r.wx = bxw + (st.poss === 'h' ? 1 : -1) * (3.2 + i * 3.4); r.wz = bzw + (i ? 3.5 : -1.5); r.urgent = 0.95; });
      } else if (st.poss && own) {
        byDist.filter(({ r }) => r.id !== st.carrier).slice(0, 2).forEach(({ r }, i) => { r.wx = bxw + dir * (4 + i * 6); r.wz = bzw + (i ? 10 : -10) * (bzw > 0 ? -1 : 1); r.urgent = 0.75; });
      }
      for (const r of rows) {
        if (r.id === st.carrier && !['shot', 'goal', 'miss'].includes(k)) { r.wx = bxw; r.wz = bzw; r.urgent = 0.9; r.carrier = true; if (k === 'throwin') r.wz = bzw + (bzw > 0 ? 0.7 : -0.7); /* thrower stands just outside the line */ }
      }
      // restarts
      if (k === 'kickoff') {
        for (const r of rows) {
          if (r.id === st.carrier) { r.wx = bxw - dir * 0.4; r.wz = bzw; r.urgent = 0.7; continue; }
          if (r.isGoalkeeper) continue;
          r.wx = dir > 0 ? Math.min(r.wx, -1.2) : Math.max(r.wx, 1.2);
          if (Math.hypot(r.wx, r.wz) < 9.6 && Math.abs(r.wx) < 9.6) r.wx = (dir > 0 ? -1 : 1) * 10.2;
        }
      }
      if (k === 'pen' || (k === 'shot' && st.lastEv.pen)) {
        const attackEnd = ((st.lastEv.t === t) ? dir : -dir);
        const lineX = (attackEnd > 0 ? 1 : -1) * (PITCH_L / 2 - 16.5 - 1.5);
        for (const r of rows) {
          if (r.isGoalkeeper || this.exempt.has(r.id)) continue;
          const goalSideX = attackEnd > 0 ? PITCH_L / 2 : -PITCH_L / 2;
          const inBox = Math.abs(r.wz) < 20.2 + 1.5 && Math.abs(r.wx - goalSideX) < 16.5 + 1.5;
          if (inBox || Math.abs(r.wx - goalSideX) < 20) { r.wx = attackEnd > 0 ? Math.min(r.wx, lineX) : Math.max(r.wx, lineX); if (Math.abs(r.wz) < 21) r.wz = (r.wz >= 0 ? 1 : -1) * (22 + (hashStr(r.id) % 5)); }
        }
      }
      if (k === 'corner' && st.lastEv.t === t) {
        const endX = dir * (PITCH_L / 2), spots = [[-7, -4], [-9, 3], [-11, -8], [-5.5, 7], [-13, 0], [-8, 9], [-12, 5]];
        let n = 0;
        for (const r of rows) {
          if (r.isGoalkeeper || r.id === st.carrier) continue;
          if (n < 5 && r.entry.sg !== 'DEF') { const s = spots[n++]; r.wx = endX + dir * s[0]; r.wz = s[1] * 1.0; r.urgent = 0.8; }
        }
      }
      if (k === 'corner' && st.lastEv.t !== t) {
        const endX = -dir * 0 + (st.lastEv.t === 'h' ? 1 : -1) * (PITCH_L / 2), spots = [[-4, -3], [-6, 3], [-8, -6], [-3, 6], [-10, 1], [-7, 9]];
        let n = 0;
        for (const r of rows) {
          if (r.isGoalkeeper) { r.wx = endX - (endX > 0 ? 1 : -1) * 1.2; r.wz = clamp(bzw * 0.1, -2.5, 2.5); continue; }
          if (n < 6 && r.entry.sg !== 'ATT') { const s = spots[n++]; r.wx = endX + (endX > 0 ? 1 : -1) * s[0]; r.wz = s[1]; r.urgent = 0.8; }
        }
      }
      for (const r of rows) { r.wx = clamp(r.wx, -PITCH_L / 2 - 1, PITCH_L / 2 + 1); r.wz = clamp(r.wz, -PITCH_W / 2 - 1, PITCH_W / 2 + 1); this.players.push(r); }
    }
    return this;
  }
  rec(id) { return this.recs.get(id); }
}
