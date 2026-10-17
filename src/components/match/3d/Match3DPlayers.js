import * as THREE from 'three';
import { cloneFootballer, appearanceFor, paletteTexture, kitPalette, numberTexture } from './Match3DAssets';
import { buildClips, LOCO } from './Match3DAnimations';
import { clamp, damp, angDiff, hashStr, PITCH_L, PITCH_W } from './Match3DMath';
import { GK_KIT } from '../../../lib/kits';

const _plane = new THREE.PlaneGeometry(0.27, 0.27);
let CLIPS = null;
export const getClips = () => CLIPS || (CLIPS = buildClips());
const LOCO_CLIPS = ['idle', 'walk', 'jog', 'run', 'sprint', 'dribble', 'limp', 'gk_ready'];

/** One footballer body: skinned mesh + AnimationMixer + locomotion blending + one-shot overrides. */
export class Avatar {
  constructor(look, castShadow) {
    const { root, mesh, bones } = cloneFootballer(look.appearance.hairStyle);
    this.root = new THREE.Group(); this.root.add(root);
    this.mesh = mesh; this.bones = bones; this.skinRoot = root;
    this.mesh.castShadow = castShadow;
    this.palette = null; this.numTex = null; this.decal = null;
    this.mixer = new THREE.AnimationMixer(root);
    const clips = getClips();
    this.loco = {};
    for (const n of LOCO_CLIPS) {
      const a = this.mixer.clipAction(clips[n]); a.setEffectiveWeight(n === 'idle' ? 1 : 0); a.play();
      this.loco[n] = { a, w: n === 'idle' ? 1 : 0 };
    }
    this.over = null; this.overName = null;
    this.root.scale.set(look.appearance.build, look.appearance.height, look.appearance.build);
    this.setLook(look);
  }
  setLook(look) {
    const ap = look.appearance;
    this.palette?.dispose();
    this.palette = paletteTexture(kitPalette({ skin: ap.skin, hair: ap.hair, shirt: look.shirt, shorts: look.shorts, socks: look.socks, number: look.number, goalkeeper: look.goalkeeper }));
    this.mesh.material.map = this.palette; this.mesh.material.needsUpdate = true;
    this.numTex?.dispose();
    if (!this.decal && look.num != null) {
      this.decal = new THREE.Mesh(_plane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.decal.rotation.y = Math.PI; this.decal.position.set(0, -0.03, -0.128);
      this.bones.chest.add(this.decal);
    }
    if (this.decal) {
      this.numTex = numberTexture(look.num, look.name, look.number);
      this.decal.material.map = this.numTex; this.decal.material.needsUpdate = true;
      this.decal.visible = look.num != null;
    }
  }
  /** speed in m/s; style: normal | dribble | limp | gk */
  locomote(speed, dt, style = 'normal') {
    const t = {}; for (const n of LOCO_CLIPS) t[n] = 0;
    let ts = 1;
    if (style === 'gk' && speed < 1.3) { t.gk_ready = 1; }
    else if (style === 'limp' && speed > 0.15) { t.limp = 1; ts = clamp(speed / 1.2, 0.5, 1.2); }
    else if (style === 'dribble' && speed > 1.6) { t.dribble = 1; ts = clamp(speed / 4.0, 0.7, 1.5); }
    else {
      let i = 0; while (i < LOCO.length - 2 && speed > LOCO[i + 1][1]) i++;
      const [n0, s0] = LOCO[i], [n1, s1] = LOCO[i + 1];
      const k = clamp((speed - s0) / (s1 - s0), 0, 1);
      t[n0] = 1 - k; t[n1] = k;
      if (speed > 0.2) ts = clamp(speed / (k > 0.5 ? s1 : Math.max(s0, 1.5)), 0.55, 1.45);
    }
    const ow = this.over ? clamp(this.over.a.getEffectiveWeight(), 0, 1) : 0;
    const f = damp(16, dt);
    for (const n of LOCO_CLIPS) {
      const L = this.loco[n]; L.w += (t[n] - L.w) * f;
      L.a.setEffectiveWeight(L.w * (1 - ow) + 1e-5);
      if (n !== 'idle' && n !== 'gk_ready' && t[n] > 0) L.a.setEffectiveTimeScale(ts);
    }
  }
  /** Play a one-shot (or held) clip over locomotion. */
  play(name, { fadeIn = 0.1, fadeOut = 0.2, hold = false, loop = false, timeScale = 1 } = {}) {
    const clip = getClips()[name]; if (!clip) return null;
    if (this.over) { this.over.a.fadeOut(0.08); this.over.a.stopAfter = true; this.retired = this.retired || []; this.retired.push(this.over.a); }
    const a = this.mixer.clipAction(clip);
    a.reset(); a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true; a.setEffectiveTimeScale(timeScale); a.setEffectiveWeight(1);
    a.fadeIn(fadeIn); a.play();
    this.over = { a, name, dur: clip.duration / Math.max(0.01, timeScale), fadeOut, hold, loop, fading: false };
    this.overName = name;
    return a;
  }
  release(fadeOut = 0.25) { const o = this.over; if (o && !o.fading) { o.a.fadeOut(fadeOut); o.fading = true; o.releaseAt = fadeOut; } }
  get busy() { return !!this.over && !this.over.fading; }
  update(dt) {
    const o = this.over;
    if (o && !o.fading && !o.hold && !o.loop && o.a.time >= o.a.getClip().duration - o.fadeOut * o.a.getEffectiveTimeScale()) { o.a.fadeOut(o.fadeOut); o.fading = true; }
    if (o && o.fading && o.a.getEffectiveWeight() < 0.02) { o.a.stop(); this.over = null; this.overName = null; }
    if (this.retired) this.retired = this.retired.filter((a) => { if (a.getEffectiveWeight() < 0.02) { a.stop(); return false; } return true; });
    this.mixer.update(dt);
  }
  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.skinRoot);
    this.palette?.dispose(); this.numTex?.dispose(); this.decal?.material.dispose();
    this.mesh.skeleton.dispose(); this.mesh.material.dispose();
    this.root.removeFromParent();
  }
}

