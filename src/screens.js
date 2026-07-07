import * as THREE from 'three';

// Animated canvas-backed screens. Each screen redraws at its own interval;
// textures are used as emissiveMap so they glow (and bloom).
export class ScreenManager {
  constructor() {
    this.items = [];
  }

  add(pxW, pxH, interval, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = pxW; canvas.height = pxH;
    const g = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    draw(g, pxW, pxH, 0);
    this.items.push({ g, tex, draw, interval, next: Math.random() * interval, w: pxW, h: pxH });
    return tex;
  }

  update(t) {
    for (const it of this.items) {
      if (t >= it.next) {
        it.draw(it.g, it.w, it.h, t);
        it.tex.needsUpdate = true;
        it.next = t + it.interval;
      }
    }
  }
}

const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function drawRadar(g, w, h, t) {
  g.fillStyle = '#060216'; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 8, R = h / 2 - 22;
  g.strokeStyle = 'rgba(150,110,255,0.35)'; g.lineWidth = 1.5;
  for (const r of [R, R * 0.66, R * 0.33]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
  // sweep with trail
  const a = t * 1.4;
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = `rgba(255,110,205,${0.5 * (1 - i / 22)})`;
    g.lineWidth = i === 0 ? 2.5 : 2;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a - i * 0.035) * R, cy + Math.sin(a - i * 0.035) * R);
    g.stroke();
  }
  // blips
  for (let i = 0; i < 5; i++) {
    const ba = rnd(i) * 6.28, br = (0.25 + rnd(i + 9) * 0.65) * R;
    const alpha = Math.max(0, Math.sin(t * 0.7 + i * 2)) * 0.9;
    g.fillStyle = `rgba(200,170,255,${alpha})`;
    g.beginPath(); g.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 3.5, 0, 7); g.fill();
  }
  g.fillStyle = '#a887ff'; g.font = 'bold 15px monospace';
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('PROX SCAN', 10, 8);
  g.textAlign = 'right';
  g.fillText(`RNG 12.0K`, w - 10, 8);
}

export function drawTelemetry(g, w, h, t) {
  g.fillStyle = '#080318'; g.fillRect(0, 0, w, h);
  g.font = '14px monospace'; g.textBaseline = 'top'; g.textAlign = 'left';
  const labels = ['NAV', 'PWR', 'O2 ', 'THR', 'GRV', 'FLX', 'HUL', 'COM', 'H2O', 'CPU'];
  const base = Math.floor(t * 2);
  for (let r = 0; r < 10; r++) {
    const y = 8 + r * 17;
    const i = base + r;
    g.fillStyle = r === base % 10 ? '#d8ccff' : '#7458d8';
    const v1 = (rnd(i) * 9999) | 0, v2 = (rnd(i + 55) * 255) | 0;
    g.fillText(`${labels[r]} ${String(v1).padStart(4, '0')} :: ${v2.toString(16).padStart(2, '0').toUpperCase()} ${rnd(i + 7) > 0.5 ? 'OK' : '--'}`, 10, y);
  }
  g.fillStyle = 'rgba(150,110,255,0.13)';
  g.fillRect(0, ((t * 26) % h), w, 3);
}

export function drawAttitude(g, w, h, t) {
  g.fillStyle = '#03040f'; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  g.save();
  g.translate(cx, cy);
  g.rotate(Math.sin(t * 0.22) * 0.09);
  const off = Math.sin(t * 0.13) * 12;
  g.fillStyle = '#171c4e'; g.fillRect(-w, -h + off, w * 2, h);   // sky
  g.fillStyle = '#100a26'; g.fillRect(-w, off, w * 2, h);        // ground
  g.strokeStyle = '#8f9dff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-w, off); g.lineTo(w, off); g.stroke();
  g.font = '11px monospace'; g.fillStyle = '#7a82e8'; g.textAlign = 'center';
  for (const p of [-40, -20, 20, 40]) {
    const y = off + p;
    g.beginPath(); g.moveTo(-34, y); g.lineTo(34, y); g.stroke();
    g.fillText(String(Math.abs(p / 2)), 52, y + 4);
  }
  g.restore();
  // frame + flight path marker
  g.strokeStyle = '#e4e6ff'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - 26, cy); g.lineTo(cx - 8, cy); g.arc(cx, cy, 8, Math.PI, 0, true); g.lineTo(cx + 26, cy); g.stroke();
  g.fillStyle = '#6a8aff'; g.font = 'bold 13px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('ATT HOLD', 8, 6);
  g.textAlign = 'right';
  g.fillText(`HDG ${String((t * 3 | 0) % 360).padStart(3, '0')}`, w - 8, 6);
  g.fillText(`VEL 212m/s`, w - 8, h - 20);
}

