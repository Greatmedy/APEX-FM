import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { hashStr, mulberry } from './Match3DMath';

/*
 * Procedural, skinned, smooth-bodied footballer. No external assets: the body is one SkinnedMesh per player built from
 * lofted tubes (torso, neck, head, legs with boots, arms with hands) so joints bend smoothly. Kit colours come from a tiny
 * 16x1 palette texture (region id -> colour), so every player shares geometry, skeleton layout and animation clips.
 */
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'upperArmR', 'foreArmR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const R = { skin: 0, shirt: 1, shorts: 2, socks: 3, boots: 4, hair: 5, glove: 6, trim: 7, forearm: 8, dark: 9 };
const PAL_W = 16;

const SKIN_TONES = ['#F4D1B4', '#E8B992', '#D39B72', '#BE805A', '#A06440', '#7E4A2E', '#5E3321', '#46261B'];
const HAIR_COLORS = ['#14110F', '#14110F', '#241810', '#2B1B10', '#4A2E18', '#6B4423', '#B8863B', '#D8C9A0', '#7C2D12', '#8C8C8C'];
export const HAIR_STYLES = 5;

/** Deterministic look from the existing player id only. No guessing from name, country or club. */
export function appearanceFor(id) {
  const r = mulberry(hashStr('apex-look:' + id));
  return {
    skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)],
    hair: HAIR_COLORS[Math.floor(r() * HAIR_COLORS.length)],
    hairStyle: Math.floor(r() * HAIR_STYLES),
    height: 0.95 + r() * 0.11,
    build: 0.94 + r() * 0.12,
  };
}

/* ---------- tube lofting ---------- */
function wTorso(y) {
  if (y <= 0.86) return [[BI.hips, 1]];
  if (y < 1.0) { const t = (y - 0.86) / 0.14; return [[BI.hips, 1 - t], [BI.spine, t]]; }
  if (y < 1.12) return [[BI.spine, 1]];
  if (y < 1.24) { const t = (y - 1.12) / 0.12; return [[BI.spine, 1 - t], [BI.chest, t]]; }
  return [[BI.chest, 1]];
}
const wLeg = (s) => (y) => {
  const T = BI['thigh' + s], S = BI['shin' + s], F = BI['foot' + s];
  if (y >= 0.94) return [[BI.hips, 1]];
  if (y > 0.84) { const t = (0.94 - y) / 0.1; return [[BI.hips, 1 - t], [T, t]]; }
  if (y >= 0.53) return [[T, 1]];
  if (y > 0.41) { const t = (0.53 - y) / 0.12; return [[T, 1 - t], [S, t]]; }
  if (y >= 0.15) return [[S, 1]];
  if (y > 0.08) { const t = (0.15 - y) / 0.07; return [[S, 1 - t], [F, t]]; }
  return [[F, 1]];
};
const wArm = (s) => (y) => {
  const U = BI['upperArm' + s], F = BI['foreArm' + s];
  if (y >= 1.5) return [[BI.chest, 1]];
  if (y > 1.44) { const t = (1.5 - y) / 0.06; return [[BI.chest, 1 - t], [U, t]]; }
  if (y >= 1.25) return [[U, 1]];
  if (y > 1.13) { const t = (1.25 - y) / 0.12; return [[U, 1 - t], [F, t]]; }
  return [[F, 1]];
};

