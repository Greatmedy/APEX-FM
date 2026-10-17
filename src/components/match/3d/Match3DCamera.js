import * as THREE from 'three';
import { clamp, damp, PITCH_L, PITCH_W } from './Match3DMath';

export const CAMERA_MODES = ['broadcast', 'tactical', 'action'];

/** Smoothed broadcast camera. Follows the ball with a lead, never snaps, and takes short "moments" (goal, shot, corner...). */
export class MatchCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(36, aspect, 0.5, 600);
    this.mode = 'broadcast';
    this.focus = new THREE.Vector3(0, 0, 0); this.pos = new THREE.Vector3(0, 26, 46);
    this.look = new THREE.Vector3(0, 0, 0);
    this.moment = null; this.aspect = aspect; this.fov = 36;
    this.shake = 0;
    this._t = new THREE.Vector3(); this._p = new THREE.Vector3(); this._l = new THREE.Vector3();
    this.cam.position.copy(this.pos);
  }
  setAspect(a) { this.aspect = a; this.cam.aspect = a; this.cam.updateProjectionMatrix(); }
  setMode(m) { this.mode = CAMERA_MODES.includes(m) ? m : 'broadcast'; }
  /** A timed special view. kind: goal | shot | save | corner | penalty | foul | injury | card. at = world point, dir = +1/-1 attack direction. */
  setMoment(kind, at, dur, dir = 1) { this.moment = { kind, at: at.clone(), t: 0, dur, dir }; }
  clearMoment() { this.moment = null; }
  snap(ball) { this.focus.set(ball.x, 0, ball.z); this.compute(0, ball, null, 0); this.pos.copy(this._p); this.look.copy(this._l); this.apply(); }
  /** ball: Vector3, carrier: Agent|null, spread: x-extent of play near ball (m) */
  update(dt, ball, vel, spread) {
    if (this.moment) { this.moment.t += dt; if (this.moment.t > this.moment.dur) this.moment = null; }
    this.compute(dt, ball, vel, spread);
    const m = this.moment;
    const fast = m ? 3.2 : 2.2;
    this.pos.lerp(this._p, damp(fast, dt));
    this.look.lerp(this._l, damp(fast * 1.3, dt));
    this.fov += (this._fov - this.fov) * damp(2.5, dt);
    this.cam.fov = this.fov;
    this.apply();
  }
  compute(dt, ball, vel, spread) {
    const ar = this.aspect, narrow = ar < 1.5 ? 1.5 / Math.max(0.55, ar) : 1;
    const lead = vel ? 0.35 : 0;
    this.focus.x += ((ball.x + (vel ? vel.x : 0) * lead) - this.focus.x) * (dt ? damp(1.9, dt) : 1);
    this.focus.z += (ball.z * 0.9 - this.focus.z) * (dt ? damp(2.2, dt) : 1);
    const fx = clamp(this.focus.x, -PITCH_L / 2 + 8, PITCH_L / 2 - 8), fz = this.focus.z;
    let h = 17, d = 31, fov = 35, lx = fx, lz = fz * 0.82 + 1, ly = 0.5;
    const spreadK = clamp(((spread ?? 22) - 14) / 40, 0, 0.4);
    if (this.mode === 'tactical') { h = 34; d = 54; fov = 40; lx = fx * 0.7; lz = fz * 0.3; }
    else if (this.mode === 'action') { h = 8.5; d = 17; fov = 46; lx = fx; lz = fz * 0.8; ly = 1; }
    else { h += spreadK * 9; d += spreadK * 11; }
    h *= narrow ** 0.8; d *= narrow;
    let px = this.mode === 'tactical' ? fx * 0.7 : fx * 0.94, pz = fz * 0.3 + d, py = h;
    const m = this.moment;
    if (m) {
      const k = clamp(m.t / Math.max(0.01, m.dur), 0, 1);
      const a = m.at;
      if (m.kind === 'goal') { px = a.x - m.dir * 12; py = 3.2 + 1.5 * k; pz = a.z + 18 * (a.z > 0 ? -1 : 1) + (a.z > 0 ? -5 : 5); lx = a.x - m.dir * 6; lz = a.z; ly = 1.5; fov = 40; }
      else if (m.kind === 'shot') { px = fx + m.dir * 8; py = 12; pz = 34; lx = a.x - m.dir * 4; lz = a.z; ly = 1.2; fov = 34; }
      else if (m.kind === 'save') { px = a.x - m.dir * 14; py = 7; pz = a.z + 20; lx = a.x - m.dir * 2; lz = a.z; ly = 1.2; fov = 36; }
      else if (m.kind === 'corner') { px = a.x + m.dir * 6; py = 11; pz = a.z * 0.5 + (a.z > 0 ? 24 : -24); lx = a.x - m.dir * 14; lz = 0; fov = 38; }
      else if (m.kind === 'penalty') { px = a.x - m.dir * 22; py = 6.5; pz = 8; lx = a.x + m.dir * 4; lz = 0; ly = 1.2; fov = 32; }
      else if (m.kind === 'foul' || m.kind === 'card' || m.kind === 'injury') { px = a.x + 2; py = 7.5; pz = a.z + 15; lx = a.x; lz = a.z; ly = 0.9; fov = 31; }
      d = 0;
    }
    this._p.set(clamp(px, -70, 70), py, clamp(pz, -60, 70));
    this._l.set(lx, ly, lz);
    this._fov = fov;
    void d;
  }
  apply() { this.cam.position.copy(this.pos); this.cam.lookAt(this.look); }
}
