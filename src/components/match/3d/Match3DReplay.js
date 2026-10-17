import { BONES } from './Match3DAssets';

/*
 * Instant replay. Every rendered frame (up to 60 per second) the pose of every body and the ball is copied into a ring buffer.
 * A goal replay plays back the last ~5 seconds from that buffer from a different camera, with no re-simulation, so it is
 * exactly what the viewer just saw. The live match keeps going underneath; afterwards the view snaps to the current state.
 */
const FIELD = 6 + BONES.length * 4;        // x, z, heading, hips position (3), then one quaternion per bone
const MAX_AGENTS = 48;
export const REPLAY_SECONDS = 5;

export class Recorder {
  constructor(seconds = 7, hz = 60) {
    this.n = Math.ceil(seconds * hz); this.interval = 1 / hz;
    this.slots = Array.from({ length: this.n }, () => ({ t: 0, ball: new Float32Array(7), ids: [], d: new Float32Array(MAX_AGENTS * FIELD), n: 0 }));
    this.head = 0; this.count = 0; this.last = -1;
  }
  reset() { this.head = 0; this.count = 0; this.last = -1; }
  capture(t, ball, agents) {
    if (t - this.last < this.interval) return;
    this.last = t;
    const s = this.slots[this.head];
    s.t = t;
    const bq = ball.mesh.quaternion; s.ball[0] = ball.pos.x; s.ball[1] = ball.pos.y; s.ball[2] = ball.pos.z; s.ball[3] = bq.x; s.ball[4] = bq.y; s.ball[5] = bq.z; s.ball[6] = bq.w;
    let i = 0;
    for (const a of agents) {
      if (i >= MAX_AGENTS) break;
      const root = a.avatar.root; if (!root.visible) continue;
      const o = i * FIELD, hips = a.avatar.bones.hips;
      s.ids[i] = a.id; s.d[o] = a.x; s.d[o + 1] = a.z; s.d[o + 2] = a.heading;
      s.d[o + 3] = hips.position.x; s.d[o + 4] = hips.position.y; s.d[o + 5] = hips.position.z;
      for (let b = 0; b < BONES.length; b++) { const q = a.avatar.bones[BONES[b]].quaternion, k = o + 6 + b * 4; s.d[k] = q.x; s.d[k + 1] = q.y; s.d[k + 2] = q.z; s.d[k + 3] = q.w; }
      i++;
    }
    s.n = i; s.ids.length = i;
    this.head = (this.head + 1) % this.n; this.count = Math.min(this.count + 1, this.n);
  }
  /** Frames from the last `seconds` seconds ending `endBack` seconds ago, oldest first. */
  window(now, seconds, endBack = 0) {
    const out = [];
    for (let k = this.count; k >= 1; k--) {
      const s = this.slots[(this.head - k + this.n) % this.n];
      if (s.t >= now - endBack - seconds && s.t <= now - endBack) out.push(s);
    }
    return out;
  }
}

/** Write one recorded frame onto the live avatars and ball. Bodies that were not in the frame are hidden. */
export function applyFrame(frame, registry, ball) {
  const byId = new Map(); for (const a of registry.all()) byId.set(a.id, a);
  const shown = new Set();
  for (let i = 0; i < frame.n; i++) {
    const a = byId.get(frame.ids[i]); if (!a) continue;
    shown.add(a.id);
    const o = i * FIELD, root = a.avatar.root;
    root.visible = true; root.position.set(frame.d[o], 0, frame.d[o + 1]); root.rotation.y = frame.d[o + 2];
    a.avatar.bones.hips.position.set(frame.d[o + 3], frame.d[o + 4], frame.d[o + 5]);
    for (let b = 0; b < BONES.length; b++) { const k = o + 6 + b * 4; a.avatar.bones[BONES[b]].quaternion.set(frame.d[k], frame.d[k + 1], frame.d[k + 2], frame.d[k + 3]); }
    root.updateMatrixWorld(true);
  }
  for (const a of byId.values()) if (!shown.has(a.id) && a.kind !== 'bench' && a.kind !== 'coach' && a.kind !== 'crew') a.avatar.root.visible = false;
  ball.mesh.position.set(frame.ball[0], frame.ball[1], frame.ball[2]); ball.mesh.quaternion.set(frame.ball[3], frame.ball[4], frame.ball[5], frame.ball[6]);
}
