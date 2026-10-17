import * as THREE from 'three';
import { ONE_SHOT_CONTACT } from './Match3DAnimations';
import { BALL_R } from './Match3DBall';
import { PITCH_L, PITCH_W, GOAL_W, PEN_SPOT, attackDir, clamp, hashStr, mulberry } from './Match3DMath';

/*
 * Event presentation layer. MatchPlayer remains authoritative: this class only turns the discrete events it has already applied
 * into believable motion (passes travel, shooters strike, keepers dive, ...). It keeps its own *presentation* clock for animation,
 * never touches MatchPlayer state, and can always recover by snapping to the current state (resync).
 */
const MAX_CATCHUP = 8;          // more new events than this in one go = a seek/refresh: snap instead of animating
const MAX_BACKLOG = 4;          // presentation queue length before gates are ignored
const INJURY_GROUND_S = 5;      // seconds of presentation time the injured player stays down
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Director {
  /** ctx: { registry, ball, camera, scene, adapter, ui } where ui = { overlay(o), sfx:{kick,card,sub}, marker(id|null,kind) } */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.player = null; this.setup = null;
    this.t = 0; this.gate = 0; this.queue = []; this.timeline = []; this.lastIdx = 0;
    this.hold = new Map();        // player id -> presentation time before which roster logic must not move them
    this.shot = null; this.injSeq = null; this.waiting = new Set(); this.celebrate = null; this.ts = 1;
    this.rng = mulberry(1); this.warned = new Set(); this._f = v3(0, 0, 0);
    this.refs = null;
  }

  /* ---------- lifecycle ---------- */
  attach(player) {
    this.player = player; this.setup = player.setup;
    this.registry.setContext(player.setup, this.kits);
    this.lastIdx = player.idx;
    this.resync();
  }
  setKits(kits) { this.kits = kits; if (this.player) this.registry.setContext(this.player.setup, kits); }
  later(delay, fn) { this.timeline.push({ at: this.t + Math.max(0, delay), fn }); }
  safe(name, fn) { try { return fn(); } catch (e) { if (!this.warned.has(name)) { this.warned.add(name); console.warn('[3D] presentation error in', name, e); } return undefined; } }

  /** Snap everything to the authoritative state. Used on attach, seeks, reconnects, 2D<->3D switches. No event is replayed. */
  resync() {
    const pl = this.player; if (!pl) return;
    this.queue.length = 0; this.timeline.length = 0; this.gate = 0; this.shot = null; this.celebrate = null; this.hold.clear(); this.waiting.clear();
    this.injSeq = null; this.ui.marker(null); this.exemptClear();
    const st = pl.st;
    this.adapter.update(pl, this.t);
    const keep = new Set(this.adapter.players.map((r) => r.id));
    for (const a of [...this.registry.players3D.values()]) if (!keep.has(a.id)) this.registry.remove(a.id);
    for (const r of this.adapter.players) {
      const a = this.registry.ensure(r.team, r.entry);
      a.state = 'play'; a.clearScript(); a.avatar.release(0.05); a.carrying = false; a.limp = !!r.entry.inj;
      a.place(r.wx, r.wz, a.heading);
    }
    const bp = this.adapter.ball;
    const carrier = st.carrier && this.registry.players3D.get(st.carrier);
    this.ball.place(bp.wx, bp.wz);
    if (carrier && !['shot', 'goal', 'miss'].includes(st.lastEv?.k)) this.ball.carry(carrier);
    if (st.lastEv?.k === 'kickoff' || !st.lastEv) this.ball.place(0, 0);
    this.ensureOfficials();
    this.camera.snap(this.ball.pos);
    this.lastIdx = pl.idx;
  }
  exemptClear() { this.adapter.exempt.clear(); }
  ensureOfficials() {
    if (this.registry.officials.length) return;
    this.refs = {
      ref: this.registry.addOfficial('ref', -6, 8),
      ar1: this.registry.addOfficial('ar', 0, PITCH_W / 2 + 1.2),
      ar2: this.registry.addOfficial('ar', 0, -PITCH_W / 2 - 1.2),
    };
  }

  /* ---------- per-frame ---------- */
  /** dt = real seconds; ts = playback time scale (0 when paused) */
  update(dt, ts) {
    const pl = this.player; if (!pl) return;
    this.ts = ts;
    const dtp = dt * ts;
    this.t += dtp;
    this.detect();
    this.adapter.update(pl, this.t);
    this.drainQueue();
    // timeline
    if (this.timeline.length) {
      const due = [], rest = [];
      for (const it of this.timeline) (it.at <= this.t ? due : rest).push(it);
      this.timeline = rest;
      due.sort((a, b) => a.at - b.at);
      for (const it of due) this.safe('timeline', it.fn);
    }
    this.syncRoster();
    this.driveOfficials();
    this.driveCelebration();
    // agents + ball
    const bpos = this.ball.pos;
    const ballRef = { x: bpos.x, z: bpos.z };
    const mdt = Math.min(dtp, 0.1);
    for (const a of this.registry.all()) this.safe('agent', () => a.update(mdt, ballRef));
    this.separate();
    this.ball.update(mdt);
  }
  detect() {
    const pl = this.player;
    if (pl.setup !== this.setup) { this.setup = pl.setup; this.registry.setContext(pl.setup, this.kits); this.resync(); return; }
    if (pl.idx < this.lastIdx) { this.resync(); return; }
    const n = pl.idx - this.lastIdx;
    if (!n) return;
    const first = pl.events[this.lastIdx], last = pl.events[pl.idx - 1];
    if (n > MAX_CATCHUP || last.s - first.s > 150) { this.resync(); return; }
    for (let i = this.lastIdx; i < pl.idx; i++) this.queue.push({ ev: pl.events[i], at: this.t });
    this.lastIdx = pl.idx;
  }
  drainQueue() {
    while (this.queue.length) {
      const over = this.queue.length > MAX_BACKLOG;
      if (!over && this.t < this.gate) break;
      const { ev } = this.queue.shift();
      this.rng = mulberry(hashStr(this.setup.seed + ':' + ev.i));
      const gap = this.safe('event:' + ev.k, () => this.handle(ev));
      if (gap) this.gate = this.t + gap;
    }
  }

  /* ---------- roster: bodies follow authoritative lineup ---------- */
  syncRoster() {
    const R = this.registry, A = this.adapter;
    const live = new Set();
    for (const r of A.players) {
      live.add(r.id);
      let a = R.players3D.get(r.id);
      if (!a) {
        a = R.ensure(r.team, r.entry);
        const bp = this.scene.benchPoint[r.team];
        a.place(bp.x + (this.rng() - 0.5) * 3, -(PITCH_W / 2 + 0.6), 0); // substitute steps on from the technical area
        if (this.injSeq && this.injSeq.side === r.team) { this.waiting.add(r.id); a.goto(bp.x, -(PITCH_W / 2 + 0.6), { speed: 3, hold: true }); }
        else a.goto(r.wx, r.wz, { speed: 6.8 });
      }
      if (a.state === 'leaving' && !this.hold.has(r.id)) a.state = 'play';
      if (a.state === 'play' && !a.script) a.setTarget(r.wx, r.wz, r.urgent);
      if (a.state === 'play') a.limp = !!r.entry.inj;
      if (r.carrier && a.state === 'play' && this.ball.mode === 'free' && !this.ball.flight && !this.shot && this.ball.pos.distanceTo(this._f.set(r.wx, BALL_R, r.wz)) < 6) this.ball.carry(a);
    }
    for (const a of [...R.players3D.values()]) {
      if (live.has(a.id) || a.state === 'leaving' || a.state === 'gone') continue;
      const until = this.hold.get(a.id);
      if (until !== undefined && this.t < until) continue;
      const injured = this.injSeq && this.injSeq.id === a.id;
      if (injured && this.injSeq.stage !== 'off') continue; // the injury sequence decides when this player walks off
      this.sendOff(a, a.entry && this.lastRed(a.id) ? 'tunnel' : 'bench');
    }
  }
  lastRed(id) { const cs = this.player.st.cards; for (let i = cs.length - 1; i >= 0; i--) if (cs[i].p === id) return cs[i].c === 'r'; return false; }
  sendOff(a, where) {
    a.state = 'leaving'; a.carrying = false;
    const sc = this.scene;
    const tgt = where === 'tunnel' ? sc.tunnelPoint : { x: sc.benchPoint[a.side].x + (this.rng() - 0.5) * 2, z: -(PITCH_W / 2 + 1.6) };
    a.goto(tgt.x, tgt.z, { speed: where === 'tunnel' ? 2.8 : (a.limp ? 1.4 : 3.2), arrive: (ag) => { this.registry.remove(ag.id); } });
  }
  separate() {
    const L = this.registry.all().filter((a) => a.state !== 'gone');
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.state === 'ground' || b.state === 'ground') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.7 - d) * 0.5; a.x -= (dx / d) * push * 0.3; a.z -= (dz / d) * push * 0.3; b.x += (dx / d) * push * 0.3; b.z += (dz / d) * push * 0.3; }
    }
  }
  driveOfficials() {
    const o = this.refs; if (!o) return;
    const b = this.ball.pos;
    if (o.ref.state === 'play' && !o.ref.script) o.ref.setTarget(clamp(b.x - 7, -48, 48), clamp(b.z + (b.z > 0 ? -11 : 11), -26, 26), 0.35);
    if (o.ar1.state === 'play' && !o.ar1.script) o.ar1.setTarget(clamp(b.x, -50, 50), PITCH_W / 2 + 1.4, 0.4);
    if (o.ar2.state === 'play' && !o.ar2.script) o.ar2.setTarget(clamp(b.x, -50, 50), -PITCH_W / 2 - 1.4, 0.4);
  }
  driveCelebration() {
    const c = this.celebrate; if (!c) return;
    if (this.t >= c.until) { this.endCelebration(); }
  }
  endCelebration() {
    const c = this.celebrate; if (!c) return;
    this.celebrate = null;
    for (const id of c.ids) { const a = this.registry.players3D.get(id); if (a && a.state === 'play') { a.clearScript(); a.avatar.release(0.4); } }
    this.camera.clearMoment();
  }

  /* ---------- helpers ---------- */
  A(id) { return id ? this.registry.players3D.get(id) : null; }
  gkOf(side) { for (const a of this.registry.players3D.values()) if (a.side === side && a.gk && a.state !== 'leaving') return a; return null; }
  goalX(side) { return attackDir(side) * (PITCH_L / 2); } // x of the goal a side attacks
  sfxKick() { this.ui.sfx?.kick?.(); }
  ground(a, anim, holdAnim = true) { a.state = 'ground'; a.clearScript(); a.avatar.play(anim, { hold: holdAnim, fadeIn: 0.08 }); }
  rise(a) { if (!a || a.state === 'gone') return; a.avatar.play('getup', { fadeIn: 0.1 }); this.later(1.0, () => { if (a.state === 'ground') { a.state = 'play'; } }); }
  /** run so that the arrival is roughly `T` seconds from now */
  runIn(a, x, z, T, opts = {}) { const d = Math.hypot(x - a.x, z - a.z); a.goto(x, z, { speed: clamp(d / Math.max(0.2, T), 1.6, 11.5), ...opts }); }
  /** strike the ball from agent `a` after the animation's contact frame */
  strike(a, anim, kick, ts = 1, hand = false) {
    a.avatar.play(anim, { timeScale: ts });
    const contact = (ONE_SHOT_CONTACT[anim] || 0.27) / ts;
    this.later(contact, () => {
      if (hand) this._f.set(a.x + Math.sin(a.heading) * 0.35, 2.05, a.z + Math.cos(a.heading) * 0.35); else a.footPoint(this._f, 0.5);
      this.ball.drop(); kick(this._f.clone()); if (!hand) this.sfxKick();
    });
  }
  lookahead(i, kinds) { const ev = this.player.events; for (let k = i + 1; k < Math.min(ev.length, i + 6); k++) if (kinds.includes(ev[k].k)) return ev[k]; return null; }

  /* ---------- the event table ---------- */
  handle(ev) {
    this._prev = this.restart; this.restart = null; // set-piece context from the previous event (e.g. a throw-in taker)
    switch (ev.k) {
      case 'kickoff': return this.onKickoff(ev);
      case 'pass': return this.onPass(ev);
      case 'dribble': return this.onDribble(ev);
      case 'tackle': return this.onTackle(ev);
      case 'interception': return this.onIntercept(ev);
      case 'foul': return this.onFoul(ev);
      case 'yellow': case 'red': return this.onCard(ev);
      case 'pen': return this.onPen(ev);
      case 'shot': return this.onShot(ev);
      case 'goal': return this.onGoal(ev);
      case 'save': return this.onSave(ev);
      case 'miss': return this.onMiss(ev);
      case 'corner': return this.onCorner(ev);
      case 'throwin': return this.onThrowIn(ev);
      case 'offside': return this.onOffside(ev);
      case 'goalkick': return this.onGoalKick(ev);
      case 'injury': return this.onInjury(ev);
      case 'sub': return this.onSub(ev);
      case 'halftime': return this.onHalf(ev, 'ht');
      case 'fulltime': return this.onHalf(ev, 'ft');
      default: return 0;
    }
  }

  onKickoff(ev) {
    this.endCelebration(); this.shot = null; this.exemptClear();
    this.ball.place(0, 0);
    const k = this.A(ev.p); if (k) { k.clearScript(); k.goto(-attackDir(ev.t) * 0.5, 0, { speed: 5, arrive: (a) => this.ball.carry(a) }); }
    const r = this.refs?.ref; if (r) { r.clearScript(); r.goto(-9, 6, { speed: 5 }); }
    this.camera.clearMoment();
    return 0;
  }

  onPass(ev) {
    const p = this.A(ev.p), q = this.A(ev.q), B = this.adapter.ball;
    const dest = v3(B.wx, BALL_R, B.wz);
    if (!p) { this.ball.kick(dest, 0.5, { arc: 0.1 }); return 0; }
    if (q) {
      const vr = clamp(q.vmax * 0.95, 4, 8.5), dR = Math.hypot(dest.x - q.x, dest.z - q.z);
      const dist = p.footPoint(this._f, 0.5).distanceTo(dest);
      const air = dist > 22;
      let T = clamp(dist / (air ? 18 : 15.5), 0.38, 1.35);
      T = Math.max(T, Math.min(dR / vr * 0.92, 1.45));
      const reach = vr * (T + 0.25);
      if (dR > reach) { dest.x = q.x + ((dest.x - q.x) / dR) * reach; dest.z = q.z + ((dest.z - q.z) / dR) * reach; }
      p.faceToward(dest.x, dest.z);
      const thr = this._prev && this._prev.k === 'throwin' && this._prev.id === ev.p; // taking a throw-in
      const anim = thr || (p.gk && dist < 30 && this.ball.mode === 'held') ? 'throw' : 'pass';
      const arc = thr ? 1.2 + dist * 0.05 : air ? Math.min(7, dist * 0.17) : 0.1 + dist * 0.004;
      this.strike(p, anim, (from) => {
        this.ball.kick(dest, T, { arc, from: thr ? from : from.setY(0.25), onDone: () => { if (q.state === 'play') { this.ball.carry(q); q.avatar.play('receive', { timeScale: 1.25 }); } } });
        q.goto(dest.x, dest.z, { speed: vr, face: { x: p.x, z: p.z } });
      }, 1.25, thr);
      q.goto(dest.x, dest.z, { speed: vr * 0.8, face: { x: p.x, z: p.z } });
    }
    return 0;
  }

  onDribble(ev) {
    const p = this.A(ev.p); if (!p) return 0;
    p.clearScript(); this.ball.carry(p); p.urgent = 1;
    return 0;
  }

  onTackle(ev) {
    const d = this.A(ev.p), v = this.A(ev.q); if (!d) return 0;
    const B = this.adapter.ball;
    const px = v ? v.x : B.wx, pz = v ? v.z : B.wz;
    const T = 0.8;
    d.clearScript(); this.runIn(d, px - Math.sin(d.heading) * 0.2, pz, T);
    this.later(T * 0.55, () => { d.faceToward(px, pz); d.avatar.play('tackle', { timeScale: 1.2 }); });
    this.later(T * 0.55 + 0.17, () => {
      this.ball.drop(); if (v) v.carrying = false;
      this.sfxKick();
      this.ball.kick(v3(d.x + Math.sin(d.heading) * 0.5, BALL_R, d.z + Math.cos(d.heading) * 0.5), 0.3, { arc: 0.35, from: this.ball.pos, onDone: () => { if (d.state === 'play') this.ball.carry(d); } });
      if (v && this.rng() < 0.38) { this.ground(v, 'fall', true); this.later(1.5, () => this.rise(v)); }
    });
    return 0;
  }

  onIntercept(ev) {
    const p = this.A(ev.p), q = this.A(ev.q), B = this.adapter.ball; if (!p) return 0;
    const dest = v3(B.wx, BALL_R, B.wz);
    if (q) {
      q.faceToward(dest.x, dest.z);
      const dist = Math.hypot(dest.x - q.x, dest.z - q.z), T = clamp(dist / 15, 0.4, 1.1);
      this.runIn(p, dest.x, dest.z, T * 0.9, { face: { x: q.x, z: q.z } });
      this.strike(q, 'pass', (from) => { this.ball.kick(dest, T, { arc: 0.12, from: from.setY(0.25), onDone: () => { if (p.state === 'play') this.ball.carry(p); } }); }, 1.25);
      this.later(0.27 / 1.25 + T - 0.25, () => p.avatar.play('intercept', { timeScale: 1.2 }));
    } else { p.goto(dest.x, dest.z, { speed: 8 }); this.ball.kick(dest, 0.5, { onDone: () => this.ball.carry(p) }); }
    return 0;
  }

  onFoul(ev) {
    const f = this.A(ev.p), v = this.A(ev.q), ref = this.refs?.ref;
    const B = this.adapter.ball; const at = v3(v ? v.x : B.wx, 0, v ? v.z : B.wz);
    this.ball.drop(); this.ball.mode = 'free'; this.ball.vx = this.ball.vz = 0;
    const T = 0.6;
    if (f) { f.clearScript(); this.runIn(f, at.x - Math.sin(f.heading) * 0.4, at.z - Math.cos(f.heading) * 0.4, T); this.later(T * 0.5, () => { f.faceToward(at.x, at.z); f.avatar.play(this.rng() < 0.45 ? 'slide' : 'tackle', { timeScale: 1.2 }); }); }
    this.later(T, () => {
      if (v) { this.ground(v, 'fall', true); this.later(1.9, () => this.rise(v)); }
      this.ball.place(at.x, at.z + 0.6);
      if (ref) { ref.clearScript(); ref.avatar.play('ref_whistle'); this.later(0.9, () => { ref.faceToward(at.x, at.z); ref.avatar.play('ref_point'); }); this.runIn(ref, at.x - 7, at.z + (at.z > 0 ? -6 : 6), 1.6); }
    });
    this.camera.setMoment('foul', at, 2.4);
    this.ui.overlay({ kind: 'foul', title: 'Foul', team: ev.t === 'h' ? 'a' : 'h' });
    return 0.5;
  }

  onCard(ev) {
    const P = this.A(ev.p), ref = this.refs?.ref, red = ev.k === 'red';
    this.ui.sfx?.card?.();
    this.ui.overlay({ kind: red ? 'red' : 'yellow', title: red ? 'Red card' : 'Yellow card', sub: this.nameOf(ev.t, ev.p), team: ev.t });
    this.hold.set(ev.p, this.t + 2.6);
    if (P) {
      this.camera.setMoment('card', v3(P.x, 0, P.z), 2.6);
      if (P.state === 'play') { P.clearScript(); P.goto(P.x, P.z, { speed: 0, hold: true }); }
      this.later(0.25, () => { if (ref) { P.faceToward(ref.x, ref.z); P.avatar.play('gesture', { loop: true, hold: true }); } });
      this.later(2.3, () => { if (P.state === 'play') { P.clearScript(); P.avatar.release(0.3); } });
    }
    if (ref && P) {
      ref.clearScript();
      const ang = Math.atan2(P.x - ref.x, P.z - ref.z);
      this.runIn(ref, P.x - Math.sin(ang) * 2.4, P.z - Math.cos(ang) * 2.4, 0.5, { face: { x: P.x, z: P.z } });
      this.later(0.45, () => { ref.faceToward(P.x, P.z); ref.avatar.play('ref_card', { hold: true }); this.showCard(ref, red); });
      this.later(2.4, () => { ref.avatar.release(0.3); this.hideCard(ref); });
    }
    return 0.4;
  }
  showCard(ref, red) {
    if (!ref.card) {
      ref.card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      ref.card.position.set(0, -0.36, 0.01); ref.card.rotation.set(0, Math.PI / 2, 0); ref.avatar.bones.foreArmR.add(ref.card);
    }
    ref.card.material.color.set(red ? '#e11d2e' : '#ffd51f'); ref.card.visible = true;
  }
  hideCard(ref) { if (ref.card) ref.card.visible = false; }
  nameOf(side, id) { const e = this.registry.entryOf(side, id); return e ? e.name : ''; }

  penTaker(side) {
    let best = null;
    for (const p of this.player.st.sides[side].lineup) if (p.on && p.sg !== 'GK' && (!best || p.a.sho > best.a.sho)) best = p;
    return best;
  }
  onPen(ev) {
    const dir = attackDir(ev.t), gx = dir * PITCH_L / 2, spotX = gx - dir * PEN_SPOT;
    this.ball.drop(); this.ball.place(spotX, 0);
    const take = this.penTaker(ev.t), tk = take && this.A(take.id), gk = this.gkOf(ev.t === 'h' ? 'a' : 'h');
    this.exempt(take && take.id); if (gk) this.exempt(gk.id);
    if (tk) { tk.clearScript(); tk.state = 'play'; tk.x = spotX - dir * 9; tk.z = 3.5; tk.goto(spotX - dir * 2.6, 0.9, { speed: 2.6, face: { x: gx, z: 0 } }); }
    if (gk) { gk.clearScript(); gk.goto(gx - dir * 0.8, 0, { speed: 5, face: { x: spotX, z: 0 } }); }
    this.camera.setMoment('penalty', v3(gx, 0, 0), 3.2, dir);
    this.ui.overlay({ kind: 'pen', title: 'Penalty', team: ev.t });
    return 0.8;
  }
  exempt(id) { if (id) this.adapter.exempt.add(id); }

  /** Stage a shot using the outcome hint (ev.o) when present, otherwise look ahead in the log, otherwise stay generic. */
  onShot(ev) {
    const dir = attackDir(ev.t), gx = dir * PITCH_L / 2, side = ev.t, opp = side === 'h' ? 'a' : 'h';
    const s = this.A(ev.p), gk = this.gkOf(opp);
    const next = this.lookahead(ev.i, ['goal', 'save', 'miss']);
    const o = ev.o || (next ? (next.k === 'miss' ? (next.bl ? 'block' : next.post ? 'post' : 'miss') : next.k) : 'unknown');
    const aimZ = clamp(((ev.y ?? 0.5) - 0.5) / 0.09 * 3.0, -3.0, 3.0);
    const r = this.rng;
    const sgn = r() < 0.5 ? -1 : 1;
    let tx = gx, tz = aimZ, ty = 0.5 + r() * 1.5, kind = o;
    let end = null;
    if (o === 'goal') { end = v3(gx + dir * 1.6, 0.3 + ty * 0.7, aimZ); ty = clamp(ty, 0.4, 2.0); tz = aimZ; }
    else if (o === 'save') { tx = gx - dir * 0.7; ty = 0.6 + r() * 1.3; }
    else if (o === 'post') { tz = sgn * GOAL_W / 2; ty = 1.1; }
    else if (o === 'miss') {
      const ty0 = ev.ty ?? (sgn > 0 ? 0.7 : 0.3);
      if (r() < 0.45) { tz = clamp(((ty0 - 0.5) * 68) * 0.45, -9, 9); if (Math.abs(tz) < 4.4) tz = (tz < 0 ? -1 : 1) * 5.2; ty = 0.7; }
      else { tz = aimZ * 0.7; ty = 4 + r() * 1.5; }
      end = v3(gx + dir * 7, ty * 0.9, tz * 1.15);
    } else if (o === 'block') { tx = gx - dir * (7 + r() * 3); tz = clamp(aimZ * 1.5, -4, 4); ty = 0.5; }
    else { tx = gx - dir * 1.2; ty = 1.0; }
    const aim = v3(tx, ty, tz);
    const pen = !!ev.pen;
    const shot = { ev, o, kind, aim, end, dir, gx, gk, side, opp, arrived: false, resolved: false, saveEv: null };
    this.shot = shot;
    const run = () => {
      if (s) { s.faceToward(gx, tz); }
      const from = s ? s.footPoint(this._f, 0.5).clone().setY(0.25) : this.ball.pos.clone();
      const dist = from.distanceTo(end || aim);
      const dur = clamp(dist / (pen ? 24 : 27), 0.34, 0.8);
      shot.dur = dur;
      const strikeIt = (f) => {
        const arc = (o === 'miss' && ty > 3) ? 0.5 : 0.25;
        this.ball.kick(end || aim, dur, { arc, from: f.setY(Math.max(0.2, f.y)), onDone: () => this.shotArrived(shot), endSpeed: end ? 3 : 0 });
        this.later(Math.max(0.05, dur * 0.1), () => this.keeperReact(shot));
      };
      if (s) { if (pen) { s.clearScript(); s.goto(gx - dir * (PEN_SPOT + 0.55), 0.2, { speed: 4, face: { x: gx, z: 0 } }); } this.strike(s, 'shoot', strikeIt, 1.35); }
      else strikeIt(from);
    };
    if (pen) this.later(0.25, run); else run();
    this.camera.setMoment(pen ? 'penalty' : 'shot', v3(gx, 0, 0), pen ? 2.2 : 1.6, dir);
    return 0;
  }
  keeperReact(shot) {
    const gk = shot.gk; if (!gk || gk.state !== 'play' || shot.o === 'miss' || shot.o === 'block') return;
    const target = shot.aim;
    const dx = target.x - gk.x, dz = target.z - gk.z;
    const lat = dx * Math.cos(gk.heading) - dz * Math.sin(gk.heading);
    gk.clearScript();
    const beaten = shot.o === 'goal';
    if (Math.abs(lat) < 0.9 && Math.abs(dz) < 1.1) { gk.avatar.play('gk_save', { timeScale: 1.25 }); return; }
    gk.avatar.play(lat > 0 ? 'gk_dive_l' : 'gk_dive_r', { hold: true, timeScale: beaten ? 1.0 : 1.3 });
    gk.goto(clamp(gk.x, -PITCH_L / 2, PITCH_L / 2), clamp(target.z, -3.6, 3.6), { speed: Math.min(5.5, Math.abs(dz) * 2.2 + 1), hold: true });
    shot.dove = gk;
    this.later(1.6, () => { if (gk.state === 'play') { gk.avatar.release(0.4); gk.clearScript(); } });
  }
  shotArrived(shot) {
    shot.arrived = true;
    const o = shot.o;
    if (o === 'goal') { this.scene.netHit(shot.dir, this.ball.pos, 1); this.ball.free(shot.dir * 0.5, 0); shot.resolved = true; this.scene.roar(0.8); }
    else if (o === 'post') { this.scene.roar(0.4); this.ball.free(-shot.dir * 5, (shot.aim.z > 0 ? 1 : -1) * 3.5); this.ball.vy = 3; shot.resolved = true; }
    else if (o === 'block') { const b = this.nearestOpp(shot); this.ball.free(-shot.dir * 3 + this.rng() * 2, (this.rng() - 0.5) * 8); this.ball.vy = 2; if (b) { b.avatar.play('jump', { timeScale: 1.2 }); } shot.resolved = true; }
    else if (o === 'miss') { shot.resolved = true; this.scene.roar(0.25); }
    else if (o === 'save') { if (shot.saveEv) this.resolveSave(shot); else this.later(0.4, () => this.resolveSave(shot)); }
    else if (o === 'unknown') { this.later(0.5, () => { if (!shot.resolved && this.shot === shot) { this.ball.free(shot.dir * 0.5, 0); shot.resolved = true; } }); }
  }
  nearestOpp(shot) { let best = null, bd = 1e9; for (const a of this.registry.players3D.values()) if (a.side === shot.opp && !a.gk && a.state === 'play') { const d = Math.hypot(a.x - shot.aim.x, a.z - shot.aim.z); if (d < bd) { bd = d; best = a; } } return best; }

  onSave(ev) {
    const shot = this.shot;
    if (shot && !shot.resolved) { shot.saveEv = ev; if (shot.arrived) this.resolveSave(shot); return 0; }
    // no staged shot (resync mid-chain): present a simple save
    const gk = this.A(ev.p); if (gk) { gk.avatar.play('gk_catch'); this.ball.hold(gk); }
    return 0;
  }
  resolveSave(shot) {
    if (shot.resolved) return; shot.resolved = true;
    const gk = shot.gk || this.A(shot.saveEv?.p), ev = shot.saveEv;
    this.scene.roar(0.5);
    this.camera.setMoment('save', v3(shot.gx, 0, shot.aim.z), 1.8, shot.dir);
    if (ev && ev.parry) {
      gk?.avatar.play('gk_parry', { timeScale: 1.2 });
      this.ball.free(-shot.dir * 2.5, (shot.aim.z >= 0 ? 1 : -1) * 7); this.ball.vy = 3.2;
    } else if (gk) {
      this.ball.hold(gk); gk.carrying = false;
      if (!gk.avatar.busy) gk.avatar.play('gk_catch');
      this.later(0.5, () => { if (this.ball.mode === 'held' && this.ball.agent === gk && gk.state === 'play') { this.ball.carry(gk); } });
    }
  }

  onMiss(ev) {
    const shot = this.shot;
    if (shot && shot.ev.p === ev.p) { shot.resolved = shot.resolved || false; return 0; }
    // unstaged miss (resync): let the ball roll out past the line
    const dir = attackDir(ev.t); this.ball.free(dir * 3, (this.rng() - 0.5) * 4); return 0;
  }

  onGoal(ev) {
    const dir = attackDir(ev.t), shot = this.shot;
    const sc = this.A(ev.p);
    this.exemptClear();
    if (!shot || shot.o !== 'goal' || shot.resolved === false && !shot.arrived && !this.ball.flight) {
      // not staged (e.g. resync mid-chain): put the ball in the net
      const gx = dir * PITCH_L / 2;
      this.ball.kick(v3(gx + dir * 1.6, 0.8, (ev.y - 0.5) * 6), 0.4, { arc: 0.2, onDone: () => { this.scene.netHit(dir, this.ball.pos, 1); this.ball.free(dir * 0.5, 0); } });
    }
    this.scene.roar(1.4);
    this.ui.overlay({ kind: 'goal', title: 'GOAL!', sub: this.nameOf(ev.t, ev.p), team: ev.t });
    const gx = dir * PITCH_L / 2;
    this.camera.setMoment('goal', v3(gx, 0, sc ? sc.z : 0), 3.0, dir);
    // celebration (bounded)
    const delay = this.ball.flight ? Math.min(0.5, this.ball.flight.dur - this.ball.flight.t) : 0.12;
    this.later(Math.max(0.05, delay), () => {
      if (!sc || sc.state === 'gone') return;
      const zc = (sc.z >= 0 ? 1 : -1) * (PITCH_W / 2 - 4);
      const cx = gx - dir * 10;
      const ids = [sc.id];
      sc.clearScript(); sc.state = 'play'; sc.carrying = false;
      sc.goto(cx, zc, { speed: Math.min(8.5, sc.vmax), arrive: (a) => { a.avatar.play('celebrate', { loop: true, hold: true }); } });
      const mates = [...this.registry.players3D.values()].filter((a) => a.side === ev.t && a.id !== sc.id && !a.gk && a.state === 'play').sort((a, b) => Math.hypot(a.x - sc.x, a.z - sc.z) - Math.hypot(b.x - sc.x, b.z - sc.z)).slice(0, 4);
      mates.forEach((m, i) => { ids.push(m.id); m.clearScript(); m.goto(cx - dir * (1.8 + i * 0.7), zc + (i - 1.5) * 1.6 * (zc > 0 ? -1 : 1), { speed: m.vmax * 0.9, arrive: (a) => { a.avatar.play('celebrate', { loop: true, hold: true }); } }); });
      this.celebrate = { until: this.t + 3.4, ids };
      const r = this.refs?.ref; if (r) { r.clearScript(); r.goto(-1, 3, { speed: 5 }); r.avatar.play('ref_point'); this.later(1.2, () => r.avatar.release(0.3)); }
    });
    return 0;
  }

  onCorner(ev) {
    const dir = attackDir(ev.t), x = dir * (PITCH_L / 2 - 0.3), z = (ev.y < 0.5 ? -1 : 1) * (PITCH_W / 2 - 0.3);
    this.ball.drop(); this.ball.place(x, z);
    const t = this.A(ev.p);
    if (t) { t.clearScript(); t.state = 'play'; this.runIn(t, x - dir * 0.4, z - Math.sign(z) * 0.5, 1.0, { face: { x: dir * 40, z: 0 }, arrive: (a) => this.ball.carry(a) }); }
    this.camera.setMoment('corner', v3(x, 0, z), 3.2, dir);
    this.ui.overlay({ kind: 'corner', title: 'Corner', team: ev.t });
    return 0.5;
  }
  /** Ball crosses the touchline: it rolls out, the taker jogs to the spot just outside the line and holds it overhead. */
  onThrowIn(ev) {
    const edge = ev.y < 0.5 ? -1 : 1, zEdge = edge * (PITCH_W / 2), bx = this.adapter.ball.wx;
    const spot = v3(bx, BALL_R, zEdge);
    this.ball.drop(); this.shot = null;
    this.ball.kick(spot, 0.5, { arc: 1.1, from: this.ball.pos.clone() });
    const t = this.A(ev.p);
    if (t) {
      t.clearScript(); t.state = 'play';
      this.runIn(t, bx, zEdge + edge * 0.7, 0.9, { face: { x: bx, z: 0 }, arrive: (a) => { this.ball.hold(a, 2.0); a.faceToward(bx, 0); } });
    }
    this.restart = { k: 'throwin', id: ev.p };
    return 0.3;
  }

  /**
   * Offside: the pass is played, the assistant referee raises the flag, the referee whistles, an offside line is shown where
   * the attacker stood, and the other side takes the free kick from that spot.
   */
  onOffside(ev) {
    const off = this.A(ev.p), pas = this.A(ev.q), taker = this.A(ev.x), B = this.adapter.ball, dirA = attackDir(ev.t);
    const spot = v3(B.wx, BALL_R, B.wz);
    const ar = Math.abs(spot.z - this.refs.ar1.z) < Math.abs(spot.z - this.refs.ar2.z) ? this.refs.ar1 : this.refs.ar2;
    let T = 0.6;
    if (pas) {
      const dist = Math.hypot(spot.x - pas.x, spot.z - pas.z); T = clamp(dist / 16, 0.45, 1.05);
      pas.faceToward(spot.x, spot.z);
      this.strike(pas, 'pass', (from) => { this.ball.kick(spot.clone().setX(spot.x + dirA * 0.6), T, { arc: 0.15, from: from.setY(0.25), endSpeed: 0 }); }, 1.25);
    } else this.ball.kick(spot, T, {});
    if (off) { off.clearScript(); off.goto(spot.x, spot.z, { speed: off.vmax, face: pas ? { x: pas.x, z: pas.z } : null }); }
    this.later(T * 0.55 + 0.3, () => {
      if (ar) { ar.avatar.play('ref_card', { hold: true }); this.showFlag(ar, true); }
      this.scene.flashOffsideLine(spot.x);
      const r = this.refs.ref; if (r) { r.clearScript(); r.avatar.play('ref_whistle'); this.later(0.8, () => r.avatar.release(0.3)); }
      this.camera.setMoment('foul', spot, 2.2);
    });
    this.later(T + 1.0, () => {
      if (ar) { ar.avatar.release(0.3); this.showFlag(ar, false); }
      this.ball.place(spot.x, spot.z);
      if (taker) { taker.clearScript(); taker.state = 'play'; this.runIn(taker, spot.x - dirA * 0.5, spot.z, 0.5, { arrive: (a) => this.ball.carry(a) }); }
    });
    this.ui.overlay({ kind: 'offside', title: 'Offside', team: ev.t });
    return 0.5;
  }
  showFlag(ar, on) {
    if (!ar.flag) {
      ar.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ color: '#ffd21f', side: THREE.DoubleSide }));
      ar.flag.position.set(0, -0.5, 0.02); ar.flag.rotation.set(0, Math.PI / 2, 0); ar.avatar.bones.foreArmR.add(ar.flag);
    }
    ar.flag.visible = !!on;
  }

  onGoalKick(ev) {
    const dir = attackDir(ev.t), gx = -dir * PITCH_L / 2, x = gx + dir * 6.2;
    this.ball.drop(); this.ball.place(x, 0);
    const k = this.A(ev.p); if (k) { k.clearScript(); k.state = 'play'; this.runIn(k, x - dir * 0.5, 0, 1.0, { face: { x: -gx, z: 0 }, arrive: (a) => this.ball.carry(a) }); }
    return 0;
  }

  onInjury(ev) {
    const a = this.A(ev.p); if (!a || this.injSeq) return 0;
    const seq = { id: ev.p, side: ev.t, stage: 'down', t0: this.t };
    this.injSeq = seq; this.hold.set(ev.p, Infinity);
    if (this.ball.agent === a) { this.ball.drop(); this.ball.free(0.5, 0); }
    a.carrying = false; a.clearScript(); a.state = 'ground'; a.avatar.play('fall', { hold: true });
    this.later(0.95, () => { if (this.injSeq === seq) a.avatar.play('injured', { loop: true, hold: true, fadeIn: 0.35 }); });
    this.ui.marker(a, 'injury');
    this.ui.overlay({ kind: 'injury', title: 'Injury', sub: a.entry?.name || '', team: ev.t });
    this.camera.setMoment('injury', v3(a.x, 0, a.z), INJURY_GROUND_S, 1);
    // physio runs on from the tunnel
    const P = this.registry.physio || (this.registry.physio = this.registry.addOfficial('physio', this.scene.tunnelPoint.x, this.scene.tunnelPoint.z));
    P.state = 'play'; P.avatar.root.visible = true; P.avatar.release(0.05); P.place(this.scene.tunnelPoint.x, this.scene.tunnelPoint.z + 0.5, 0); P.clearScript();
    this.runIn(P, a.x + 1.2, a.z + (a.z > 0 ? -0.3 : 0.3), 1.8, { arrive: (p) => { p.faceToward(a.x, a.z); p.avatar.play('kneel', { loop: true, hold: true }); } });
    // after five seconds on the ground: get up and be escorted off (or play on if there is no replacement)
    this.later(INJURY_GROUND_S, () => {
      if (this.injSeq !== seq) return;
      a.avatar.play('getup', { fadeIn: 0.15 }); P.avatar.release(0.3);
      this.later(1.1, () => {
        if (this.injSeq !== seq) return;
        a.state = 'play'; a.limp = true;
        const stillOn = this.adapter.players.some((r) => r.id === a.id);
        if (stillOn) { this.finishInjury(seq, P); return; }
        seq.stage = 'off'; this.hold.delete(a.id);
        const bp = this.scene.benchPoint[a.side];
        this.sendOff(a, 'bench');
        P.goto(bp.x + 1.2, -(PITCH_W / 2 + 1.6), { speed: 1.5, arrive: (p) => { p.avatar.root.visible = false; } });
        a.script.arrive = (ag) => { this.registry.remove(ag.id); this.finishInjury(seq, P); };
      });
    });
    return 0;
  }
  finishInjury(seq, P) {
    if (this.injSeq !== seq) return;
    this.injSeq = null; this.ui.marker(null); this.hold.delete(seq.id);
    this.camera.clearMoment();
    if (P) { this.runIn(P, this.scene.tunnelPoint.x, this.scene.tunnelPoint.z, 4, { arrive: (p) => { p.state = 'gone'; p.avatar.root.visible = false; } }); }
    for (const id of [...this.waiting]) {
      this.waiting.delete(id);
      const a = this.registry.players3D.get(id), r = this.adapter.rec(id);
      if (a && r) { a.clearScript(); a.goto(r.wx, r.wz, { speed: 6.8 }); }
    }
  }

  onSub(ev) {
    this.ui.sfx?.sub?.();
    this.ui.overlay({ kind: 'sub', title: 'Substitution', sub: `${this.nameOf(ev.t, ev.q)} on · ${this.nameOf(ev.t, ev.p)} off`, team: ev.t, num: [this.registry.entryOf(ev.t, ev.q)?.num, this.registry.entryOf(ev.t, ev.p)?.num] });
    return 0;
  }

  onHalf(ev, kind) {
    this.endCelebration(); this.shot = null; this.exemptClear();
    this.ball.drop(); this.ball.place(0, 0);
    this.ui.overlay({ kind, title: kind === 'ht' ? 'Half time' : 'Full time' });
    const r = this.refs?.ref; if (r) { r.clearScript(); r.avatar.play('ref_whistle'); }
    if (kind === 'ft') {
      this.camera.clearMoment();
      for (const a of this.registry.players3D.values()) if (a.state === 'play') { const d = this.rng(); this.later(0.6 + d * 1.2, () => { if (a.state === 'play') { a.clearScript(); a.goto(a.x * 0.8, a.z * 0.8, { speed: 1.4, arrive: (x) => x.avatar.play('clap', { loop: true, hold: true }) }); } }); }
    }
    return 0;
  }
}
