import * as THREE from 'three';
import { ballTexture } from './Match3DAssets';
import { clamp, damp } from './Match3DMath';

export const BALL_R = 0.15; // slightly enlarged for broadcast readability

/** Visual ball. It only follows what the simulation decided: carried, in flight along a scripted arc, held, or rolling free. */
export class Ball {
  constructor() {
    this.tex = ballTexture();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.55, metalness: 0 }));
    this.mesh.castShadow = true;
    this.pos = this.mesh.position; this.pos.set(0, BALL_R, 0);
    this.mode = 'free'; this.agent = null; this.flight = null;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.phase = 0; this.prev = new THREE.Vector3(0, BALL_R, 0);
    this.speed = 0; this.lastKick = 0;
    this._ax = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  place(x, z, y = BALL_R) { this.mode = 'free'; this.agent = null; this.flight = null; this.vx = this.vz = this.vy = 0; this.pos.set(x, y, z); this.prev.copy(this.pos); }
  carry(agent) { this.mode = 'carried'; this.agent = agent; this.flight = null; if (agent) agent.carrying = true; }
  hold(agent, h = 1.15) { this.mode = 'held'; this.agent = agent; this.flight = null; this.holdH = h; }
  drop() { if (this.agent) this.agent.carrying = false; this.agent = null; }
  /** Fly to a point. arc = peak extra height (m). */
  kick(to, dur, { arc = 0.1, from = null, onDone = null, ease = 0, endSpeed = 0, curve = 0 } = {}) {
    this.drop();
    this.mode = 'flight';
    this.flight = { from: (from || this.pos).clone(), to: to.clone(), t: 0, dur: Math.max(0.12, dur), arc, onDone, ease, endSpeed, curve };
    this.lastKick = performance.now();
  }
  free(vx, vz) { this.drop(); this.mode = 'free'; this.vx = vx; this.vz = vz; this.flight = null; }
  update(dt) {
    this.prev.copy(this.pos);
    if (this.mode === 'flight' && this.flight) {
      const f = this.flight; f.t += dt;
      const k = clamp(f.t / f.dur, 0, 1);
      const e = f.ease === 1 ? 1 - (1 - k) * (1 - k) : f.ease === 2 ? k * k : k;
      this.pos.x = f.from.x + (f.to.x - f.from.x) * e; this.pos.z = f.from.z + (f.to.z - f.from.z) * e;
      this.pos.y = f.from.y + (f.to.y - f.from.y) * e + f.arc * 4 * k * (1 - k);
      if (f.curve) { const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, d = Math.hypot(dx, dz) || 1, off = f.curve * 4 * k * (1 - k); this.pos.x += (-dz / d) * off; this.pos.z += (dx / d) * off; } // bend of a struck free kick
      if (k >= 1) {
        const done = f.onDone; this.flight = null; this.mode = 'free';
        const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z, d = Math.hypot(dx, dz) || 1;
        this.vx = (dx / d) * f.endSpeed; this.vz = (dz / d) * f.endSpeed; this.vy = 0;
        if (done) done();
      }
    } else if (this.mode === 'carried' && this.agent) {
      const a = this.agent;
      this.phase += a.speed * dt * 0.75;
      const touch = Math.pow(Math.max(0, Math.sin(this.phase * Math.PI)), 2);
      const off = a.speed > 0.8 ? 0.42 + 0.42 * touch : 0.36;
      const side = a.speed > 0.8 ? Math.sin(this.phase * Math.PI * 0.5) * 0.09 : 0;
      const hx = Math.sin(a.heading), hz = Math.cos(a.heading);
      const tx = a.x + hx * off + hz * side, tz = a.z + hz * off - hx * side;
      const f = damp(a.speed > 0.8 ? 30 : 16, dt);
      this.pos.x += (tx - this.pos.x) * f; this.pos.z += (tz - this.pos.z) * f;
      this.pos.y = BALL_R + 0.05 * touch;
    } else if (this.mode === 'held' && this.agent) {
      const a = this.agent, hx = Math.sin(a.heading), hz = Math.cos(a.heading);
      const f = damp(18, dt);
      this.pos.x += (a.x + hx * 0.28 - this.pos.x) * f; this.pos.z += (a.z + hz * 0.28 - this.pos.z) * f; this.pos.y += ((this.holdH || 1.15) - this.pos.y) * f;
    } else {
      // rolling / settling
      this.vy -= 9.8 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y < BALL_R) { this.pos.y = BALL_R; this.vy = Math.abs(this.vy) > 1.2 ? -this.vy * 0.42 : 0; }
      const fr = Math.exp(-(this.pos.y <= BALL_R + 0.01 ? 1.5 : 0.1) * dt);
      this.vx *= fr; this.vz *= fr;
      this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;
    }
    // spin from travelled distance
    const dx = this.pos.x - this.prev.x, dz = this.pos.z - this.prev.z, d = Math.hypot(dx, dz);
    this.speed = dt > 0 ? d / dt : 0;
    if (d > 1e-5) { this._ax.set(dz, 0, -dx).normalize(); this._q.setFromAxisAngle(this._ax, d / BALL_R); this.mesh.quaternion.premultiply(this._q); }
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); }
}