export function drawReactorPanel(g, w, h, t) {
  g.fillStyle = '#0c0418'; g.fillRect(0, 0, w, h);
  const bw = 34;
  for (let i = 0; i < 4; i++) {
    const x = 14 + i * (bw + 12);
    const v = 0.55 + 0.35 * Math.sin(t * (0.8 + i * 0.23) + i * 2);
    const bh = (h - 58) * v;
    const grad = g.createLinearGradient(0, h - 20 - bh, 0, h - 20);
    grad.addColorStop(0, '#c98aff'); grad.addColorStop(1, '#e0329a');
    g.fillStyle = '#1c0a2c'; g.fillRect(x, 30, bw, h - 50);
    g.fillStyle = grad; g.fillRect(x, h - 20 - bh, bw, bh);
    g.strokeStyle = '#4a2a78'; g.strokeRect(x, 30, bw, h - 50);
  }
  // waveform
  g.strokeStyle = '#b06aff'; g.lineWidth = 2;
  g.beginPath();
  const x0 = 14 + 4 * (bw + 12) + 6;
  for (let x = 0; x < w - x0 - 12; x++) {
    const y = h / 2 + 14 + Math.sin(x * 0.14 + t * 5) * 16 * Math.sin(x * 0.02 + t);
    x === 0 ? g.moveTo(x0 + x, y) : g.lineTo(x0 + x, y);
  }
  g.stroke();
  g.fillStyle = '#ff6ec7'; g.font = 'bold 15px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('REACTOR OUTPUT', 14, 8);
  g.fillStyle = '#b08aff'; g.textAlign = 'right';
  g.fillText(`${(96.4 + Math.sin(t * 0.6) * 2.2).toFixed(1)}%`, w - 12, 8);
}

export function drawMenu(g, w, h, t) {
  g.fillStyle = '#0e0520'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7a44cc'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(5, 5, w - 10, h - 10, 14); g.stroke();
  g.fillStyle = '#e6b8ff'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillText('— GALLEY · CYCLE 7 —', w / 2, 14);
  const items = ['PROTEIN PASTE Nº7', 'HYDRO-NOODLES', 'ALGAE CRISP', 'CAF (SYNTH) 0.2L', 'RATION BAR D'];
  const hot = Math.floor(t / 2) % items.length;
  g.font = '17px monospace'; g.textAlign = 'left';
  items.forEach((it, i) => {
    const y = 52 + i * 26;
    if (i === hot) {
      g.fillStyle = 'rgba(200,110,255,0.2)';
      g.beginPath(); g.roundRect(12, y - 4, w - 24, 24, 10); g.fill();
    }
    g.fillStyle = i === hot ? '#ffe0f4' : '#a878e0';
    g.fillText(it, 20, y);
    g.textAlign = 'right'; g.fillText(`${3 + i}cr`, w - 20, y); g.textAlign = 'left';
  });
  if (Math.floor(t) % 2 === 0) {
    g.fillStyle = '#ff6ec7'; g.beginPath(); g.arc(w - 26, 26, 6, 0, 7); g.fill();
  }
}

export function drawStarchart(g, w, h, t) {
  g.fillStyle = '#050418'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,100,230,0.16)'; g.lineWidth = 1;
  g.beginPath();
  for (let p = 0; p < w; p += 32) { g.moveTo(p, 0); g.lineTo(p, h); }
  for (let p = 0; p < h; p += 32) { g.moveTo(0, p); g.lineTo(w, p); }
  g.stroke();
  const pts = [];
  for (let i = 0; i < 34; i++) {
    const x = (rnd(i) * w + t * 3.5) % w;
    const y = rnd(i + 40) * h;
    pts.push([x, y]);
    g.fillStyle = `rgba(205,200,255,${0.35 + rnd(i + 80) * 0.6})`;
    g.beginPath(); g.arc(x, y, rnd(i + 3) * 1.8 + 0.7, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(150,110,255,0.35)';
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const [ax, ay] = pts[i * 3], [bx, by] = pts[i * 3 + 1];
    if (Math.abs(ax - bx) < w * 0.4) { g.moveTo(ax, ay); g.lineTo(bx, by); }
  }
  g.stroke();
  // "you are here"
  const px = w * 0.62, py = h * 0.44, pr = 8 + Math.sin(t * 2.4) * 3;
  g.strokeStyle = '#ff6ec7'; g.lineWidth = 2;
  g.beginPath(); g.arc(px, py, pr, 0, 7); g.stroke();
  g.fillStyle = '#ff6ec7'; g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.fill();
  g.font = '12px monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('SECTOR K-115 // ROUTE PLOTTED', 10, h - 20);
  g.fillText('CHART', 10, 6);
}
