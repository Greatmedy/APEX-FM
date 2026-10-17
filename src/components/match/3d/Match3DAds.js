import * as THREE from 'three';
import { API_URL } from '../../../lib/api';

export const AD_ROTATE_MS = 5000;
const TW = 1280, TH = 270;
export const TILE_M = { w: 6.4, h: 1.35 }; // one brand per 6.4 m x 1.35 m panel: large enough to read from the broadcast camera

/**
 * Pitch-side LED advertising boards. The configured lineup (<= 20 brands, locked server-side when the matchday starts)
 * rotates every 5 seconds, entirely client-side. All boards share one canvas texture (tiled along the board geometry).
 */
export class AdBoards {
  constructor(maxAniso = 4) {
    this.cv = document.createElement('canvas'); this.cv.width = TW; this.cv.height = TH;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.wrapS = THREE.RepeatWrapping; this.tex.anisotropy = maxAniso;
    this.brands = []; this.imgs = []; this.idx = -1; this.fade = null; this.ready = true;
    this.t0 = performance.now(); this.token = 0; this.disposed = false;
    this.paint(null);
  }
  /** brands: [{name, url}] (url may be relative to the API origin) */
  setBrands(brands) {
    const list = (brands || []).slice(0, 20).filter((b) => b && b.name);
    const key = JSON.stringify(list.map((b) => [b.name, b.url]));
    if (key === this.key) return;
    this.key = key; this.brands = list; this.idx = -1; this.fade = null; this.token++;
    const token = this.token;
    this.imgs = list.map((b) => {
      const o = { img: null, ok: false };
      if (!b.url) return o;
      const img = new Image(); img.crossOrigin = 'anonymous';
      o.p = new Promise((res) => { img.onload = () => { o.ok = true; res(); }; img.onerror = () => res(); });
      img.src = /^https?:/i.test(b.url) ? b.url : API_URL + b.url;
      o.img = img; return o;
    });
    this.ready = false;
    const all = Promise.all(this.imgs.map((o) => o.p).filter(Boolean));
    const timeout = new Promise((r) => setTimeout(r, 3500));
    Promise.race([all, timeout]).then(() => { if (token === this.token && !this.disposed) { this.ready = true; this.t0 = performance.now(); } });
    this.paint(null);
  }
  /** Which brand is currently on the boards (null = neutral default). */
  get current() { return this.idx >= 0 ? this.brands[this.idx] : null; }
  update(now) {
    if (this.disposed) return;
    if (!this.brands.length || !this.ready) return;
    const idx = Math.floor((now - this.t0) / AD_ROTATE_MS) % this.brands.length;
    if (idx !== this.idx) { const from = this.idx; this.idx = idx; this.fade = { from, t0: now }; }
    if (this.fade) {
      const k = Math.min(1, (now - this.fade.t0) / 380);
      this.paint(this.idx, this.fade.from, k);
      if (k >= 1) this.fade = null;
    }
  }
  paint(idx, from = null, k = 1) {
    const g = this.g;
    g.globalAlpha = 1;
    if (k < 1) {
      this.tile(from != null && from >= 0 ? from : null);
      g.globalAlpha = k; this.tile(idx); g.globalAlpha = 1;
    } else this.tile(idx);
    this.tex.needsUpdate = true;
  }
  tile(i) {
    const g = this.g;
    const bg = g.createLinearGradient(0, 0, 0, TH); bg.addColorStop(0, '#0a1322'); bg.addColorStop(1, '#17263f');
    g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#14F195'; g.fillRect(0, TH - 12, TW, 12);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, 0, TW, 10);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, 6, TH); g.fillRect(TW - 6, 0, 6, TH); // panel edges keep neighbouring tiles apart
    const b = i != null && i >= 0 ? this.brands[i] : null;
    g.textBaseline = 'middle';
    const FONT = (n) => `800 ${n}px Oswald, Impact, 'Arial Narrow', sans-serif`;
    if (!b) {
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = FONT(150);
      g.fillText('APEX FM 2027', TW / 2, TH / 2 - 8);
      return;
    }
    const o = this.imgs[i];
    const hasImg = o && o.ok && o.img && o.img.naturalWidth;
    let textX = TW / 2, align = 'center', maxW = TW - 160;
    if (hasImg) {
      const plateW = 380, plateH = 226, px = 44, py = 18;
      g.fillStyle = '#ffffff'; g.beginPath();
      if (g.roundRect) g.roundRect(px, py, plateW, plateH, 22); else g.rect(px, py, plateW, plateH);
      g.fill();
      const pad = 18, s = Math.min((plateW - pad * 2) / o.img.naturalWidth, (plateH - pad * 2) / o.img.naturalHeight);
      const w = o.img.naturalWidth * s, h = o.img.naturalHeight * s;
      try { g.drawImage(o.img, px + (plateW - w) / 2, py + (plateH - h) / 2, w, h); } catch { /* broken image: the name still shows */ }
      textX = px + plateW + 70; align = 'left'; maxW = TW - textX - 50;
    }
    const name = b.name.toUpperCase();
    let size = 168; g.font = FONT(size);
    while (g.measureText(name).width > maxW && size > 56) { size -= 6; g.font = FONT(size); }
    g.fillStyle = '#000000'; g.textAlign = align; g.fillText(name, textX + 4, TH / 2 - 6 + 4); // shadow for contrast
    g.fillStyle = '#ffffff'; g.fillText(name, textX, TH / 2 - 6);
  }
  /** A board front plane (length m along local X). UVs tile the 4.8 m tile along the board. */
  makeBoard(length, height = TILE_M.h) {
    const geo = new THREE.PlaneGeometry(length, height);
    const uv = geo.attributes.uv, n = Math.max(1, Math.round(length / TILE_M.w));
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * n);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
  }
  dispose() { this.disposed = true; this.token++; this.tex.dispose(); }
}