class Builder {
  constructor() { this.pos = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  /** rings: {p:[x,y,z], a, b, region, w:[[bone,weight]..]}; frame axes U,V (arrays). */
  tube(rings, U, V, segs = 14) {
    const base = this.pos.length / 3;
    for (const r of rings) {
      for (let k = 0; k < segs; k++) {
        const ang = (k / segs) * Math.PI * 2, c = Math.cos(ang) * r.a, s = Math.sin(ang) * r.b;
        this.pos.push(r.p[0] + U[0] * c + V[0] * s, r.p[1] + U[1] * c + V[1] * s, r.p[2] + U[2] * c + V[2] * s);
        this.uv.push((r.region + 0.5) / PAL_W, 0.5);
        const w = r.w;
        this.si.push(w[0][0], w[1] ? w[1][0] : 0, 0, 0);
        this.sw.push(w[0][1], w[1] ? w[1][1] : 0, 0, 0);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < segs; k++) {
        const k2 = (k + 1) % segs;
        const a = base + i * segs + k, b = base + i * segs + k2, c = base + (i + 1) * segs + k, d = base + (i + 1) * segs + k2;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }
  ellipsoid(c, ax, ay, az, region, bone, rings = 6, segs = 8) {
    const list = [];
    for (let i = 0; i <= rings; i++) {
      const t = (i / rings) * Math.PI, y = -Math.cos(t), rr = Math.sin(t);
      list.push({ p: [c[0], c[1] + y * ay, c[2]], a: Math.max(rr * ax, 1e-4), b: Math.max(rr * az, 1e-4), region, w: [[bone, 1]] });
    }
    this.tube(list, [1, 0, 0], [0, 0, 1], segs);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 1.4); // animated limbs / dives must not get culled
    return g;
  }
}

const ring = (y, a, b, region, w, x = 0, z = 0) => ({ p: [x, y, z], a, b, region, w });
/** Round off the end of a vertical tube so it closes smoothly. dir = -1 (down) or +1 (up). */
function capV(list, dir, depth, n = 3) {
  const e = dir < 0 ? list[0] : list[list.length - 1];
  const out = [];
  for (let k = 1; k <= n; k++) {
    const th = (k / n) * Math.PI / 2;
    out.push({ ...e, p: [e.p[0], e.p[1] + dir * Math.sin(th) * depth, e.p[2]], a: Math.max(e.a * Math.cos(th), 1e-4), b: Math.max(e.b * Math.cos(th), 1e-4) });
  }
  return dir < 0 ? [...out.reverse(), ...list] : [...list, ...out];
}

function buildGeometry(hairStyle) {
  const B = new Builder();
  const Y = [1, 0, 0], Zv = [0, 0, 1], Yv = [0, 1, 0];
  // torso (shorts region below the tuck line, shirt above, collar trim)
  const tw = (y) => wTorso(y);
  let torso = [
    ring(0.84, 0.13, 0.10, R.shorts, tw(0.84)), ring(0.90, 0.16, 0.112, R.shorts, tw(0.9)), ring(0.93, 0.16, 0.112, R.shorts, tw(0.93)),
    ring(0.93, 0.16, 0.112, R.shirt, tw(0.93)), ring(1.0, 0.15, 0.104, R.shirt, tw(1.0)), ring(1.1, 0.158, 0.108, R.shirt, tw(1.1)),
    ring(1.2, 0.18, 0.118, R.shirt, tw(1.2)), ring(1.32, 0.2, 0.125, R.shirt, tw(1.32)), ring(1.42, 0.205, 0.118, R.shirt, tw(1.42)),
    ring(1.49, 0.16, 0.098, R.shirt, tw(1.49)), ring(1.5, 0.12, 0.09, R.trim, tw(1.5)), ring(1.53, 0.075, 0.068, R.trim, tw(1.53)),
  ];
  torso = capV(capV(torso, -1, 0.06), 1, 0.03);
  B.tube(torso, Y, Zv, 16);
  // neck
  B.tube(capV([ring(1.49, 0.052, 0.052, R.skin, [[BI.chest, 1]]), ring(1.55, 0.05, 0.05, R.skin, [[BI.neck, 1]]), ring(1.62, 0.05, 0.05, R.skin, [[BI.head, 1]])], 1, 0.0, 1), Y, Zv, 10);
  // head
  const H = [BI.head, 1];
  const head = capV(capV([
    ring(1.6, 0.045, 0.05, R.skin, [H]), ring(1.64, 0.075, 0.082, R.skin, [H]), ring(1.7, 0.087, 0.097, R.skin, [H]),
    ring(1.76, 0.083, 0.092, R.skin, [H]), ring(1.8, 0.055, 0.062, R.skin, [H]),
  ], 1, 0.03), -1, 0.025);
  B.tube(head, Y, Zv, 16);
  B.ellipsoid([0, 1.683, 0.099], 0.014, 0.016, 0.016, R.skin, BI.head, 3, 6); // nose
  for (const s of [1, -1]) {
    B.ellipsoid([s * 0.031, 1.714, 0.089], 0.009, 0.01, 0.007, R.dark, BI.head, 3, 6); // eyes
    B.ellipsoid([s * 0.087, 1.69, 0], 0.012, 0.025, 0.02, R.skin, BI.head, 3, 6); // ears
  }
  // hair
  const hc = (y, a, b) => ring(y, a, b, R.hair, [H]);
  if (hairStyle !== 3) {
    const cap = capV([hc(hairStyle === 1 ? 1.738 : 1.746, 0.092, 0.101), hc(1.76, 0.089, 0.098), hc(1.8, 0.059, 0.067)], 1, 0.032);
    B.tube(cap, Y, Zv, 16);
  }
  if (hairStyle === 1) B.ellipsoid([0, 1.69, -0.05], 0.088, 0.085, 0.065, R.hair, BI.head, 5, 10);
  if (hairStyle === 2) B.ellipsoid([0, 1.78, -0.012], 0.122, 0.1, 0.122, R.hair, BI.head, 6, 14);
  if (hairStyle === 4) { B.ellipsoid([0, 1.835, -0.055], 0.036, 0.036, 0.036, R.hair, BI.head, 4, 8); B.ellipsoid([0, 1.7, -0.06], 0.07, 0.07, 0.05, R.hair, BI.head, 4, 8); }
  // legs + boots
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const wl = wLeg(s), x = 0.09 * sx;
    const leg = capV([
      ring(0.97, 0.1, 0.1, R.shorts, wl(0.97), x), ring(0.88, 0.098, 0.096, R.shorts, wl(0.88), x), ring(0.8, 0.092, 0.092, R.shorts, wl(0.8), x),
      ring(0.72, 0.09, 0.09, R.shorts, wl(0.72), x), ring(0.7, 0.096, 0.096, R.shorts, wl(0.7), x),
      ring(0.7, 0.084, 0.084, R.skin, wl(0.7), x), ring(0.58, 0.068, 0.07, R.skin, wl(0.58), x), ring(0.56, 0.068, 0.07, R.skin, wl(0.56), x),
      ring(0.56, 0.068, 0.07, R.socks, wl(0.56), x), ring(0.47, 0.06, 0.063, R.socks, wl(0.47), x), ring(0.37, 0.063, 0.066, R.socks, wl(0.37), x),
      ring(0.24, 0.05, 0.052, R.socks, wl(0.24), x), ring(0.13, 0.04, 0.042, R.socks, wl(0.13), x), ring(0.1, 0.038, 0.04, R.socks, wl(0.1), x),
    ], 1, 0.0, 1);
    B.tube(leg, Y, Zv, 12);
    const F = [[BI['foot' + s], 1]];
    const boot = (z, yy, a, b, w) => ({ p: [x, yy, z], a, b, region: R.boots, w: w || F });
    const toe = [boot(-0.075, 0.07, 0.035, 0.045, [[BI['shin' + s], 0.5], [BI['foot' + s], 0.5]]), boot(-0.02, 0.066, 0.046, 0.05), boot(0.06, 0.056, 0.05, 0.042), boot(0.14, 0.045, 0.048, 0.034), boot(0.2, 0.036, 0.036, 0.026), boot(0.232, 0.03, 0.01, 0.01)];
    B.tube(toe, Y, Yv, 10);
    B.ellipsoid([x, 0.07, -0.078], 0.034, 0.044, 0.02, R.boots, BI['foot' + s], 3, 8);
  }
  // arms + hands
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const wa = wArm(s);
    const a = (y, x, r, region) => ring(y, r, r, region, wa(y), x * sx);
    const arm = capV([
      a(1.52, 0.2, 0.05, R.shirt), a(1.47, 0.205, 0.058, R.shirt), a(1.4, 0.215, 0.056, R.shirt), a(1.34, 0.222, 0.053, R.shirt),
      a(1.34, 0.222, 0.053, R.trim), a(1.31, 0.226, 0.052, R.trim), a(1.31, 0.226, 0.047, R.forearm), a(1.19, 0.236, 0.044, R.forearm),
      a(1.08, 0.245, 0.04, R.forearm), a(0.97, 0.253, 0.032, R.forearm), a(0.96, 0.253, 0.034, R.glove), a(0.92, 0.256, 0.043, R.glove),
      a(0.87, 0.258, 0.042, R.glove), a(0.82, 0.259, 0.03, R.glove),
    ], -1, 0.03, 3);
    B.tube(capV(arm, 1, 0.02, 2), Y, Zv, 10);
  }
  return B.geometry();
}