/** A footballer in the match. Id is the existing APEX player id. Moves toward targets supplied by the adapter or a script. */
export class Agent {
  constructor(id, side, entry, look, castShadow, kind = 'player') {
    this.id = id; this.side = side; this.entry = entry; this.kind = kind;
    this.avatar = new Avatar(look, castShadow);
    this.x = 0; this.z = 0; this.speed = 0; this.heading = side === 'a' ? -Math.PI / 2 : Math.PI / 2;
    this.tx = 0; this.tz = 0; this.script = null; this.faceX = 0; this.faceZ = 0;
    this.state = 'play'; // play | ground | leaving | gone
    this.limp = false; this.carrying = false; this.urgent = 0;
    const pac = entry?.a?.pac ?? 70;
    this.vmax = clamp(6.2 + (pac - 60) * 0.065, 4.8, 9.2) * (entry?.g === 'GK' ? 0.82 : 1);
    this.gk = !!look.goalkeeper;
    this.onArrive = null;
    this.sep = 0;
  }
  place(x, z, heading) { this.x = x; this.z = z; this.tx = x; this.tz = z; this.speed = 0; if (heading != null) this.heading = heading; this.sync(); }
  setTarget(x, z, urgent = 0) { this.tx = x; this.tz = z; this.urgent = urgent; }
  /** Scripted run: overrides the adapter target until arrived (or cleared). */
  goto(x, z, { speed = null, face = null, arrive = null, hold = false } = {}) { this.script = { x, z, speed, face, arrive, hold, done: false }; }
  clearScript() { this.script = null; }
  /** Run at a moving target and stop `stop` metres short on the side we come from. Used for tackles. */
  chase(target, { speed = null, stop = 1.0, arrive = null } = {}) { this.script = { x: target.x, z: target.z, speed, face: null, arrive, hold: false, done: false, follow: target, stop }; }
  faceToward(x, z) { this.faceX = x; this.faceZ = z; }
  update(dt, ball) {
    if (this.kind === 'bench' || this.kind === 'coach' || this.kind === 'crew') { this.staffUpdate(dt, ball); return; }
    const sc = this.script;
    if (sc && sc.follow) {
      const f = sc.follow, dx0 = this.x - f.x, dz0 = this.z - f.z, d0 = Math.hypot(dx0, dz0) || 1;
      sc.x = f.x + (dx0 / d0) * sc.stop; sc.z = f.z + (dz0 / d0) * sc.stop;
      sc.face = { x: f.x, z: f.z };
    }
    let tx = this.tx, tz = this.tz, cap = this.vmax * (0.55 + 0.45 * this.urgent);
    if (this.limp) cap *= 0.45;
    if (this.state === 'ground') { tx = this.x; tz = this.z; }
    if (sc && this.state !== 'ground') { tx = sc.x; tz = sc.z; if (sc.speed != null) cap = sc.speed; }
    const dx = tx - this.x, dz = tz - this.z, dist = Math.hypot(dx, dz);
    let want = 0;
    if (dist > 0.35) want = Math.min(cap, Math.max(0.6, dist * 2.4));
    if (this.state === 'ground') want = 0;
    const acc = want > this.speed ? 7.5 : 10;
    this.speed += clamp(want - this.speed, -acc * dt, acc * dt);
    if (this.speed > 0.01 && dist > 1e-3) {
      const step = Math.min(this.speed * dt, dist);
      this.x += (dx / dist) * step; this.z += (dz / dist) * step;
    }
    // heading: face movement when moving, otherwise the ball / scripted focus
    let want_h = this.heading;
    if (this.speed > 0.9 && dist > 0.5) want_h = Math.atan2(dx, dz);
    else if (sc && sc.face) want_h = Math.atan2(sc.face.x - this.x, sc.face.z - this.z);
    else if (this.faceX || this.faceZ) want_h = Math.atan2(this.faceX - this.x, this.faceZ - this.z);
    else if (ball) want_h = Math.atan2(ball.x - this.x, ball.z - this.z);
    if (this.state !== 'ground' || this.script) this.heading += clamp(angDiff(this.heading, want_h), -7 * dt, 7 * dt);
    if (sc && !sc.done && dist < 0.5 && this.state !== 'ground') {
      sc.done = true;
      if (sc.arrive) { const f = sc.arrive; sc.arrive = null; f(this); }
      if (!sc.hold && this.script === sc) this.script = null;
    }
    this.x = clamp(this.x, -PITCH_L / 2 - 14, PITCH_L / 2 + 14); this.z = clamp(this.z, -PITCH_W / 2 - 12, PITCH_W / 2 + 12);
    const style = this.state === 'ground' ? 'normal' : this.gk ? 'gk' : this.limp ? 'limp' : this.carrying ? 'dribble' : 'normal';
    this.avatar.locomote(this.state === 'ground' ? 0 : this.speed, dt, style);
    this.avatar.update(dt);
    this.sync();
  }
  /** Seated substitutes, coaches and camera operators stay put; crew and coaches turn to follow the ball. */
  staffUpdate(dt, ball) {
    if (this.kind !== 'bench' && ball) {
      const want = Math.atan2(ball.x - this.x, ball.z - this.z), lim = this.kind === 'crew' ? 1.1 : 0.9;
      const base = this.baseHeading ?? 0, d = clamp(angDiff(base, want), -lim, lim);
      this.heading += clamp(angDiff(this.heading, base + d), -3 * dt, 3 * dt);
    }
    this.avatar.locomote(0, dt, 'normal'); this.avatar.update(dt); this.sync();
  }
  sync() { const r = this.avatar.root; r.position.set(this.x, 0, this.z); r.rotation.y = this.heading; }
  /** Right foot position in world space (for ball release). */
  footPoint(out, forward = 0.45) { out.set(this.x + Math.sin(this.heading) * forward, 0.12, this.z + Math.cos(this.heading) * forward); return out; }
  dispose() { this.avatar.dispose(); }
}

