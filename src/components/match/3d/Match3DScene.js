import * as THREE from 'three';
import { PITCH_L, PITCH_W, GOAL_W, GOAL_H, GOAL_D, PEN_AREA, SIX_YARD, PEN_SPOT, mulberry, clamp, damp } from './Match3DMath';
import { AdBoards, TILE_M } from './Match3DAds';

export const QUALITY = {
  high: { name: 'high', pr: 2, shadows: true, shadowMap: 2048, aa: true, pitchTex: 3072, rain: 3200, crowdTex: 1024, aniso: 8 },
  medium: { name: 'medium', pr: 1.5, shadows: true, shadowMap: 1024, aa: true, pitchTex: 2048, rain: 1800, crowdTex: 512, aniso: 4 },
  low: { name: 'low', pr: 1, shadows: false, shadowMap: 0, aa: false, pitchTex: 1536, rain: 900, crowdTex: 256, aniso: 2 },
};

const WEATHER = {
  sunny: { top: '#2f5fa8', horizon: '#f2b878', fog: '#c9b79a', fogNear: 170, fogFar: 460, hemiSky: '#cfe3ff', hemiGround: '#5b7a4a', hemi: 0.95, sun: 2.1, sunColor: '#fff1d6', grass: 1.0, rough: 0.92 },
  rainy: { top: '#161d28', horizon: '#53606e', fog: '#4a5663', fogNear: 55, fogFar: 230, hemiSky: '#9fb0c4', hemiGround: '#2b3a33', hemi: 0.95, sun: 1.7, sunColor: '#d6e2f0', grass: 0.88, rough: 0.5 },
};

function canvasTex(w, h, draw, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  return t;
}

/** Goal frame + animated net (vertex ripple when the ball hits it). Built for the +X goal; mirrored for -X. */
class Goal {
  constructor(sign, netTex) {
    this.group = new THREE.Group(); this.group.position.x = sign * PITCH_L / 2; if (sign < 0) this.group.rotation.y = Math.PI;
    this.sign = sign; this.nets = []; this.impact = null;
    const white = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4 });
    const post = (x, y, z, h, rot = [0, 0, 0], r = 0.06) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), white); m.position.set(x, y, z); m.rotation.set(...rot); m.castShadow = true; this.group.add(m); return m; };
    const hw = GOAL_W / 2;
    post(0, GOAL_H / 2, -hw, GOAL_H); post(0, GOAL_H / 2, hw, GOAL_H);
    post(0, GOAL_H, 0, GOAL_W + 0.12, [Math.PI / 2, 0, 0]);
    post(GOAL_D, GOAL_H * 0.55, -hw, GOAL_H * 1.1, [0, 0, -0.18], 0.035); post(GOAL_D, GOAL_H * 0.55, hw, GOAL_H * 1.1, [0, 0, -0.18], 0.035);
    post(GOAL_D * 0.55, GOAL_H, -hw, GOAL_D, [0, 0, Math.PI / 2], 0.03); post(GOAL_D * 0.55, GOAL_H, hw, GOAL_D, [0, 0, Math.PI / 2], 0.03);
    const mat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
    const mk = (w, h, sw, sh, setup) => {
      const geo = new THREE.PlaneGeometry(w, h, sw, sh);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * w / 0.12); uv.setY(i, uv.getY(i) * h / 0.12); }
      const m = new THREE.Mesh(geo, mat); setup(m); this.group.add(m);
      this.nets.push({ mesh: m, base: geo.attributes.position.array.slice(), n: geo.attributes.position.count });
    };
    mk(GOAL_W, GOAL_H, 18, 8, (m) => { m.rotation.y = -Math.PI / 2; m.position.set(GOAL_D, GOAL_H / 2, 0); });                 // back
    mk(GOAL_D, GOAL_H, 7, 8, (m) => { m.position.set(GOAL_D / 2, GOAL_H / 2, -hw); });                                           // sides
    mk(GOAL_D, GOAL_H, 7, 8, (m) => { m.position.set(GOAL_D / 2, GOAL_H / 2, hw); });
    mk(GOAL_D, GOAL_W, 7, 18, (m) => { m.rotation.x = Math.PI / 2; m.position.set(GOAL_D / 2, GOAL_H, 0); });                   // top
    this.mat = mat;
  }
  /** world point + strength 0..1 */
  hit(world, strength = 1) { this.impact = { p: this.group.worldToLocal(world.clone()), t: 0, s: strength }; }
  update(dt) {
    const im = this.impact; if (!im) return;
    im.t += dt;
    const amp = im.s * 0.55 * Math.exp(-im.t * 2.6) * Math.cos(im.t * 15);
    if (Math.abs(amp) < 0.002 && im.t > 0.4) {
      for (const n of this.nets) { n.mesh.geometry.attributes.position.array.set(n.base); n.mesh.geometry.attributes.position.needsUpdate = true; }
      this.impact = null; return;
    }
    const v = new THREE.Vector3();
    for (const n of this.nets) {
      const pos = n.mesh.geometry.attributes.position, arr = pos.array;
      for (let i = 0; i < n.base.length / 3; i++) {
        v.set(n.base[i * 3], n.base[i * 3 + 1], n.base[i * 3 + 2]).applyMatrix4(n.mesh.matrix);
        const d = v.distanceTo(im.p);
        const k = Math.exp(-(d * d) / 1.6) * amp;
        arr[i * 3 + 2] = n.base[i * 3 + 2] + k; // local Z is the plane normal
      }
      pos.needsUpdate = true;
    }
  }
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.mat) o.material.dispose(); }); this.mat.dispose(); }
}