/** Build one template (geometry + bone hierarchy) per hair style. Cloned per player with SkeletonUtils. */
function buildTemplate(hairStyle) {
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const b = {};
  b.hips = mk('hips', null, 0, 0.95, 0);
  b.spine = mk('spine', b.hips, 0, 0.12, 0);
  b.chest = mk('chest', b.spine, 0, 0.22, 0);
  b.neck = mk('neck', b.chest, 0, 0.25, 0);
  b.head = mk('head', b.neck, 0, 0.08, 0);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    b['upperArm' + s] = mk('upperArm' + s, b.chest, 0.2 * sx, 0.18, 0);
    b['foreArm' + s] = mk('foreArm' + s, b['upperArm' + s], 0.035 * sx, -0.28, 0);
    b['thigh' + s] = mk('thigh' + s, b.hips, 0.09 * sx, -0.04, 0);
    b['shin' + s] = mk('shin' + s, b['thigh' + s], 0, -0.44, 0);
    b['foot' + s] = mk('foot' + s, b['shin' + s], 0, -0.38, 0);
  }
  const list = BONES.map((n) => b[n]);
  const geo = buildGeometry(hairStyle);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshLambertMaterial());
  const root = new THREE.Group();
  root.add(b.hips); root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(list));
  return root;
}

