import * as THREE from 'three';
import { BONES } from './Match3DAssets';
import { DEG } from './Match3DMath';

/*
 * Procedural AnimationClips for the shared skeleton (Three.js AnimationMixer plays them). Poses are authored in degrees:
 * a pose is { boneName: [rx, ry, rz], dx, dy, dz } with the hips offset in metres. The character faces +Z; a limb that
 * hangs down swings FORWARD with negative rx; knees/elbows flex with +rx (shin) / -rx (forearm).
 */
const HIPS_Y = 0.95;
const FPS = 30;
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const S = (a) => Math.sin(a), C = (a) => Math.cos(a), TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);

function build(name, duration, fn, loop) {
  const n = Math.max(2, Math.round(duration * FPS)) + (loop ? 0 : 1);
  const times = new Float32Array(n);
  const rot = {};
  BONES.forEach((b) => { rot[b] = new Float32Array(n * 4); });
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t01 = loop ? i / n : i / (n - 1);
    times[i] = t01 * duration;
    const p = fn(t01, t01 * duration) || {};
    for (const b of BONES) {
      const r = p[b] || [0, 0, 0];
      _e.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ'); _q.setFromEuler(_e);
      rot[b][i * 4] = _q.x; rot[b][i * 4 + 1] = _q.y; rot[b][i * 4 + 2] = _q.z; rot[b][i * 4 + 3] = _q.w;
    }
    pos[i * 3] = p.dx || 0; pos[i * 3 + 1] = HIPS_Y + (p.dy || 0); pos[i * 3 + 2] = p.dz || 0;
  }
  const tracks = BONES.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rot[b]));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, pos));
  if (loop) { /* looped clips: last sample wraps to the first */ }
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Keyframed pose blending (smoothstep between keys). keys: [[t01, pose], ...] sorted. */
function keyed(keys) {
  return (t) => {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    const k = t1 === t0 ? 1 : smooth(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (key === 'dx' || key === 'dy' || key === 'dz') out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * k;
      else { const x = a[key] || [0, 0, 0], y = b[key] || [0, 0, 0]; out[key] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]; }
    }
    return out;
  };
}

/** Cyclic gait: A hip swing, K knee flex, B arm swing, E elbow flex, lean (deg), sway (torso twist). */
function gait({ A, K, B, E, lean, sway, bob, splay = 3, kb = 8 }) {
  return (t) => {
    const ph = t * TAU;
    const leg = (p, s) => {
      const f = A * S(p + (s ? 0 : Math.PI));
      const knee = kb + K * Math.max(0, C(p + (s ? 0 : Math.PI)));
      return [-f, knee, -(f * 0.35) - knee * 0.4];
    };
    const [tl, kl, fl] = leg(ph, true), [tr, kr, fr] = leg(ph, false);
    const dy = -bob * (1 - C(A * DEG * Math.abs(S(ph)))) * 3.4;
    return {
      dy, hips: [0, sway * S(ph), 1.2 * S(ph)], spine: [lean, -sway * S(ph) * 1.4, -1.2 * S(ph)], chest: [lean * 0.4, 0, 0], head: [-lean * 0.7, 0, 0],
      thighL: [tl, 0, splay], shinL: [kl, 0, 0], footL: [fl, 0, 0],
      thighR: [tr, 0, -splay], shinR: [kr, 0, 0], footR: [fr, 0, 0],
      upperArmL: [B * S(ph), 0, 5], foreArmL: [-E - B * 0.25 * (1 - S(ph)), 0, 0],
      upperArmR: [-B * S(ph), 0, -5], foreArmR: [-E - B * 0.25 * (1 + S(ph)), 0, 0],
    };
  };
}

const standBase = { thighL: [0, 0, 3], thighR: [0, 0, -3], shinL: [6, 0, 0], shinR: [6, 0, 0], footL: [-4, 0, 0], footR: [-4, 0, 0], upperArmL: [0, 0, 5], upperArmR: [0, 0, -5], foreArmL: [-14, 0, 0], foreArmR: [-14, 0, 0] };
const withBase = (o) => ({ ...standBase, ...o });