export class MatchScene {
  constructor(quality) {
    this.q = quality; this.scene = new THREE.Scene(); this.disposables = [];
    this.weatherName = 'sunny'; this.crowd = { level: 0, target: 0, time: 0 };
    this.buildOffsideLine(); this.buildSky(); this.buildLights(); this.buildPitch(); this.buildGoals(); this.buildBoards(); this.buildStadium(); this.buildBench(); this.buildFlags(); this.buildRain(); this.buildBlobs();
    this.setWeather('sunny');
  }
  track(o) { this.disposables.push(o); return o; }

  buildOffsideLine() {
    const g = new THREE.PlaneGeometry(0.24, PITCH_W + 2); g.rotateX(-Math.PI / 2);
    this.offLine = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0, depthWrite: false }));
    this.offLine.position.y = 0.05; this.offLine.visible = false; this.offLine.renderOrder = 2; this.offLife = 0; this.scene.add(this.offLine);
    this.disposables.push(g, this.offLine.material);
  }
  /** Show the offside line across the pitch at world x for a couple of seconds. */
  flashOffsideLine(x, dur = 2.6) { this.offLine.position.x = x; this.offLine.visible = true; this.offLife = dur; }
  buildSky() {
    const u = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } };
    this.skyU = u;
    const m = new THREE.Mesh(this.track(new THREE.SphereGeometry(520, 24, 12)), this.track(new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying float vY; void main(){ float k = pow(clamp(vY*1.6,0.,1.),0.7); gl_FragColor = vec4(mix(hor,top,k),1.); }',
    })));
    m.renderOrder = -10; this.scene.add(m);
  }
  buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#5b7a4a', 0.95); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    this.sun.position.set(-30, 70, 40); this.scene.add(this.sun); this.scene.add(this.sun.target);
    if (this.q.shadows) {
      this.sun.castShadow = true; this.sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
      const c = this.sun.shadow.camera; c.left = -42; c.right = 42; c.top = 42; c.bottom = -42; c.near = 10; c.far = 180;
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    }
  }
  buildPitch() {
    const ppm = this.q.pitchTex / (PITCH_L + 6), W = this.q.pitchTex, H = Math.round(ppm * (PITCH_W + 6));
    const rnd = mulberry(7);
    this.pitchTex = this.track(canvasTex(W, H, (g) => {
      const bands = 15, bw = W / bands;
      for (let i = 0; i < bands; i++) { g.fillStyle = i % 2 ? '#2d8639' : '#287b32'; g.fillRect(i * bw, 0, bw + 1, H); }
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,20,0'},${0.02 + rnd() * 0.035})`; const s = 1 + rnd() * 3; g.fillRect(rnd() * W, rnd() * H, s * 2, s); }
      const X = (x) => (x + PITCH_L / 2 + 3) * ppm, Z = (z) => (z + PITCH_W / 2 + 3) * ppm;
      g.strokeStyle = 'rgba(255,255,255,.93)'; g.fillStyle = 'rgba(255,255,255,.93)'; g.lineWidth = 0.13 * ppm; g.lineJoin = 'round';
      const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * ppm, (z1 - z0) * ppm);
      const hl = PITCH_L / 2, hw = PITCH_W / 2;
      rect(-hl, -hw, hl, hw);
      g.beginPath(); g.moveTo(X(0), Z(-hw)); g.lineTo(X(0), Z(hw)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 9.15 * ppm, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(X(0), Z(0), 0.25 * ppm, 0, Math.PI * 2); g.fill();
      for (const s of [-1, 1]) {
        const gx = s * hl;
        const bx = (d) => gx - s * d;
        rect(Math.min(gx, bx(PEN_AREA.d)), -PEN_AREA.w / 2, Math.max(gx, bx(PEN_AREA.d)), PEN_AREA.w / 2);
        rect(Math.min(gx, bx(SIX_YARD.d)), -SIX_YARD.w / 2, Math.max(gx, bx(SIX_YARD.d)), SIX_YARD.w / 2);
        g.beginPath(); g.arc(X(bx(PEN_SPOT)), Z(0), 0.25 * ppm, 0, Math.PI * 2); g.fill();
        const th = Math.acos((PEN_AREA.d - PEN_SPOT) / 9.15);
        g.beginPath(); g.arc(X(bx(PEN_SPOT)), Z(0), 9.15 * ppm, s > 0 ? Math.PI - th : -th, s > 0 ? Math.PI + th : th); g.stroke();
      }
      for (const [cx, cz, a0] of [[-hl, -hw, 0], [hl, -hw, Math.PI / 2], [hl, hw, Math.PI], [-hl, hw, Math.PI * 1.5]]) { g.beginPath(); g.arc(X(cx), Z(cz), 1 * ppm, a0, a0 + Math.PI / 2); g.stroke(); }
    }, { aniso: this.q.aniso }));
    this.pitchMat = this.track(new THREE.MeshStandardMaterial({ map: this.pitchTex, roughness: 0.92, metalness: 0 }));
    const pitch = new THREE.Mesh(this.track(new THREE.PlaneGeometry(PITCH_L + 6, PITCH_W + 6)), this.pitchMat);
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; this.scene.add(pitch);
    const apron = new THREE.Mesh(this.track(new THREE.PlaneGeometry(PITCH_L + 40, PITCH_W + 36)), this.track(new THREE.MeshStandardMaterial({ color: '#1f5f2c', roughness: 1 })));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; this.scene.add(apron);
    this.apronMat = apron.material;
    const ground = new THREE.Mesh(this.track(new THREE.PlaneGeometry(900, 900)), this.track(new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 1 })));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; this.scene.add(ground);
  }
  buildGoals() {
    this.netTex = this.track(canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.strokeRect(0, 0, w, h); }, { repeat: true, aniso: 2 }));
    this.goals = { 1: new Goal(1, this.netTex), '-1': new Goal(-1, this.netTex) };
    this.scene.add(this.goals[1].group, this.goals['-1'].group);
  }
  buildBoards() {
    this.ads = new AdBoards(this.q.aniso);
    const dark = this.track(new THREE.MeshStandardMaterial({ color: '#0d1522', roughness: 0.6 }));
    const mk = (len, x, z, ry) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(len, TILE_M.h, 0.12)), dark); body.position.y = TILE_M.h / 2; body.position.z = -0.07; g.add(body);
      const face = this.ads.makeBoard(len); face.position.y = TILE_M.h / 2; face.position.z = 0.0; this.track(face.geometry); g.add(face);
      g.position.set(x, 0, z); g.rotation.y = ry; this.scene.add(g);
    };
    const zb = PITCH_W / 2 + 5.5, xb = PITCH_L / 2 + 6.5;
    mk(PITCH_L + 8, 0, zb, Math.PI);       // near side (faces -Z toward the pitch)
    mk(PITCH_L + 8, 0, -zb, 0);            // far side
    mk(PITCH_W + 8, xb, 0, -Math.PI / 2);  // right end
    mk(PITCH_W + 8, -xb, 0, Math.PI / 2);  // left end
  }
  crowdTexture(home) {
    const r = mulberry(11), size = this.q.crowdTex;
    return canvasTex(size, size / 2, (g, w, h) => {
      g.fillStyle = '#2b3446'; g.fillRect(0, 0, w, h);
      const cols = [home, home, home, '#f2f2f2', '#3a4a64', '#d6b34a', '#c84747', '#2d6fb6', '#1b1b1b', '#e9e4d6', home];
      const rows = 14, dx = w / 40;
      for (let ry = 0; ry < rows; ry++) {
        const y = (ry + 0.5) * (h / rows);
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + h / rows * 0.42, w, 2);
        for (let x = 0; x < 40; x++) {
          const cx = x * dx + dx / 2 + (r() - 0.5) * dx * 0.3, cy = y + (r() - 0.5) * 3;
          g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.ellipse(cx, cy + 5, dx * 0.5, h / rows * 0.46, 0, 0, 7); g.fill();
          g.fillStyle = ['#e9c4a3', '#b8805a', '#7a4a2e', '#f1d1b5'][Math.floor(r() * 4)]; g.beginPath(); g.arc(cx, cy - h / rows * 0.26, dx * 0.26, 0, 7); g.fill();
        }
      }
    }, { repeat: true, aniso: 2 });
  }
  setHomeColor(c) {
    if (this.crowdMat?.map) this.crowdMat.map.dispose();
    const t = this.crowdTexture(c); this.crowdTex = t;
    if (this.crowdMat) { this.crowdMat.map = t; this.crowdMat.emissiveMap = t; this.crowdMat.needsUpdate = true; }
    this.crowdHome = c;
  }
  buildStadium() {
    this.crowdTex = this.crowdTexture('#E2B657');
    this.crowdMat = this.track(new THREE.MeshLambertMaterial({ map: this.crowdTex, emissive: '#ffffff', emissiveMap: this.crowdTex, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
    this.crowdMat.map.repeat.set(1, 1);
    const concrete = this.track(new THREE.MeshLambertMaterial({ color: '#9aa4b3' }));
    const roofMat = this.track(new THREE.MeshLambertMaterial({ color: '#3a4658' }));
    this.standGroups = [];
    const stand = (len, rise, run, x, z, ry, roof) => {
      const g = new THREE.Group();
      const slope = Math.hypot(rise, run);
      const geo = this.track(new THREE.PlaneGeometry(len, slope));
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * len / 14); uv.setY(i, (1 - uv.getY(i)) * slope / 6); }
      const m = new THREE.Mesh(geo, this.crowdMat);
      // faces up and toward the pitch
      m.rotation.set(-(Math.PI / 2 + Math.atan2(rise, run)), 0, 0); m.position.set(0, rise / 2 + 0.4, run / 2); g.add(m);
      const wall = new THREE.Mesh(this.track(new THREE.BoxGeometry(len, rise + 0.8, 0.6)), concrete); wall.position.set(0, (rise + 0.8) / 2, run + 0.3); g.add(wall);
      const front = new THREE.Mesh(this.track(new THREE.BoxGeometry(len, 1.0, 0.5)), concrete); front.position.set(0, 0.5, 0.2); g.add(front);
      if (roof) { const r = new THREE.Mesh(this.track(new THREE.BoxGeometry(len, 0.5, run + 6)), roofMat); r.position.set(0, rise + 7, run / 2 - 1); g.add(r); for (const sx of [-1, 1]) { const p = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.5, rise + 7, 0.5)), concrete); p.position.set(sx * (len / 2 - 3), (rise + 7) / 2, run - 1); g.add(p); } }
      g.position.set(x, 0, z); g.rotation.y = ry; this.scene.add(g); this.standGroups.push(g);
    };
    const zf = PITCH_W / 2 + 10, xf = PITCH_L / 2 + 11;
    stand(150, 9, 15, 0, zf, 0, false);       // near side (low, camera looks over it)
    stand(150, 17, 22, 0, -zf, Math.PI, true);           // far side
    stand(PITCH_W + 18, 14, 20, xf, 0, Math.PI / 2, true);
    stand(PITCH_W + 18, 14, 20, -xf, 0, -Math.PI / 2, true);
    // tunnel in the far stand
    const tun = new THREE.Mesh(this.track(new THREE.BoxGeometry(6, 3.2, 3)), this.track(new THREE.MeshLambertMaterial({ color: '#06080c' }))); tun.position.set(0, 1.6, -zf + 1.2); this.scene.add(tun);
    // floodlights
    const glowTex = this.track(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,248,225,1)'); gr.addColorStop(0.3, 'rgba(255,240,200,.45)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
    const mast = this.track(new THREE.CylinderGeometry(0.5, 0.8, 40, 8));
    const panel = this.track(new THREE.BoxGeometry(9, 4, 0.8));
    const lampMat = this.track(new THREE.MeshBasicMaterial({ color: '#fff6dc', toneMapped: false }));
    this.glows = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * (PITCH_L / 2 + 17), z = sz * (PITCH_W / 2 + 14);
      const m = new THREE.Mesh(mast, concrete); m.position.set(x, 20, z); this.scene.add(m);
      const p = new THREE.Mesh(panel, lampMat); p.position.set(x, 41, z); p.lookAt(0, 8, 0); this.scene.add(p);
      const gl = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })));
      gl.position.set(x * 0.98, 41, z * 0.98); gl.scale.set(30, 30, 1); this.scene.add(gl); this.glows.push(gl);
    }
  }
  buildBench() {
    const glass = this.track(new THREE.MeshLambertMaterial({ color: '#cfd8e3', transparent: true, opacity: 0.35 }));
    const base = this.track(new THREE.MeshLambertMaterial({ color: '#2b3442' }));
    const seat = this.track(new THREE.MeshLambertMaterial({ color: '#c93a3a' }));
    for (const x of [-9, 9]) {
      const g = new THREE.Group();
      const roof = new THREE.Mesh(this.track(new THREE.BoxGeometry(7.5, 0.12, 1.8)), glass); roof.position.set(0, 2.2, 0); g.add(roof);
      const back = new THREE.Mesh(this.track(new THREE.BoxGeometry(7.5, 2.2, 0.08)), glass); back.position.set(0, 1.1, -0.9); g.add(back);
      const s = new THREE.Mesh(this.track(new THREE.BoxGeometry(7, 0.1, 0.5)), seat); s.position.set(0, 0.5, -0.5); g.add(s);
      const b = new THREE.Mesh(this.track(new THREE.BoxGeometry(7, 0.45, 0.4)), base); b.position.set(0, 0.22, -0.5); g.add(b);
      g.position.set(x, 0, -(PITCH_W / 2 + 2.6)); this.scene.add(g);
    }
    this.benchPoint = { h: { x: -9, z: -(PITCH_W / 2 + 2.2) }, a: { x: 9, z: -(PITCH_W / 2 + 2.2) } };
    this.tunnelPoint = { x: 0, z: -(PITCH_W / 2 + 6) };
  }
  buildFlags() {
    const pole = this.track(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6)), poleM = this.track(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const flag = this.track(new THREE.PlaneGeometry(0.4, 0.3)), flagM = this.track(new THREE.MeshBasicMaterial({ color: '#ffd23f', side: THREE.DoubleSide }));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p = new THREE.Mesh(pole, poleM); p.position.set(sx * PITCH_L / 2, 0.8, sz * PITCH_W / 2); this.scene.add(p);
      const f = new THREE.Mesh(flag, flagM); f.position.set(sx * PITCH_L / 2 - sx * 0.2, 1.45, sz * PITCH_W / 2); this.scene.add(f);
    }
  }
  buildRain() {
    const n = this.q.rain, pos = new Float32Array(n * 6), tip = new Float32Array(n * 2), r = mulberry(5);
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * 150, y = r() * 40, z = (r() - 0.5) * 110;
      pos.set([x, y, z, x, y, z], i * 6); tip[i * 2] = 0; tip[i * 2 + 1] = 1;
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    this.rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() } };
    this.rain = new THREE.LineSegments(geo, this.track(new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'attribute float aTip; uniform float uTime; uniform vec3 uCenter; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y - uTime*26., 40.); p.x += (40.-p.y)*0.12; p.xz += uCenter.xz*0.0; p.xz = mod(p.xz - uCenter.xz + vec2(75.,55.), vec2(150.,110.)) - vec2(75.,55.) + uCenter.xz; p += aTip * vec3(-0.07*0.9, 1.0, 0.0) * 0.9; vA = 0.25 + 0.2*aTip; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.72,0.8,0.9,vA); }',
    })));
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain);
  }
  buildBlobs() {
    const tex = this.track(canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, { srgb: false }));
    const geo = this.track(new THREE.PlaneGeometry(1.5, 1.5)); geo.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(geo, this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: this.q.shadows ? 0.35 : 0.8 })), 40);
    this.blobs.frustumCulled = false; this.blobs.count = 0; this.blobs.renderOrder = 1; this.scene.add(this.blobs);
    this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }
  setBlobs(list) {
    let i = 0;
    for (const b of list) { if (i >= 40) break; this._v.set(b.x, 0.03, b.z); this._s.set(b.s, 1, b.s); this._m.compose(this._v, this._q, this._s); this.blobs.setMatrixAt(i++, this._m); }
    this.blobs.count = i; this.blobs.instanceMatrix.needsUpdate = true;
  }

  setWeather(name) {
    const W = WEATHER[name] || WEATHER.sunny; this.weatherName = name in WEATHER ? name : 'sunny';
    this.skyU.top.value.set(W.top); this.skyU.hor.value.set(W.horizon);
    this.scene.fog = new THREE.Fog(W.fog, W.fogNear, W.fogFar);
    this.hemi.color.set(W.hemiSky); this.hemi.groundColor.set(W.hemiGround); this.hemi.intensity = W.hemi;
    this.sun.color.set(W.sunColor); this.sun.intensity = W.sun;
    this.pitchMat.color.setScalar(W.grass); this.pitchMat.roughness = W.rough; this.apronMat.color.set(name === 'rainy' ? '#17402a' : '#1f5f2c');
    this.rain.visible = name === 'rainy';
    for (const g of this.glows) g.material.opacity = name === 'rainy' ? 1 : 0.7;
  }
  roar(level = 1) { this.crowd.target = Math.max(this.crowd.target, level); }
  netHit(sign, world, strength) { this.goals[sign]?.hit(world, strength); }

  update(dt, time, focus, nowMs) {
    for (const g of Object.values(this.goals)) g.update(dt);
    if (this.offLife > 0) { this.offLife -= dt; this.offLine.material.opacity = Math.max(0, Math.min(1, this.offLife * 1.4)) * 0.85; if (this.offLife <= 0) this.offLine.visible = false; }
    this.ads.update(nowMs);
    this.crowd.level += (this.crowd.target - this.crowd.level) * damp(6, dt); this.crowd.target *= Math.exp(-dt * 0.55);
    const lv = this.crowd.level;
    const t = this.crowdTex; if (t) { t.offset.y = Math.sin(time * 2.3) * 0.004 + Math.abs(Math.sin(time * 9)) * 0.012 * lv; t.offset.x = Math.sin(time * 0.9) * 0.002 * lv; }
    if (this.rain.visible) { this.rainU.uTime.value = time; this.rainU.uCenter.value.set(focus.x, 0, focus.z); }
    if (this.q.shadows) { this.sun.position.set(focus.x - 22, 70, focus.z + 34); this.sun.target.position.set(focus.x, 0, focus.z); this.sun.target.updateMatrixWorld(); }
  }
  dispose() {
    for (const o of this.disposables) o.dispose?.();
    for (const g of Object.values(this.goals)) g.dispose();
    this.ads.dispose(); this.crowdTex?.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
void clamp;
