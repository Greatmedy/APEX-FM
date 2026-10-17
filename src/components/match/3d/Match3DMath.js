// Coordinate conversion + small math helpers. Simulation space is normalized (x: 0 left goal -> 1 right goal, y: 0 top -> 1 bottom).
// World space is metres: X along the pitch (home attacks +X), Z across (sim y=0 is -Z, far side), Y up. Camera sits on the +Z side.
export const PITCH_L = 105;
export const PITCH_W = 68;
export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const GOAL_D = 2.2;
export const PEN_AREA = { d: 16.5, w: 40.32 };
export const SIX_YARD = { d: 5.5, w: 18.32 };
export const PEN_SPOT = 11;

export const simToWorldX = (x) => (x - 0.5) * PITCH_L;
export const simToWorldZ = (y) => (y - 0.5) * PITCH_W;
export const worldToSimX = (X) => X / PITCH_L + 0.5;
export const worldToSimZ = (Z) => Z / PITCH_W + 0.5;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const DEG = Math.PI / 180;

/** Deterministic string hash -> unsigned int. */
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hex = (c) => (typeof c === 'string' ? c : '#888888');

/** Which goal does a team attack? Home (h) attacks +X in the first half; sides do NOT swap in this simulation. */
export const attackDir = (t) => (t === 'h' ? 1 : -1);
