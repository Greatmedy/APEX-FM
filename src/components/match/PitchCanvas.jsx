import { useEffect, useRef } from 'react';
import { GK_KIT } from '../../lib/kits';

const L = 105, W = 68;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const SHOT_K = ['shot', 'goal', 'miss', 'corner', 'pen'];

/** Canvas 2D pitch. Reads the MatchPlayer state every frame; React never re-renders it. */
export default function PitchCanvas({ player, kits, className = '' }) {
  const ref = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    let raf = 0, last = performance.now(), size = { w: 0, h: 0, dpr: 1 };
    const tok = new Map();
    const ball = { x: 0.5, y: 0.5 };
    const trail = [];
    const cam = { x: 0.5, y: 0.5, z: 1 };
    let trailAt = 0;

    const resize = () => {
      const r = box.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: r.width, h: r.width * 0.64, dpr };
      cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr);
      cv.style.width = size.w + 'px'; cv.style.height = size.h + 'px';
    };
    const ro = new ResizeObserver(resize); ro.observe(box.current); resize();

    function pitchGeom() {
      const m = size.w * 0.035;
      return { x0: m, y0: m * 0.9, pw: size.w - 2 * m, ph: size.h - 1.8 * m };
    }

    function drawPitch(g) {
      const { x0, y0, pw, ph } = g;
      for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? '#0f6a3e' : '#0d5c36'; ctx.fillRect(x0 + (pw / 14) * i, y0, pw / 14 + 1, ph); }
      const sx = pw / L, sy = ph / W;
      ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = Math.max(1.4, size.w / 420);
      ctx.strokeRect(x0, y0, pw, ph);
      ctx.beginPath(); ctx.moveTo(x0 + pw / 2, y0); ctx.lineTo(x0 + pw / 2, y0 + ph); ctx.stroke();
      ctx.beginPath(); ctx.arc(x0 + pw / 2, y0 + ph / 2, 9.15 * sx, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x0 + pw / 2, y0 + ph / 2, 0.5 * sx + 1, 0, 7); ctx.fill();
      for (const side of [0, 1]) {
        const dir = side ? -1 : 1, gx = x0 + (side ? pw : 0);
        ctx.strokeRect(side ? gx - 16.5 * sx : gx, y0 + (W - 40.32) / 2 * sy, 16.5 * sx, 40.32 * sy);
        ctx.strokeRect(side ? gx - 5.5 * sx : gx, y0 + (W - 18.32) / 2 * sy, 5.5 * sx, 18.32 * sy);
        ctx.beginPath(); ctx.arc(gx + dir * 11 * sx, y0 + ph / 2, 0.45 * sx + 1, 0, 7); ctx.fill();
        const th = Math.acos(5.5 / 9.15);
        ctx.beginPath(); ctx.arc(gx + dir * 11 * sx, y0 + ph / 2, 9.15 * sx, side ? Math.PI - th : -th, side ? Math.PI + th : th); ctx.stroke();
        // goal + net
        const gw = 7.32 * sy, gd = 2.4 * sx, gy = y0 + ph / 2 - gw / 2, gxx = side ? gx : gx - gd;
        ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(gxx, gy, gd, gw); ctx.strokeRect(gxx, gy, gd, gw);
        ctx.save(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255,255,255,.35)';
        for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(gxx, gy + (gw / 6) * i); ctx.lineTo(gxx + gd, gy + (gw / 6) * i); ctx.stroke(); }
        ctx.restore();
        ctx.lineWidth = Math.max(1.4, size.w / 420); ctx.fillStyle = 'rgba(255,255,255,.85)';
      }
      for (const [cx, cy, a0] of [[x0, y0, 0], [x0 + pw, y0, Math.PI / 2], [x0 + pw, y0 + ph, Math.PI], [x0, y0 + ph, Math.PI * 1.5]]) {
        ctx.beginPath(); ctx.arc(cx, cy, sx, a0, a0 + Math.PI / 2); ctx.stroke();
      }
    }

    function targets(st, now) {
      const out = [];
      const bx = ball.x, by = ball.y;
      for (const t of ['h', 'a']) {
        const S = st.sides[t];
        const bz = t === 'h' ? bx : 1 - bx;
        const own = st.poss === t;
        for (const p of S.lineup) {
          if (!p.on) continue;
          const k = p.sg === 'GK' ? 0.1 : p.sg === 'DEF' ? 0.38 : p.sg === 'MID' ? 0.5 : 0.42;
          let px = p.sx + (bz - 0.5) * k + (st.poss ? (own ? 0.05 : -0.03) : 0);
          px = p.sg === 'GK' ? clamp(px, 0.02, 0.14) : clamp(px, 0.04, 0.97);
          const ay0 = t === 'h' ? p.sy : 1 - p.sy;
          let ay = ay0 + (by - 0.5) * (p.sg === 'GK' ? 0.1 : 0.2);
          let ax = t === 'h' ? px : 1 - px;
          const j = hash(p.id);
          ax += Math.sin(now / 900 + j) * 0.004; ay += Math.cos(now / 1100 + j) * 0.005;
          if (st.carrier === p.id) { ax = bx + (t === 'h' ? -0.012 : 0.012); ay = by; }
          out.push({ id: p.id, t, p, x: clamp(ax, 0.01, 0.99), y: clamp(ay, 0.04, 0.96) });
        }
      }
      return out;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const st = player.st;
      const g = pitchGeom();
      // ball
      const tb = player.ball;
      const le = st.lastEv;
      const fast = le && (le.k === 'shot' || le.k === 'goal') ? 9 : le && le.k === 'pass' ? 6.5 : 4.2;
      const kb = 1 - Math.exp(-dt * fast);
      ball.x += (tb.x - ball.x) * kb; ball.y += (tb.y - ball.y) * kb;
      if (now - trailAt > 40) { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 9) trail.shift(); trailAt = now; }
      // camera
      const sinceEv = (now - player.appliedAt) / 1000;
      const focus = le && SHOT_K.includes(le.k) && sinceEv < 2.6;
      const saveFocus = le && le.k === 'save' && sinceEv < 2.2;
      let tz = 1, tx = 0.5 + (ball.x - 0.5) * 0.22, ty = 0.5 + (ball.y - 0.5) * 0.12;
      if (focus || saveFocus) { const gx = ball.x > 0.5 ? 1 : 0; tz = 1.5; tx = gx ? 0.8 : 0.2; ty = 0.5; }
      const kc = 1 - Math.exp(-dt * 2.4);
      cam.z += (tz - cam.z) * kc; cam.x += (tx - cam.x) * kc; cam.y += (ty - cam.y) * kc;

      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.fillStyle = '#082a1b'; ctx.fillRect(0, 0, size.w, size.h);
      ctx.save();
      const cx = g.x0 + cam.x * g.pw, cy = g.y0 + cam.y * g.ph;
      ctx.translate(size.w / 2, size.h / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cx, -cy);
      drawPitch(g);

      const R = Math.max(8.5, g.pw * 0.0158);
      const px = (nx) => g.x0 + nx * g.pw, py = (ny) => g.y0 + ny * g.ph;
      const list = targets(st, now);
      const kk = 1 - Math.exp(-dt * 3.4);
      for (const T of list) {
        let o = tok.get(T.id);
        if (!o) { o = { x: T.x, y: T.y }; tok.set(T.id, o); }
        const carrier = st.carrier === T.id;
        const k2 = carrier ? 1 - Math.exp(-dt * 7) : kk;
        o.x += (T.x - o.x) * k2; o.y += (T.y - o.y) * k2;
      }
      // shadows then tokens
      for (const T of list) {
        const o = tok.get(T.id);
        const isGK = T.p.sg === 'GK' && T.p.g === 'GK';
        const kit = isGK ? GK_KIT[T.t] : kits[T.t];
        const x = px(o.x), y = py(o.y);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 1.5, y + R * 0.85, R * 0.95, R * 0.4, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fillStyle = kit.shirt; ctx.fill();
        ctx.lineWidth = st.carrier === T.id ? 2.4 : 1.4; ctx.strokeStyle = st.carrier === T.id ? '#14F195' : 'rgba(255,255,255,.9)'; ctx.stroke();
        if (T.p.y) { ctx.fillStyle = '#facc15'; ctx.fillRect(x + R * 0.55, y - R * 1.15, R * 0.5, R * 0.7); }
        ctx.fillStyle = kit.number; ctx.font = `700 ${Math.round(R * 1.05)}px Oswald, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(T.p.num), x, y + 0.5);
        if (st.carrier === T.id) {
          const nm = T.p.name.split(' ').slice(-1)[0];
          ctx.font = `700 ${Math.round(R * 0.95)}px Manrope, sans-serif`;
          const w = ctx.measureText(nm).width + 10;
          ctx.fillStyle = 'rgba(7,17,31,.82)'; ctx.fillRect(x - w / 2, y + R + 3, w, R * 1.3);
          ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y + R + 3 + R * 0.68);
        }
      }
      // ball trail + ball
      for (let i = 0; i < trail.length; i++) {
        const a = (i + 1) / trail.length;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`; ctx.beginPath(); ctx.arc(px(trail[i].x), py(trail[i].y), R * 0.32 * a + 1, 0, 7); ctx.fill();
      }
      const bxp = px(ball.x), byp = py(ball.y);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(bxp + 1.5, byp + R * 0.4, R * 0.42, R * 0.18, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(bxp, byp, R * 0.42, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#0b1220'; ctx.stroke();
      ctx.restore();

      // goal flash
      if (le && le.k === 'goal' && sinceEv < 1.8) {
        const a = Math.max(0, 1 - sinceEv / 1.8);
        ctx.fillStyle = `rgba(255,255,255,${0.35 * a * a})`; ctx.fillRect(0, 0, size.w, size.h);
        const sc = st.sides[le.t].lineup.find((p) => p.id === le.p);
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 2.2); ctx.textAlign = 'center';
        ctx.fillStyle = '#14F195'; ctx.font = `700 ${Math.round(size.w * 0.1)}px Oswald, sans-serif`; ctx.fillText('GOAL!', size.w / 2, size.h * 0.47);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(size.w * 0.034)}px Manrope, sans-serif`; ctx.fillText(sc ? sc.name : '', size.w / 2, size.h * 0.58);
        ctx.restore();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [player, kits]);

  return (
    <div ref={box} className={`w-full ${className}`}>
      <canvas ref={ref} className="block rounded-xl w-full" role="img" aria-label="2D match pitch" />
    </div>
  );
}
