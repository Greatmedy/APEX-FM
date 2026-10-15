import * as THREE from 'three';
import { MatchScene, QUALITY } from './Match3DScene';
import { Ball } from './Match3DBall';
import { MatchCamera } from './Match3DCamera';
import { PlayerRegistry } from './Match3DPlayers';
import { StateAdapter } from './Match3DStateAdapter';
import { Director } from './Match3DEvents';
import { disposeTemplates } from './Match3DAssets';
import { hashStr } from './Match3DMath';

export { webglAvailable, detectQuality } from './webgl';
export const weatherFor = (mode, seed) => (mode === 'sunny' || mode === 'rainy' ? mode : hashStr('wx' + seed) % 100 < 25 ? 'rainy' : 'sunny');

/** Imperative Three.js renderer for a MatchPlayer. React only mounts/unmounts it; nothing here lives in React state. */
export class Match3DEngine {
  constructor({ host, player, kits, quality = 'high', weather = 'auto', camMode = 'broadcast', ads = [], onFail, ui = {} }) {
    this.host = host; this.onFail = onFail; this.disposed = false;
    this.q = { ...QUALITY[quality] || QUALITY.high };
    const renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance', alpha: false });
    this.renderer = renderer;
    this.pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    renderer.setPixelRatio(this.pr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    if (this.q.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.canvas = renderer.domElement; this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
    host.appendChild(this.canvas);
    this.onLost = (e) => { e.preventDefault(); this.onFail?.('The graphics context was lost.'); };
    this.canvas.addEventListener('webglcontextlost', this.onLost);

    this.world = new MatchScene(this.q);
    this.ball = new Ball(); this.world.scene.add(this.ball.mesh);
    this.camera = new MatchCamera(1.6);
    this.camera.setMode(camMode);
    this.registry = new PlayerRegistry(this.world.scene, this.q);
    this.adapter = new StateAdapter();
    this.markerSprite = null; this.markerAgent = null;
    this.ui = {
      overlay: (o) => ui.overlay?.(o), sfx: ui.sfx || {},
      marker: (agent, kind) => this.setMarker(agent, kind),
    };
    this.kits = kits;
    this.director = new Director({ registry: this.registry, ball: this.ball, camera: this.camera, scene: this.world, adapter: this.adapter, ui: this.ui, kits });
    this.ts = 1; this.time = 0; this.frameEma = 16; this.slow = 0; this.visible = true; this.last = performance.now();
    this.weatherMode = weather; this.setAds(ads);
    this.setPlayer(player, kits);

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    this.io = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting !== false; }, { threshold: 0.01 }); this.io.observe(host);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }
  setPlayer(player, kits) {
    this.player = player;
    if (kits) { this.kits = kits; this.director.setKits(kits); this.world.setHomeColor(kits.h.shirt); }
    this.world.setWeather(weatherFor(this.weatherMode, player.setup.seed));
    this.director.attach(player);
  }
  setKits(kits) { this.kits = kits; this.director.setKits(kits); this.world.setHomeColor(kits.h.shirt); this.registry.relook(); }
  setCameraMode(m) { this.camera.setMode(m); }
  setWeather(mode) { this.weatherMode = mode; this.world.setWeather(weatherFor(mode, this.player?.setup.seed || '')); }
  setAds(list) { this.world.ads.setBrands(list); }
  /** replay: speed when playing, 0 when paused; live: always 1 */
  setTime({ mode, playing, speed }) { this.ts = mode === 'replay' ? (playing ? speed : 0) : 1; }
  setMarker(agent) {
    if (!agent) { if (this.markerSprite) this.markerSprite.visible = false; this.markerAgent = null; return; }
    if (!this.markerSprite) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d'); g.fillStyle = '#e11d48'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(27, 14, 10, 36); g.fillRect(14, 27, 36, 10);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.markerSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      this.markerSprite.scale.set(1.1, 1.1, 1); this.markerSprite.renderOrder = 5; this.world.scene.add(this.markerSprite);
    }
    this.markerSprite.visible = true; this.markerAgent = agent;
  }
  resize() {
    const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.setAspect(w / h);
  }
  loop(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dtRaw = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (document.hidden || !this.visible) return;
    this.time += dtRaw;
    try {
      this.director.update(dtRaw, this.ts);
      const b = this.ball, ballVel = { x: 0, z: 0 };
      if (dtRaw > 0) { ballVel.x = (b.pos.x - b.prev.x) / dtRaw; ballVel.z = (b.pos.z - b.prev.z) / dtRaw; }
      const spread = this.spreadNear(b.pos);
      this.camera.update(Math.min(dtRaw, 0.05), b.pos, ballVel, spread);
      const blobs = [];
      for (const a of this.registry.all()) if (a.state !== 'gone' && a.avatar.root.visible) blobs.push({ x: a.x, z: a.z, s: a.state === 'ground' ? 1.6 : 1 });
      blobs.push({ x: b.pos.x, z: b.pos.z, s: 0.35 + Math.min(1.2, b.pos.y * 0.1) });
      this.world.setBlobs(blobs);
      this.world.update(dtRaw, this.time, this.camera.focus, now);
      if (this.markerSprite?.visible && this.markerAgent) this.markerSprite.position.set(this.markerAgent.x, 2.7 + Math.sin(this.time * 4) * 0.08, this.markerAgent.z);
      this.renderer.render(this.world.scene, this.camera.cam);
    } catch (e) {
      this.errors = (this.errors || 0) + 1;
      if (this.errors === 1) console.warn('[3D] frame error', e);
      if (this.errors > 30) { this.onFail?.('The 3D view hit repeated errors.'); this.disposed || this.stopLoop(); }
    }
    this.adapt(dtRaw * 1000);
  }
  stopLoop() { cancelAnimationFrame(this.raf); }
  spreadNear(p) { let mn = 1e9, mx = -1e9, n = 0; for (const a of this.registry.players3D.values()) { if (Math.hypot(a.x - p.x, a.z - p.z) < 26) { mn = Math.min(mn, a.x); mx = Math.max(mx, a.x); n++; } } return n > 2 ? mx - mn : 22; }
  /** Degrade gracefully on slow devices: lower pixel ratio first, then drop shadow maps. */
  adapt(ms) {
    this.frameEma += (ms - this.frameEma) * 0.04;
    if (this.frameEma > 27) this.slow++; else this.slow = Math.max(0, this.slow - 2);
    if (this.slow > 120) {
      this.slow = 0;
      if (this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.renderer.setPixelRatio(this.pr); this.resize(); }
      else if (this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.world.sun.castShadow = false; this.world.blobs.material.opacity = 0.8; this.world.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.stopLoop(); this.ro?.disconnect(); this.io?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    try { this.registry.dispose(); this.ball.dispose(); this.world.dispose(); this.markerSprite?.material.map?.dispose(); this.markerSprite?.material.dispose(); disposeTemplates(); } catch (e) { console.warn('[3D] dispose', e); }
    this.renderer.dispose(); this.renderer.forceContextLoss?.();
    this.canvas.remove();
  }
}
