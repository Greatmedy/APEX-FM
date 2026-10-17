import * as THREE from 'three';
import { ONE_SHOT_CONTACT } from './Match3DAnimations';
import { BALL_R } from './Match3DBall';
import { PITCH_L, PITCH_W, GOAL_W, PEN_SPOT, attackDir, angDiff, clamp, hashStr, mulberry } from './Match3DMath';

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
    this.injSeq = null; this.ui.marker(null); this.exemptClear(); this.setPiece = null; this.wall = null; this.pendingCross = null;
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
  /** Seated substitutes, standing coaches and camera operators. Rebuilt only when a bench changes. */
  syncStaff() {
    const R = this.registry, sc = this.scene, st = this.player.st, tier = this.registry.q.name;
    if (!this.staffInit) {
      this.staffInit = true; this.benchKey = { h: '', a: '' }; this.coachT = 4;
      const suit = { shirt: '#16233e', shorts: '#0f1624', socks: '#0f1624', number: '#ffffff' };
      this.coaches = ['h', 'a'].map((side) => { const b = sc.benchPoint[side]; const c = R.addStaff('coach', side, b.x + 2.6 * (side === 'h' ? 1 : -1), -(PITCH_W / 2 + 0.9), 0, { colors: suit, seed: 'coach' + side }); c.avatar.play('idle', { loop: true, hold: true }); return c; });
      const hv = { shirt: '#ff7a1a', shorts: '#1b1f2a', socks: '#1b1f2a', number: '#1b1f2a' };
      const spots = [[1, 9], [1, -9], [-1, 9], [-1, -9]].map(([sx, sz]) => [sx * (PITCH_L / 2 + 8.4), sz]);
      if (tier !== 'low') spots.push([-14, PITCH_W / 2 + 6.6]);
      this.crew = spots.slice(0, tier === 'low' ? 2 : 5).map(([x, z], i) => {
        const c = R.addStaff('crew', 'o', x, z, Math.atan2(-x, -z), { colors: hv, seed: 'crew' + i });
        const rig = new THREE.Group();
        const body = new THREE.Mesh(this.cameraGeo || (this.cameraGeo = new THREE.BoxGeometry(0.3, 0.26, 0.5)), this.cameraMat || (this.cameraMat = new THREE.MeshLambertMaterial({ color: '#23272f' })));
        const lens = new THREE.Mesh(this.lensGeo || (this.lensGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.4, 10)), this.cameraMat); lens.rotation.x = Math.PI / 2; lens.position.z = 0.42;
        rig.add(body, lens); rig.position.set(-0.17, 0.02, 0.28); c.avatar.bones.chest.add(rig); c.rig = rig;
        return c;
      });
    }
    const cap = tier === 'low' ? 3 : 7;
    for (const side of ['h', 'a']) {
      const ids = st.sides[side].bench.filter((p) => !p.on).slice(0, cap);
      const key = ids.map((p) => p.id).join(',');
      if (key === this.benchKey[side]) continue;
      this.benchKey[side] = key;
      for (const a of R.staff.filter((x) => x.kind === 'bench' && x.side === side)) R.removeStaff(a);
      const b = sc.benchPoint[side];
      ids.forEach((p, i) => {
        const x = b.x + (i - (ids.length - 1) / 2) * 0.95;
        const lf = this.registry.lookFor(p, side);
        const a = R.addStaff('bench', side, x, -(PITCH_W / 2 + 2.75), 0, { entry: p, colors: { shirt: lf.shirt, shorts: lf.shorts, socks: lf.socks, number: lf.number }, seed: p.id, appearanceId: p.id });
        a.avatar.play('sit', { loop: true, hold: true, fadeIn: 0.01 });
      });
    }
  }
  /** Coaches gesture now and then; the whole bench of the scoring side jumps up for a goal. */
  driveStaff(dtp) {
    if (!this.coaches) return;
    this.coachT -= dtp;
    if (this.coachT <= 0) {
      this.coachT = 6 + this.rng() * 7;
      const c = this.coaches[Math.floor(this.rng() * 2)];
      if (c && !c.avatar.busy) { c.avatar.play('gesture', { timeScale: 0.9 }); }
    }
  }
  benchCelebrate(side) {
    for (const a of this.registry.staff) if (a.kind === 'bench' && a.side === side) { a.avatar.play('celebrate', { loop: true, hold: true }); this.later(3.2, () => a.avatar.play('sit', { loop: true, hold: true })); }
    const c = this.coaches?.[side === 'h' ? 0 : 1]; if (c) { c.avatar.play('celebrate', { loop: true, hold: true }); this.later(2.6, () => c.avatar.play('idle', { loop: true, hold: true })); }
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
    this.syncStaff(); this.driveStaff(dtp);
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
    const L = this.registry.all().filter((a) => a.state !== 'gone' && !['bench', 'coach', 'crew'].includes(a.kind));
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
  /** Strike the ball after the animation's contact frame. mode: foot | hand | head. extra = seconds spent turning first. */
  strike(a, anim, kick, ts = 1, mode = false, extra = 0) {
    if (mode === true) mode = 'hand';
    if (extra > 0.02) this.later(extra, () => a.avatar.play(anim, { timeScale: ts })); else a.avatar.play(anim, { timeScale: ts });
    const contact = (ONE_SHOT_CONTACT[anim] || 0.27) / ts + extra;
    this.later(contact, () => {
      if (mode === 'hand') this._f.set(a.x + Math.sin(a.heading) * 0.35, 2.05, a.z + Math.cos(a.heading) * 0.35);
      else if (mode === 'head') this._f.set(a.x + Math.sin(a.heading) * 0.15, 2.05, a.z + Math.cos(a.heading) * 0.15);
      else a.footPoint(this._f, 0.5);
      this.ball.drop(); kick(this._f.clone()); if (mode !== 'hand') this.sfxKick();
    });
    return contact;
  }
  /** Seconds the player needs to turn to face (x, z) before striking. */
  turnDelay(a, x, z) { return clamp(Math.abs(angDiff(a.heading, Math.atan2(x - a.x, z - a.z))) / 6.5, 0, 0.55); }
  lookahead(i, kinds) { const ev = this.player.events; for (let k = i + 1; k < Math.min(ev.length, i + 6); k++) if (kinds.includes(ev[k].k)) return ev[k]; return null; }

  /* ---------- the event table ---------- */
  handle(ev) {
    if (this.setPiece && !['shot', 'freekick', 'pen'].includes(ev.k)) this.endSetPiece();
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
      case 'freekick': return this.onFreeKick(ev);
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

  /** A pass always arrives at the receiver: the ball is aimed at where he is (plus a lead if he is running). */
  onPass(ev) {
    const p = this.A(ev.p), q = this.A(ev.q), B = this.adapter.ball;
    if (!p || !q) { this.ball.kick(v3(B.wx, BALL_R, B.wz), 0.5, { arc: 0.1 }); return 0; }
    const thr = !!(this._prev && this._prev.k === 'throwin' && this._prev.id === ev.p);
    const cross = !!ev.cr;
    const lead = clamp(Math.min(q.speed, 7) * 0.35, 0, 2.2);
    const dest = v3(q.x + Math.sin(q.heading) * lead, BALL_R, q.z + Math.cos(q.heading) * lead);
    const dist = Math.hypot(dest.x - p.x, dest.z - p.z);
    const air = cross || dist > 24;
    const T = cross ? clamp(dist / 17, 0.9, 1.5) : clamp(dist / (air ? 19 : dist < 10 ? 12.5 : 16), 0.34, 1.35);
    const arc = thr ? 1.2 + dist * 0.05 : cross ? Math.min(9, 3 + dist * 0.18) : air ? Math.min(8, dist * 0.17) : 0.08 + dist * 0.004;
    p.faceToward(dest.x, dest.z);
    const anim = thr || (p.gk && this.ball.mode === 'held') ? 'throw' : 'pass';
    const delay = this.turnDelay(p, dest.x, dest.z);
    const pend = { q, dest, handled: false, arrive: this.t + delay + (ONE_SHOT_CONTACT[anim] || 0.27) / 1.25 + T };
    this.pendingCross = cross ? pend : null;
    q.clearScript(); q.goto(dest.x, dest.z, { speed: 3, face: { x: p.x, z: p.z }, hold: true });
    this.strike(p, anim, (from) => {
      this.ball.kick(dest, T, { arc, from: thr ? from : from.setY(0.22), onDone: () => {
        if (pend.handled) return;
        q.clearScript();
        if (q.state === 'play') { this.ball.carry(q); q.avatar.play('receive', { timeScale: 1.25 }); }
      } });
    }, 1.25, thr ? 'hand' : false, delay);
    return 0;
  }

  onDribble(ev) {
    const p = this.A(ev.p); if (!p) return 0;
    p.clearScript(); this.ball.carry(p); p.urgent = 1;
    return 0;
  }

  /** A soft tackle: no foul. The defender runs at the carrier, goes in cleanly (standing, or a clean slide) and wins the ball. */
  onTackle(ev) {
    const d = this.A(ev.p), v = this.A(ev.q); if (!d) return 0;
    const slide = !!ev.sl;
    let done = false;
    const go = () => {
      if (done) return; done = true; d.clearScript();
      if (v) d.faceToward(v.x, v.z);
      const anim = slide ? 'slide' : 'tackle';
      if (slide && v) d.goto(v.x - Math.sin(d.heading) * 0.2, v.z - Math.cos(d.heading) * 0.2, { speed: 5.5 });
      d.avatar.play(anim, { timeScale: slide ? 1.15 : 1.25 });
      this.later((ONE_SHOT_CONTACT[anim] || 0.2) / (slide ? 1.15 : 1.25), () => {
        this.sfxKick(); this.ball.drop(); if (v) { v.carrying = false; v.avatar.play('turn', { timeScale: 1.3 }); }
        this.ball.kick(v3(d.x + Math.sin(d.heading) * 0.5, BALL_R, d.z + Math.cos(d.heading) * 0.5), 0.28, { arc: 0.22, from: this.ball.pos.clone(), onDone: () => { if (d.state === 'play') this.ball.carry(d); } });
      });
    };
    d.clearScript();
    if (v) d.chase(v, { speed: clamp(d.vmax * 1.15, 5, 9.5), stop: slide ? 2.3 : 1.0, arrive: go }); else d.goto(this.adapter.ball.wx, this.adapter.ball.wz, { speed: 8, arrive: go });
    this.later(1.7, go);
    return 0;
  }

  /** A misplaced pass: it heads for a team-mate, but a defender steps onto the line and takes it. */
  onIntercept(ev) {
    if (ev.cl) return this.onCornerClear(ev);
    const p = this.A(ev.p), q = this.A(ev.q), B = this.adapter.ball; if (!p) return 0;
    if (!q) { p.goto(B.wx, B.wz, { speed: 8 }); this.ball.kick(v3(B.wx, BALL_R, B.wz), 0.5, { onDone: () => this.ball.carry(p) }); return 0; }
    const dir = attackDir(q.side);
    let intended = null, best = 1e9;
    for (const a of this.registry.players3D.values()) {
      if (a.side !== q.side || a === q || a.gk || a.state !== 'play') continue;
      const d = Math.hypot(a.x - q.x, a.z - q.z), ahead = (a.x - q.x) * dir > -2;
      const score = Math.abs(d - 16) + (ahead ? 0 : 12);
      if (d > 6 && score < best) { best = score; intended = a; }
    }
    const tgt = intended ? v3(intended.x, BALL_R, intended.z) : v3(B.wx, BALL_R, B.wz);
    const cut = v3(q.x + (tgt.x - q.x) * 0.55, BALL_R, q.z + (tgt.z - q.z) * 0.55);
    const dist = Math.hypot(cut.x - q.x, cut.z - q.z), T = clamp(dist / 15, 0.4, 1.1);
    const delay = this.turnDelay(q, tgt.x, tgt.z);
    q.faceToward(tgt.x, tgt.z);
    p.clearScript(); this.runIn(p, cut.x, cut.z, delay + 0.28 + T * 0.85, { face: { x: q.x, z: q.z } });
    this.strike(q, 'pass', (from) => { this.ball.kick(cut, T, { arc: 0.12, from: from.setY(0.22), onDone: () => { p.clearScript(); if (p.state === 'play') this.ball.carry(p); } }); }, 1.25, false, delay);
    this.later(delay + 0.22 + T - 0.25, () => p.avatar.play('intercept', { timeScale: 1.2 }));
    return 0;
  }

  /** A hard tackle (standing or sliding): the fouler goes in late, the victim goes down, the referee whistles and signals. */
  onFoul(ev) {
    const f = this.A(ev.p), v = this.A(ev.q), ref = this.refs?.ref;
    const B = this.adapter.ball; const at = v3(v ? v.x : B.wx, 0, v ? v.z : B.wz);
    const slide = !!ev.sl;
    let done = false;
    const go = () => {
      if (done) return; done = true; if (f) f.clearScript();
      const anim = slide ? 'slide' : 'tackle';
      if (f) { if (v) f.faceToward(v.x, v.z); f.avatar.play(anim, { timeScale: slide ? 1.1 : 1.15 }); if (slide && v) f.goto(v.x, v.z, { speed: 5.5 }); }
      this.later((ONE_SHOT_CONTACT[anim] || 0.2) / 1.12, () => {
        this.sfxKick(); this.ball.drop();
        if (v) { v.carrying = false; this.ground(v, 'fall', true); this.later(1.9, () => this.rise(v)); }
        this.ball.free((this.rng() - 0.5) * 2, (this.rng() - 0.5) * 2);
        if (ref) { ref.clearScript(); ref.avatar.play('ref_whistle'); this.later(0.9, () => { ref.faceToward(at.x, at.z); ref.avatar.play('ref_point'); }); this.runIn(ref, at.x - 6, at.z + (at.z > 0 ? -5 : 5), 1.6); }
      });
    };
    if (f) { f.clearScript(); if (v) f.chase(v, { speed: clamp(f.vmax * 1.15, 5, 9.5), stop: slide ? 2.3 : 1.0, arrive: go }); }
    this.later(1.7, go);
    this.camera.setMoment('foul', at, 2.6);
    this.ui.overlay({ kind: 'foul', title: slide ? 'Foul: sliding tackle' : 'Foul: hard tackle', team: ev.t === 'h' ? 'a' : 'h' });
    if (ev.warn && f) this.later(2.0, () => this.warn(f));
    return 0.5;
  }
  /** No card: the referee walks over and has a word with the player. */
  warn(f) {
    const ref = this.refs?.ref; if (!ref || f.state !== 'play') return;
    this.ui.overlay({ kind: 'warn', title: 'Warning', sub: f.entry?.name || '', team: f.side });
    ref.clearScript(); ref.state = 'play';
    const ang = Math.atan2(f.x - ref.x, f.z - ref.z);
    this.runIn(ref, f.x - Math.sin(ang) * 2.2, f.z - Math.cos(ang) * 2.2, 0.8, { face: { x: f.x, z: f.z } });
    this.later(0.7, () => { ref.faceToward(f.x, f.z); ref.avatar.play('ref_point', { hold: true }); f.faceToward(ref.x, ref.z); f.avatar.play('gesture', { loop: true, hold: true }); });
    this.later(2.2, () => { ref.avatar.release(0.3); f.avatar.release(0.3); });
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
  /** Penalty: the taker stands with the ball on the spot, the keeper is on his line, everyone else waits outside the box and arc. */
  onPen(ev) {
    const dir = attackDir(ev.t), gx = dir * PITCH_L / 2, spotX = gx - dir * PEN_SPOT;
    this.ball.drop(); this.ball.place(spotX, 0);
    const take = this.penTaker(ev.t), tk = take && this.A(take.id), gk = this.gkOf(ev.t === 'h' ? 'a' : 'h'), ref = this.refs?.ref;
    this.exempt(take && take.id); if (gk) this.exempt(gk.id);
    this.setPiece = { k: 'pen', ids: [take && take.id, gk && gk.id].filter(Boolean) };
    if (tk) {
      tk.clearScript(); tk.state = 'play';
      if (Math.hypot(tk.x - spotX, tk.z) > 7) { tk.x = spotX - dir * 4; tk.z = 2; } // cut: the walk to the spot is not shown
      tk.goto(spotX - dir * 1.1, 0.35, { speed: 2.4, face: { x: gx, z: 0 }, hold: true });
    }
    if (gk) { gk.clearScript(); gk.goto(gx - dir * 0.6, 0, { speed: 5, face: { x: spotX, z: 0 }, hold: true }); }
    if (ref) { ref.clearScript(); this.runIn(ref, spotX - dir * 11, 9, 1.4, { face: { x: spotX, z: 0 } }); this.later(1.3, () => { ref.avatar.play('ref_whistle'); this.later(0.8, () => ref.avatar.release(0.3)); }); }
    this.camera.setMoment('penalty', v3(gx, 0, 0), 3.4, dir);
    this.ui.overlay({ kind: 'pen', title: 'Penalty', team: ev.t });
    return 1.5;
  }
  /** Players hold their positions during a set piece until it is taken; this lets everyone go again. */
  endSetPiece() {
    const sp = this.setPiece; if (!sp) return;
    this.setPiece = null; this.wall = null;
    for (const id of sp.ids || []) { const a = this.A(id); if (a && a.state === 'play') { a.clearScript(); a.avatar.release(0.3); } }
    this.exemptClear();
  }
  /** Direct free kick: opponents form a wall 9.15 m away while the taker waits behind the ball. Without a wall it is just played on. */
  onFreeKick(ev) {
    const side = ev.t, opp = side === 'h' ? 'a' : 'h', dir = attackDir(side), B = this.adapter.ball;
    const spot = v3(B.wx, BALL_R, B.wz), taker = this.A(ev.p), ref = this.refs?.ref;
    this.ball.drop(); this.ball.place(spot.x, spot.z);
    if (!ev.wall) {
      if (taker) { taker.clearScript(); taker.state = 'play'; this.runIn(taker, spot.x - dir * 0.5, spot.z, 0.9, { arrive: (a) => this.ball.carry(a) }); }
      this.ui.overlay({ kind: 'freekick', title: 'Free kick', team: side });
      return 0.3;
    }
    const gx = dir * PITCH_L / 2, dxg = gx - spot.x, dzg = -spot.z, dl = Math.hypot(dxg, dzg) || 1, ux = dxg / dl, uz = dzg / dl;
    const n = clamp(Math.round(dl / 6), 3, 5);
    const defenders = [...this.registry.players3D.values()].filter((a) => a.side === opp && !a.gk && a.state === 'play').sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z)).slice(0, n);
    const ids = [];
    defenders.forEach((d, i) => {
      const off = (i - (n - 1) / 2) * 0.85;
      d.clearScript(); ids.push(d.id);
      this.runIn(d, spot.x + ux * 9.3 - uz * off, spot.z + uz * 9.3 + ux * off, 1.3, { face: { x: spot.x, z: spot.z }, hold: true });
    });
    const gk = this.gkOf(opp); if (gk) { gk.clearScript(); gk.goto(gx - dir * 1.0, clamp(spot.z * 0.1, -2.5, 2.5) + (spot.z > 0 ? -1.6 : 1.6), { speed: 5, face: { x: spot.x, z: spot.z }, hold: true }); ids.push(gk.id); }
    if (taker) { taker.clearScript(); taker.state = 'play'; ids.push(taker.id); this.runIn(taker, spot.x - ux * 3.2 + uz * 1.2, spot.z - uz * 3.2 - ux * 1.2, 1.0, { face: { x: spot.x, z: spot.z }, hold: true }); }
    if (ref) { ref.clearScript(); this.runIn(ref, spot.x + ux * 4.6 + uz * 3, spot.z + uz * 4.6 - ux * 3, 1.2, { face: { x: spot.x, z: spot.z } }); this.later(1.2, () => { ref.avatar.play('ref_whistle'); this.later(0.8, () => ref.avatar.release(0.3)); }); }
    this.exempt(taker && taker.id);
    this.setPiece = { k: 'freekick', ids }; this.wall = { ids: defenders.map((d) => d.id), spot, ux, uz };
    this.camera.setMoment('freekick', v3(spot.x, 0, spot.z), 3.6, dir);
    this.ui.overlay({ kind: 'freekick', title: 'Free kick', team: side });
    return 1.4;
  }
  exempt(id) { if (id) this.adapter.exempt.add(id); }

  onShot(ev) {
    const dir = attackDir(ev.t), gx = dir * PITCH_L / 2, side = ev.t, opp = side === 'h' ? 'a' : 'h';
    const s = this.A(ev.p), gk = this.gkOf(opp);
    const pen = !!ev.pen, fk = !!ev.fk, hd = !!ev.hd;
    const next = this.lookahead(ev.i, ['goal', 'save', 'miss']);
    const o = ev.o || (next ? (next.k === 'miss' ? (next.bl ? 'block' : next.post ? 'post' : 'miss') : next.k) : 'unknown');
    let aimZ = clamp(((ev.y ?? 0.5) - 0.5) / 0.09 * 3.0, -3.0, 3.0);
    if (o === 'save' && gk) aimZ = clamp(aimZ, gk.z - 2.8, gk.z + 2.8); // a save is made where the keeper can reach
    aimZ = clamp(aimZ, -3.2, 3.2);
    const r = this.rng, sgn = r() < 0.5 ? -1 : 1;
    let tx = gx, tz = aimZ, ty = 0.5 + r() * 1.5, end = null, arc = 0.25, curve = 0;
    if (o === 'goal') { end = v3(gx + dir * 1.6, 0.3 + ty * 0.7, aimZ); ty = clamp(ty, 0.4, 2.0); }
    else if (o === 'save') { tx = (gk ? gk.x : gx - dir * 0.7) - dir * 0.45; ty = 0.5 + r() * 1.4; }
    else if (o === 'post') { tz = sgn * GOAL_W / 2; ty = 1.1; }
    else if (o === 'miss') {
      const ty0 = ev.ty ?? (sgn > 0 ? 0.7 : 0.3);
      if (fk || r() < 0.45) { tz = clamp(((ty0 - 0.5) * 68) * 0.45, -9, 9); if (Math.abs(tz) < 4.4) tz = (tz < 0 ? -1 : 1) * 5.2; ty = 0.7; if (fk && r() < 0.5) { tz = aimZ * 0.6; ty = 3.4; } }
      else { tz = aimZ * 0.7; ty = 4 + r() * 1.5; }
      end = v3(gx + dir * 7, ty * 0.9, tz * 1.15); arc = ty > 3 ? 0.5 : 0.25;
    } else if (o === 'block') { tx = gx - dir * (7 + r() * 3); tz = clamp(aimZ * 1.5, -4, 4); ty = 0.5; }
    else { tx = gx - dir * 1.2; ty = 1.0; }
    let blocker = null;
    if (o === 'block' && fk && this.wall) { blocker = this.A(this.wall.ids[Math.floor(r() * this.wall.ids.length)]); if (blocker) { tx = blocker.x; tz = blocker.z; ty = 1.35; arc = 0.1; } }
    else if (fk && this.wall) { arc = o === 'goal' || o === 'save' ? 2.7 : arc + 2.4; curve = (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.2); } // bent over the wall
    if (hd) { arc = 0.35; }
    const aim = v3(tx, ty, tz);
    const shot = { ev, o, kind: o, aim, end, dir, gx, gk, side, opp, arrived: false, resolved: false, saveEv: null, blocker };
    this.shot = shot;
    const run = () => {
      if (s) s.faceToward(gx, tz);
      const head = hd, ts = pen ? 1.0 : 1.35;
      const from = s ? (head ? v3(s.x, 2.05, s.z) : s.footPoint(this._f, 0.5).clone().setY(0.25)) : this.ball.pos.clone();
      const dist = from.distanceTo(end || aim);
      const dur = clamp(dist / (pen ? 24 : hd ? 21 : fk ? 22 : 27), 0.34, 0.95);
      shot.dur = dur;
      const strikeIt = (f) => {
        this.ball.kick(end || aim, dur, { arc, curve, from: head ? f : f.setY(Math.max(0.2, f.y)), onDone: () => this.shotArrived(shot), endSpeed: end ? 3 : 0 });
        this.later(Math.max(0.05, dur * 0.1), () => this.keeperReact(shot));
        if (fk && this.wall) for (const id of this.wall.ids) { const w = this.A(id); if (w && w.state === 'play' && !w.gk) w.avatar.play('jump', { timeScale: 1.35 }); }
        this.later(2.4, () => this.endSetPiece());
      };
      if (!s) { strikeIt(from); return; }
      if (hd) {
        const pc = this.pendingCross; if (pc) pc.handled = true;
        const extra = pc ? Math.max(0, pc.arrive - this.t - 0.46) : 0;
        if (pc) { s.clearScript(); s.goto(pc.dest.x, pc.dest.z, { speed: 4, hold: true }); }
        this.strike(s, 'header', strikeIt, 1, 'head', extra);
        this.later(extra + 0.9, () => { s.clearScript(); });
      } else if (pen) {
        s.clearScript(); s.goto(gx - dir * (PEN_SPOT + 0.55), 0.2, { speed: 3.2, face: { x: gx, z: 0 } });
        this.strike(s, 'shoot', strikeIt, ts, false, 0.15);
      } else if (fk && this.wall) {
        s.clearScript(); s.goto(this.wall.spot.x - this.wall.ux * 0.7, this.wall.spot.z - this.wall.uz * 0.7, { speed: 4.2, face: { x: gx, z: 0 } });
        this.strike(s, 'shoot', strikeIt, ts, false, 0.55);
      } else this.strike(s, 'shoot', strikeIt, ts, false, this.turnDelay(s, gx, tz));
    };
    run();
    if (fk && this.wall) this.camera.setMoment('freekick', v3(this.wall.spot.x, 0, this.wall.spot.z), 2.8, dir);
    else this.camera.setMoment(pen ? 'penalty' : 'shot', v3(gx, 0, 0), pen ? 2.6 : 1.6, dir);
    return 0;
  }
  /** The keeper moves to the exact point where the ball will arrive, so a save is made with the hands on the ball. */
  keeperReact(shot) {
    const gk = shot.gk; if (!gk || gk.state !== 'play' || shot.o === 'miss' || shot.o === 'block') return;
    const target = shot.aim;
    const dx = target.x - gk.x, dz = target.z - gk.z;
    const lat = dx * Math.cos(gk.heading) - dz * Math.sin(gk.heading);
    gk.clearScript();
    const beaten = shot.o === 'goal';
    if (Math.abs(lat) < 0.9 && Math.abs(dz) < 1.1) { gk.avatar.play(target.y > 1.4 ? 'gk_save' : 'gk_catch', { timeScale: 1.25 }); return; }
    gk.avatar.play(lat > 0 ? 'gk_dive_l' : 'gk_dive_r', { hold: true, timeScale: beaten ? 0.9 : 1.3 });
    const T = Math.max(0.25, (shot.dur || 0.6) * 0.8);
    gk.goto(clamp(gk.x, -PITCH_L / 2, PITCH_L / 2), clamp(target.z, -3.6, 3.6), { speed: clamp(Math.abs(dz) / T, 1, 8), hold: true });
    shot.dove = gk;
    this.later(1.6, () => { if (gk.state === 'play') { gk.avatar.release(0.4); gk.clearScript(); } });
  }
  shotArrived(shot) {
    shot.arrived = true;
    const o = shot.o;
    if (o === 'goal') { this.scene.netHit(shot.dir, this.ball.pos, 1); this.ball.free(shot.dir * 0.5, 0); shot.resolved = true; this.scene.roar(0.8, shot.side); }
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
    this.scene.roar(1.4, ev.t); this.benchCelebrate(ev.t);
    this.ui.overlay({ kind: 'goal', title: 'GOAL!', sub: this.nameOf(ev.t, ev.p), team: ev.t });
    const gx = dir * PITCH_L / 2;
    this.camera.setMoment('goal', v3(gx, 0, sc ? sc.z : 0), 3.0, dir);
    this.later(3.0, () => this.ui.replay?.({ dir, gx: dir * PITCH_L / 2 })); // single 5 second replay of the goal
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

  /** Corner: the taker waits at the flag, attackers crowd the box and defenders mark them until the ball is delivered. */
  onCorner(ev) {
    const dir = attackDir(ev.t), x = dir * (PITCH_L / 2 - 0.3), z = (ev.y < 0.5 ? -1 : 1) * (PITCH_W / 2 - 0.3), opp = ev.t === 'h' ? 'a' : 'h';
    this.ball.drop(); this.ball.place(x, z);
    const t = this.A(ev.p), gk = this.gkOf(opp);
    this.setPiece = { k: 'corner', ids: [ev.p] };
    if (t) { t.clearScript(); t.state = 'play'; this.runIn(t, x - dir * 0.5, z - Math.sign(z) * 0.5, 1.0, { face: { x: dir * 40, z: 0 }, arrive: (a) => this.ball.carry(a) }); }
    if (gk) { gk.clearScript(); gk.goto(dir * (PITCH_L / 2) - dir * 1.2, clamp(z * 0.08, -2, 2), { speed: 5, face: { x: x, z: z } }); }
    this.camera.setMoment('corner', v3(x, 0, z), 3.4, dir);
    this.ui.overlay({ kind: 'corner', title: 'Corner', team: ev.t });
    return 1.0;
  }
  /** A corner delivery that is dealt with: a defender heads it clear, or the goalkeeper claims it. */
  onCornerClear(ev) {
    const p = this.A(ev.p), B = this.adapter.ball, pc = this.pendingCross;
    if (pc) pc.handled = true;
    if (!p) return 0;
    const arriveIn = pc ? Math.max(0, pc.arrive - this.t) : 0.5;
    p.clearScript();
    if (pc) p.goto(pc.dest.x, pc.dest.z, { speed: 6, hold: true });
    if (ev.gk) {
      this.later(Math.max(0, arriveIn - 0.35), () => p.avatar.play('gk_save', { timeScale: 1.1 }));
      this.later(arriveIn, () => { p.clearScript(); this.ball.drop(); this.ball.hold(p, 1.9); this.later(0.7, () => { if (this.ball.mode === 'held' && this.ball.agent === p) this.ball.carry(p); }); });
    } else {
      this.later(Math.max(0, arriveIn - 0.46), () => p.avatar.play('header'));
      this.later(arriveIn, () => {
        p.clearScript(); this.ball.drop(); this.sfxKick();
        this.ball.kick(v3(B.wx, BALL_R, B.wz), 0.9, { arc: 4, from: v3(p.x, 2.0, p.z), onDone: () => this.ball.free((this.rng() - 0.5) * 3, (this.rng() - 0.5) * 3) });
      });
    }
    return 0;
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