/** Owns every 3D body. Keyed by the existing player id: players3D[id]. */
export class PlayerRegistry {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    this.players3D = new Map();
    this.officials = [];
    this.staff = [];
    this.physio = null;
    this.kits = null; this.setup = null;
  }
  setContext(setup, kits) { this.setup = setup; this.kits = kits; this.relook(); }
  lookFor(entry, side) {
    const k = this.kits[side], kit = this.setup[side].kit || {};
    const isGK = entry.sg === 'GK' && entry.g === 'GK';
    const gk = GK_KIT[side];
    let shorts = kit.shorts || k.number;
    if (colorDist(shorts, k.shirt) < 50) shorts = k.number;
    const socks = colorDist(shorts, k.shirt) > 120 ? shorts : k.shirt;
    return {
      appearance: appearanceFor(entry.id), shirt: isGK ? gk.shirt : k.shirt, number: isGK ? gk.number : k.number,
      shorts: isGK ? '#12161f' : shorts, socks: isGK ? '#12161f' : socks, goalkeeper: isGK, num: entry.num, name: entry.name,
    };
  }
  relook() {
    for (const a of this.players3D.values()) { if (a.entry) { a.avatar.setLook(this.lookFor(a.entry, a.side)); } }
  }
  entryOf(side, id) {
    const S = this.setup[side];
    return S.lineup.find((p) => p.id === id) || S.bench.find((p) => p.id === id);
  }
  ensure(side, entry) {
    let a = this.players3D.get(entry.id);
    if (a) return a;
    a = new Agent(entry.id, side, entry, this.lookFor(entry, side), this.q.shadows);
    this.players3D.set(entry.id, a);
    this.scene.add(a.avatar.root);
    return a;
  }
  remove(id) {
    const a = this.players3D.get(id); if (!a) return;
    this.players3D.delete(id); a.dispose();
  }
  addOfficial(kind, x, z) {
    const colors = kind === 'ref' ? { shirt: '#151515', shorts: '#151515', socks: '#151515', number: '#f2d33c' } : kind === 'physio' ? { shirt: '#f5f7fb', shorts: '#1b2a49', socks: '#1b2a49', number: '#d6233a' } : { shirt: '#e8d230', shorts: '#151515', socks: '#151515', number: '#151515' };
    const look = { appearance: appearanceFor('official-' + kind + x), ...colors, goalkeeper: false, num: null };
    const a = new Agent('official:' + kind + this.officials.length, 'o', null, look, this.q.shadows, kind);
    a.vmax = kind === 'physio' ? 7 : 6.2; a.place(x, z, 0);
    this.scene.add(a.avatar.root);
    if (kind !== 'physio') this.officials.push(a);
    return a;
  }
  /** Static staff: kind = bench | coach | crew. */
  addStaff(kind, side, x, z, heading, { entry = null, colors, seed, appearanceId }) {
    const look = { appearance: appearanceFor(appearanceId || 'staff:' + (seed || kind + x + z)), ...colors, goalkeeper: false, num: entry ? entry.num : null, name: entry ? entry.name : '' };
    const a = new Agent('staff:' + kind + ':' + (seed || x + ':' + z), side, entry, look, this.q.shadows, kind);
    a.x = x; a.z = z; a.heading = heading; a.baseHeading = heading; a.tx = x; a.tz = z; a.sync();
    this.scene.add(a.avatar.root);
    this.staff.push(a);
    return a;
  }
  removeStaff(a) { this.staff = this.staff.filter((s) => s !== a); a.dispose(); }
  all() { return [...this.players3D.values(), ...this.officials, ...this.staff, ...(this.physio ? [this.physio] : [])]; }
  dispose() {
    for (const a of this.all()) a.dispose();
    this.players3D.clear(); this.officials = []; this.staff = []; this.physio = null;
  }
}

const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function colorDist(a, b) { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); }
export { hashStr };