let TEMPLATES = null;
export function getTemplates() {
  if (!TEMPLATES) TEMPLATES = Array.from({ length: HAIR_STYLES }, (_, i) => buildTemplate(i));
  return TEMPLATES;
}
export function cloneFootballer(hairStyle) {
  const root = cloneSkinned(getTemplates()[hairStyle % HAIR_STYLES]);
  const mesh = root.children.find((c) => c.isSkinnedMesh);
  const bones = {};
  mesh.skeleton.bones.forEach((b) => { bones[b.name] = b; });
  mesh.frustumCulled = false;
  mesh.material = mesh.material.clone(); // clones share the template material by default: every player needs its own palette map
  return { root, mesh, bones };
}
export function disposeTemplates() {
  if (!TEMPLATES) return;
  for (const t of TEMPLATES) t.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.dispose(); o.material.dispose(); o.skeleton.dispose(); } });
  TEMPLATES = null;
}

/* ---------- textures ---------- */
export function paletteTexture(colors) {
  const data = new Uint8Array(PAL_W * 4);
  const c = new THREE.Color();
  for (let i = 0; i < PAL_W; i++) {
    c.set(colors[i] || '#ff00ff');
    const h = c.getHex(); // sRGB bytes; the texture is flagged sRGB so lighting stays correct
    data[i * 4] = (h >> 16) & 255; data[i * 4 + 1] = (h >> 8) & 255; data[i * 4 + 2] = h & 255; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, PAL_W, 1, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
export function kitPalette({ skin, hair, shirt, shorts, socks, boots = '#15181f', number, goalkeeper }) {
  const p = [];
  p[R.skin] = skin; p[R.shirt] = shirt; p[R.shorts] = shorts; p[R.socks] = socks; p[R.boots] = boots; p[R.hair] = hair;
  p[R.glove] = goalkeeper ? '#F2F2F2' : skin; p[R.trim] = number; p[R.forearm] = goalkeeper ? shirt : skin; p[R.dark] = '#1a1210';
  return p;
}

export function numberTexture(num, name, color) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 22px Oswald, Arial Narrow, sans-serif';
  g.fillText(String(name || '').split(' ').slice(-1)[0].toUpperCase().slice(0, 11), 64, 22);
  g.font = '700 84px Oswald, Arial Narrow, sans-serif';
  g.fillText(String(num ?? ''), 64, 80);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function ballTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, 256, 128);
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) { dirs.push([0, a, b], [a, b, 0], [b, 0, a]); }
  g.fillStyle = '#1b1f27';
  for (const d of dirs) {
    const l = Math.hypot(...d), x = d[0] / l, y = d[1] / l, z = d[2] / l;
    const u = (Math.atan2(x, z) / (Math.PI * 2) + 0.5) * 256, v = (0.5 - Math.asin(y) / Math.PI) * 128;
    const sx = 1 / Math.max(0.35, Math.cos(Math.asin(y)));
    for (const off of [-256, 0, 256]) {
      g.save(); g.translate(u + off, v); g.scale(sx, 1);
      g.beginPath(); for (let i = 0; i < 5; i++) { const an = (i / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(an) * 10, Math.sin(an) * 10); } g.closePath(); g.fill();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