export function buildClips() {
  const c = {};
  const add = (name, dur, fn, loop = false) => { c[name] = build(name, dur, fn, loop); };

  /* locomotion (loops) */
  add('idle', 3, (t) => { const p = t * TAU; return withBase({ dy: -0.004 * S(p * 2), hips: [0, 0, 1.4 * S(p)], spine: [1 + 0.8 * S(p * 2), 0, -1 * S(p)], chest: [0.8 * S(p * 2), 0, 0], head: [0, 4 * S(p), 0] }); }, true);
  add('walk', 1.1, gait({ A: 22, K: 28, B: 17, E: 14, lean: 2, sway: 3, bob: 0.014 }), true);
  add('jog', 0.78, gait({ A: 34, K: 62, B: 32, E: 78, lean: 8, sway: 5, bob: 0.02 }), true);
  add('run', 0.64, gait({ A: 44, K: 85, B: 42, E: 88, lean: 13, sway: 6, bob: 0.022 }), true);
  add('sprint', 0.52, gait({ A: 54, K: 104, B: 54, E: 94, lean: 19, sway: 7, bob: 0.024 }), true);
  add('dribble', 0.7, (t) => { const g = gait({ A: 30, K: 56, B: 22, E: 70, lean: 10, sway: 4, bob: 0.018 })(t); g.spine[1] += 5 * S(t * TAU); return g; }, true);
  add('limp', 1.3, (t) => { const g = gait({ A: 15, K: 18, B: 8, E: 25, lean: 4, sway: 3, bob: 0.01 })(t); g.spine[2] += 8; g.hips[2] += 4; g.dy -= 0.03 * Math.max(0, S(t * TAU)); return g; }, true);
  add('gk_ready', 1.6, (t) => { const p = t * TAU; return { dy: -0.14 + 0.012 * S(p * 2), thighL: [-26, 0, 12], thighR: [-26, 0, -12], shinL: [46, 0, 0], shinR: [46, 0, 0], footL: [-18, 0, 0], footR: [-18, 0, 0], spine: [14, 0, 0], chest: [6, 0, 0], upperArmL: [-32, 0, 28], upperArmR: [-32, 0, -28], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0], head: [-10, 3 * S(p), 0] }; }, true);

  /* ball actions (one-shots) */
  const kickR = (back, fwd, lean, plant = 20) => ({
    dur: 0,
    keys: [
      [0, withBase({})],
      [0.38, withBase({ dy: -0.03, thighR: [back, 0, -3], shinR: [back * 1.9, 0, 0], thighL: [-8, 0, 3], shinL: [plant, 0, 0], spine: [-lean * 0.4, -12, 0], upperArmL: [-10, 0, 40], upperArmR: [12, 0, -38], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0] })],
      [0.55, withBase({ dy: -0.02, thighR: [fwd, 0, -2], shinR: [4, 0, 0], footR: [-18, 0, 0], thighL: [-6, 0, 3], shinL: [plant, 0, 0], spine: [lean, 14, 0], upperArmL: [-14, 0, 55], upperArmR: [-22, 0, -42], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0] })],
      [0.75, withBase({ thighR: [fwd * 0.6, 0, -2], shinR: [26, 0, 0], spine: [lean * 0.5, 5, 0] })],
      [1, withBase({})],
    ],
  });
  add('pass', 0.5, keyed(kickR(26, -52, 8).keys));            // contact ~0.27s
  add('shoot', 0.72, keyed(kickR(40, -78, 14, 28).keys));     // contact ~0.40s
  add('throw', 0.7, keyed([[0, withBase({})], [0.4, withBase({ upperArmL: [-170, 0, 8], upperArmR: [-170, 0, -8], foreArmL: [-40, 0, 0], foreArmR: [-40, 0, 0], spine: [-12, 0, 0], thighL: [-12, 0, 3], thighR: [14, 0, -3] })], [0.62, withBase({ upperArmL: [-60, 0, 8], upperArmR: [-60, 0, -8], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0], spine: [16, 0, 0], thighL: [-20, 0, 3], thighR: [10, 0, -3] })], [1, withBase({})]]));
  add('receive', 0.6, keyed([[0, withBase({})], [0.3, withBase({ dy: -0.04, thighR: [-34, 0, -4], shinR: [58, 0, 0], footR: [18, 0, 0], thighL: [-8, 0, 3], shinL: [18, 0, 0], spine: [4, 0, 0], upperArmL: [-8, 0, 36], upperArmR: [-8, 0, -36] })], [0.62, withBase({ dy: -0.02, thighR: [-14, 0, -3], shinR: [24, 0, 0] })], [1, withBase({})]]));
  add('tackle', 0.65, keyed([[0, withBase({})], [0.32, withBase({ dy: -0.2, thighR: [-72, 0, -6], shinR: [8, 0, 0], footR: [-20, 0, 0], thighL: [-30, 0, 6], shinL: [74, 0, 0], spine: [18, 0, 0], upperArmL: [-20, 0, 60], upperArmR: [10, 0, -60], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0] })], [0.58, withBase({ dy: -0.12, thighR: [-40, 0, -5], shinR: [30, 0, 0], thighL: [-24, 0, 5], shinL: [58, 0, 0], spine: [12, 0, 0] })], [1, withBase({})]]));
  add('intercept', 0.55, keyed([[0, withBase({})], [0.35, withBase({ dy: -0.08, thighR: [-62, 0, -4], shinR: [12, 0, 0], footR: [-26, 0, 0], thighL: [-14, 0, 3], shinL: [30, 0, 0], spine: [10, 0, 0], upperArmL: [-30, 0, 70], upperArmR: [-40, 0, -50] })], [1, withBase({})]]));
  add('slide', 1.0, keyed([[0, withBase({})], [0.3, withBase({ dy: -0.55, dz: 0.1, thighR: [-84, 0, -4], shinR: [6, 0, 0], thighL: [-30, 0, 6], shinL: [112, 0, 0], spine: [-48, 0, 0], chest: [-10, 0, 0], upperArmL: [-20, 0, 70], upperArmR: [-20, 0, -70], hips: [-38, 0, 0] })], [0.7, withBase({ dy: -0.62, dz: 0.2, thighR: [-86, 0, -4], shinR: [4, 0, 0], thighL: [-30, 0, 6], shinL: [112, 0, 0], spine: [-50, 0, 0], hips: [-42, 0, 0], upperArmL: [-20, 0, 70], upperArmR: [-20, 0, -70] })], [1, withBase({ dy: -0.62, dz: 0.22, thighR: [-86, 0, -4], shinR: [4, 0, 0], thighL: [-30, 0, 6], shinL: [112, 0, 0], spine: [-50, 0, 0], hips: [-42, 0, 0], upperArmL: [-20, 0, 70], upperArmR: [-20, 0, -70] })]]));
  add('header', 0.85, keyed([[0, withBase({})], [0.2, withBase({ dy: -0.12, thighL: [-20, 0, 6], thighR: [-20, 0, -6], shinL: [44, 0, 0], shinR: [44, 0, 0], spine: [-6, 0, 0], upperArmL: [-40, 0, 40], upperArmR: [-40, 0, -40] })], [0.4, withBase({ dy: 0.3, thighL: [-6, 0, 6], thighR: [-30, 0, -6], shinL: [60, 0, 0], shinR: [80, 0, 0], spine: [-22, 0, 0], chest: [-10, 0, 0], head: [-14, 0, 0], upperArmL: [-60, 0, 60], upperArmR: [-60, 0, -60] })], [0.52, withBase({ dy: 0.28, spine: [20, 0, 0], chest: [10, 0, 0], head: [22, 0, 0], thighL: [-12, 0, 6], thighR: [-26, 0, -6], shinL: [50, 0, 0], shinR: [60, 0, 0], upperArmL: [-30, 0, 60], upperArmR: [-30, 0, -60] })], [0.8, withBase({ dy: -0.08, thighL: [-16, 0, 6], thighR: [-16, 0, -6], shinL: [36, 0, 0], shinR: [36, 0, 0] })], [1, withBase({})]]));
  add('jump', 0.7, keyed([[0, withBase({})], [0.2, withBase({ dy: -0.12, thighL: [-24, 0, 6], thighR: [-24, 0, -6], shinL: [48, 0, 0], shinR: [48, 0, 0], upperArmL: [30, 0, 20], upperArmR: [30, 0, -20] })], [0.45, withBase({ dy: 0.3, thighL: [-30, 0, 8], thighR: [-12, 0, -8], shinL: [70, 0, 0], shinR: [40, 0, 0], upperArmL: [-150, 0, 20], upperArmR: [-150, 0, -20] })], [0.8, withBase({ dy: -0.1, thighL: [-20, 0, 6], thighR: [-20, 0, -6], shinL: [40, 0, 0], shinR: [40, 0, 0] })], [1, withBase({})]]));
  add('turn', 0.5, keyed([[0, withBase({})], [0.4, withBase({ dy: -0.05, thighL: [-24, 0, 8], thighR: [14, 0, -8], shinL: [30, 0, 0], shinR: [30, 0, 0], spine: [8, 0, 0], upperArmL: [-10, 0, 40], upperArmR: [-10, 0, -40] })], [1, withBase({})]]));

  /* falling and recovery */
  const prone = withBase({ dy: -0.8, hips: [86, 0, 0], thighL: [-6, 0, 8], thighR: [-6, 0, -8], shinL: [12, 0, 0], shinR: [12, 0, 0], upperArmL: [-155, 0, 18], upperArmR: [-155, 0, -18], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0], head: [-50, 0, 0], spine: [-4, 0, 0] });
  add('fall', 1.1, keyed([[0, withBase({})], [0.25, withBase({ dy: -0.1, spine: [26, 0, 0], thighL: [-16, 0, 3], thighR: [10, 0, -3], upperArmL: [-60, 0, 30], upperArmR: [-60, 0, -30] })], [0.7, withBase({ dy: -0.5, hips: [48, 0, 0], thighL: [-30, 0, 6], thighR: [-10, 0, -6], shinL: [60, 0, 0], shinR: [30, 0, 0], upperArmL: [-100, 0, 24], upperArmR: [-100, 0, -24] })], [1, prone]]));
  add('getup', 1.2, keyed([[0, prone], [0.35, withBase({ dy: -0.78, hips: [84, 0, 0], thighL: [-70, 0, 8], thighR: [-60, 0, -8], shinL: [110, 0, 0], shinR: [100, 0, 0], upperArmL: [-90, 0, 20], upperArmR: [-90, 0, -20], head: [-50, 0, 0] })], [0.65, withBase({ dy: -0.35, hips: [40, 0, 0], thighL: [-70, 0, 8], thighR: [-40, 0, -8], shinL: [100, 0, 0], shinR: [80, 0, 0], upperArmL: [-40, 0, 20], upperArmR: [-40, 0, -20] })], [1, withBase({})]]));
  const sidePose = (w) => withBase({ dy: -0.78, hips: [10, 0, 86 + w], thighL: [-70 + w, 0, 4], thighR: [-30, 0, -4], shinL: [100, 0, 0], shinR: [60, 0, 0], spine: [20, 0, 0], upperArmL: [-60, 0, -10], upperArmR: [-120, 0, 10], foreArmL: [-70, 0, 0], foreArmR: [-40, 0, 0], head: [10, 0, -8] });
  add('injured', 1.6, (t) => { const p = t * TAU; return sidePose(4 * S(p)); }, true);
  add('kneel', 1.6, (t) => { const p = t * TAU; return withBase({ dy: -0.48 + 0.005 * S(p), thighL: [-90, 0, 4], thighR: [-8, 0, -4], shinL: [92, 0, 0], shinR: [124, 0, 0], spine: [28, 0, 0], upperArmL: [-58, 0, 8], upperArmR: [-62, 0, -8], foreArmL: [-30 + 6 * S(p), 0, 0], foreArmR: [-34, 0, 0], head: [8, 0, 0] }); }, true);

  /* goalkeeper */
  const gkBase = { thighL: [-14, 0, 8], thighR: [-14, 0, -8], shinL: [24, 0, 0], shinR: [24, 0, 0] };
  add('gk_save', 0.8, keyed([[0, withBase(gkBase)], [0.3, withBase({ dy: 0.1, thighL: [-16, 0, 10], thighR: [-16, 0, -10], shinL: [30, 0, 0], shinR: [30, 0, 0], spine: [-8, 0, 0], upperArmL: [-165, 0, 14], upperArmR: [-165, 0, -14], foreArmL: [-8, 0, 0], foreArmR: [-8, 0, 0] })], [0.7, withBase({ dy: -0.04, spine: [10, 0, 0], upperArmL: [-110, 0, 20], upperArmR: [-110, 0, -20] })], [1, withBase({})]]));
  const dive = (s) => keyed([[0, withBase(gkBase)], [0.22, withBase({ dy: -0.16, thighL: [-30, 0, 14], thighR: [-30, 0, -14], shinL: [50, 0, 0], shinR: [50, 0, 0], hips: [0, 0, -12 * s], upperArmL: [-60, 0, 30], upperArmR: [-60, 0, -30] })], [0.5, withBase({ dy: 0.18, hips: [0, 0, -(70 * s)], thighL: [-8, 0, 6], thighR: [-12, 0, -6], shinL: [30, 0, 0], shinR: [40, 0, 0], spine: [0, 0, -6 * s], upperArmL: [-170, 0, 8], upperArmR: [-170, 0, -8], foreArmL: [-6, 0, 0], foreArmR: [-6, 0, 0] })], [0.78, withBase({ dy: -0.62, hips: [0, 0, -(84 * s)], thighL: [-6, 0, 6], thighR: [-10, 0, -6], shinL: [26, 0, 0], shinR: [34, 0, 0], upperArmL: [-172, 0, 6], upperArmR: [-172, 0, -6] })], [1, withBase({ dy: -0.66, hips: [0, 0, -(86 * s)], thighL: [-6, 0, 6], thighR: [-10, 0, -6], shinL: [26, 0, 0], shinR: [34, 0, 0], upperArmL: [-172, 0, 6], upperArmR: [-172, 0, -6] })]]);
  add('gk_dive_l', 1.1, dive(1)); add('gk_dive_r', 1.1, dive(-1));
  add('gk_catch', 0.7, keyed([[0, withBase(gkBase)], [0.35, withBase({ dy: -0.06, spine: [22, 0, 0], upperArmL: [-70, 0, -4], upperArmR: [-70, 0, 4], foreArmL: [-100, 0, 0], foreArmR: [-100, 0, 0], thighL: [-16, 0, 8], thighR: [-16, 0, -8], shinL: [30, 0, 0], shinR: [30, 0, 0] })], [1, withBase({ spine: [16, 0, 0], upperArmL: [-60, 0, -4], upperArmR: [-60, 0, 4], foreArmL: [-96, 0, 0], foreArmR: [-96, 0, 0] })]]));
  add('gk_parry', 0.7, keyed([[0, withBase(gkBase)], [0.3, withBase({ dy: 0.08, spine: [-6, 0, 18], upperArmL: [-150, 0, 30], upperArmR: [-170, 0, -10], thighL: [-12, 0, 8], thighR: [-20, 0, -8] })], [0.7, withBase({ spine: [4, 0, 6], upperArmL: [-100, 0, 30], upperArmR: [-120, 0, -10] })], [1, withBase({})]]));

  /* emotion / officials */
  add('celebrate', 1.2, (t) => { const p = t * TAU; return withBase({ dy: 0.1 * Math.abs(S(p)) - 0.02, upperArmL: [-155 + 14 * S(p * 2), 0, 22], upperArmR: [-155 - 14 * S(p * 2), 0, -22], foreArmL: [-24, 0, 0], foreArmR: [-24, 0, 0], thighL: [-14 * Math.abs(S(p)), 0, 5], thighR: [-14 * Math.abs(S(p)), 0, -5], shinL: [22 * Math.abs(S(p)), 0, 0], shinR: [22 * Math.abs(S(p)), 0, 0], spine: [-6, 0, 0], head: [-14, 0, 0] }); }, true);
  add('gesture', 1.6, (t) => { const p = t * TAU; return withBase({ upperArmL: [-40, 0, 52 + 6 * S(p)], upperArmR: [-40, 0, -52 - 6 * S(p)], foreArmL: [-60, 0, 0], foreArmR: [-60, 0, 0], head: [4, 14 * S(p), 0], spine: [3, 0, 0] }); }, true);
  add('clap', 1.0, (t) => { const p = t * TAU * 2; const o = 0.5 + 0.5 * S(p); return withBase({ upperArmL: [-60, 0, 10 + 14 * o], upperArmR: [-60, 0, -10 - 14 * o], foreArmL: [-70 - 10 * o, 0, 0], foreArmR: [-70 - 10 * o, 0, 0], head: [4, 0, 0] }); }, true);
  add('ref_whistle', 0.8, keyed([[0, withBase({})], [0.3, withBase({ upperArmR: [-120, 0, -10], foreArmR: [-110, 0, 0], head: [0, 0, 0] })], [1, withBase({ upperArmR: [-120, 0, -10], foreArmR: [-110, 0, 0] })]]));
  add('ref_point', 0.8, keyed([[0, withBase({})], [0.3, withBase({ upperArmR: [-88, 0, -16], foreArmR: [-4, 0, 0], spine: [0, -10, 0] })], [1, withBase({ upperArmR: [-88, 0, -16], foreArmR: [-4, 0, 0], spine: [0, -10, 0] })]]));
  add('ref_card', 0.7, keyed([[0, withBase({})], [0.35, withBase({ upperArmR: [-168, 0, -6], foreArmR: [-6, 0, 0], head: [-6, 0, 0] })], [1, withBase({ upperArmR: [-168, 0, -6], foreArmR: [-6, 0, 0], head: [-6, 0, 0] })]]));
  return c;
}

/** Locomotion reference speeds (m/s) at clip timeScale = 1. */
export const LOCO = [['idle', 0], ['walk', 1.5], ['jog', 3.5], ['run', 5.6], ['sprint', 8.0]];
export const ONE_SHOT_CONTACT = { pass: 0.27, shoot: 0.4, throw: 0.4, header: 0.46, tackle: 0.2, intercept: 0.2, receive: 0.12, slide: 0.18 };
export const ONE_SHOT_DUR = { pass: 0.5, shoot: 0.72, throw: 0.7, receive: 0.6, tackle: 0.65, intercept: 0.55, slide: 1.0, header: 0.85, jump: 0.7, turn: 0.5, fall: 1.1, getup: 1.2, gk_save: 0.8, gk_dive_l: 1.1, gk_dive_r: 1.1, gk_catch: 0.7, gk_parry: 0.7, ref_whistle: 0.8, ref_point: 0.8, ref_card: 0.7 };
