import * as THREE from 'three';

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function treadPlateTex(repeat) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#171a22'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#0d0f15'; g.lineWidth = 3;
    g.beginPath();
    for (let p = 0; p <= 256; p += 128) { g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); }
    g.stroke();
    g.fillStyle = '#20242f';
    for (let y = 10; y < 256; y += 24) {
      for (let x = 10; x < 256; x += 34) {
        g.save();
        g.translate(x + ((y / 24) % 2) * 17, y);
        g.rotate(Math.PI / 4);
        g.fillRect(-7, -2.5, 14, 5);
        g.restore();
      }
    }
    g.fillStyle = '#090b10';
    for (const cx of [8, 120, 136, 248]) for (const cy of [8, 120, 136, 248]) {
      g.beginPath(); g.arc(cx, cy, 3.5, 0, 7); g.fill();
    }
  }, repeat);
}

function grateTex(repeat) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#181c26'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#04050a';
    for (let y = 6; y < 256; y += 26) {
      for (let x = 6; x < 256; x += 26) {
        g.beginPath();
        g.roundRect(x, y, 16, 16, 6);
        g.fill();
      }
    }
  }, repeat);
}

function tileTex(repeat) {
  return canvasTex(512, 512, (g) => {
    const n = 8, s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 15 + ((i * 13 + j * 7) % 5) * 2;
        g.fillStyle = (i === 5 && j % 3 === 0) ? '#4a3a7e' : `hsl(238,16%,${v}%)`;
        g.fillRect(i * s, j * s, s, s);
      }
    }
    g.strokeStyle = '#0a0c14'; g.lineWidth = 5;
    g.beginPath();
    for (let p = 0; p <= 512; p += s) { g.moveTo(p, 0); g.lineTo(p, 512); g.moveTo(0, p); g.lineTo(512, p); }
    g.stroke();
  }, repeat);
}

function hazardTex(repeat) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#e0479a'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#12060f';
    for (let i = -128; i < 256; i += 46) {
      g.beginPath();
      g.moveTo(i, 128); g.lineTo(i + 128, 0); g.lineTo(i + 128 + 20, 0); g.lineTo(i + 20, 128);
      g.closePath(); g.fill();
    }
  }, repeat);
}

export function nebulaTex(rgb) {
  return canvasTex(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    grad.addColorStop(0, `rgba(${rgb},0.55)`);
    grad.addColorStop(0.45, `rgba(${rgb},0.18)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });
}

export function planetTex() {
  return canvasTex(512, 256, (g) => {
    const bands = ['#4a3a92', '#6a55cc', '#372a70', '#8a68e2', '#2a2058', '#a488ea', '#5646ac'];
    for (let y = 0; y < 256; y++) {
      const w = Math.sin(y * 0.11) * 9 + Math.sin(y * 0.031) * 16;
      const idx = Math.floor(((y + w) / 256) * bands.length * 1.6) % bands.length;
      g.fillStyle = bands[Math.abs(idx)];
      g.fillRect(0, y, 512, 1);
    }
    // storm eye
    g.fillStyle = 'rgba(255,170,225,0.85)';
    g.beginPath(); g.ellipse(350, 170, 34, 14, -0.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(210,90,190,0.9)';
    g.beginPath(); g.ellipse(350, 170, 22, 8, -0.2, 0, 7); g.fill();
    // polar shading
    const sh = g.createLinearGradient(0, 0, 0, 256);
    sh.addColorStop(0, 'rgba(12,8,28,0.6)');
    sh.addColorStop(0.25, 'rgba(0,0,0,0)');
    sh.addColorStop(0.75, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(12,8,28,0.6)');
    g.fillStyle = sh;
    g.fillRect(0, 0, 512, 256);
  });
}

export function textPlateTex(text, { fg = '#cabfff', bg = '#0b0618', border = '#5b3fb0', size = 40 } = {}) {
  return canvasTex(512, 128, (g) => {
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, 512, 128, 34); g.fill();
    g.strokeStyle = border; g.lineWidth = 6;
    g.beginPath(); g.roundRect(8, 8, 496, 112, 28); g.stroke();
    g.fillStyle = border;
    for (const x of [26, 486]) { g.beginPath(); g.roundRect(x - 5, 50, 10, 28, 5); g.fill(); } // side pips
    g.font = `bold ${size}px 'Courier New', monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(text, 256, 68);
  });
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export function makeMats() {
  return {
    hull:      std({ color: 0x232833, roughness: 0.55, metalness: 0.6 }),
    hullDark:  std({ color: 0x171b24, roughness: 0.55, metalness: 0.55 }),
    trim:      std({ color: 0x0f1219, roughness: 0.6, metalness: 0.5 }),
    panel:     std({ color: 0xffffff, roughness: 0.42, metalness: 0.65 }), // instanced, tinted per-instance
    deck:      std({ color: 0x9aa2ba, roughness: 0.38, metalness: 0.65, map: treadPlateTex([9, 22]) }),
    deckPlain: std({ color: 0x14171f, roughness: 0.42, metalness: 0.55 }),
    grate:     std({ color: 0x8a90aa, roughness: 0.5, metalness: 0.65, map: grateTex([5, 5]) }),
    tile:      std({ color: 0xb8bed2, roughness: 0.28, metalness: 0.1, map: tileTex([3, 4.5]) }),
    hazard:    std({ color: 0xffffff, roughness: 0.55, metalness: 0.25, map: hazardTex([2, 0.5]) }),
    white:     std({ color: 0xdfe4ee, roughness: 0.35, metalness: 0.08 }),
    chrome:    std({ color: 0xd6dbe2, roughness: 0.14, metalness: 1.0 }),
    steel:     std({ color: 0x515a70, roughness: 0.3, metalness: 0.85 }),
    copper:    std({ color: 0x6e5a9c, roughness: 0.36, metalness: 0.85 }), // amethyst conduit
    glass:     std({ color: 0xa8c4ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.18 }),
    accent:    std({ color: 0xd9479a, roughness: 0.5, metalness: 0.3 }),
    accentViolet: std({ color: 0x6a4ae0, roughness: 0.5, metalness: 0.3 }),
    housing:   std({ color: 0x0c0f16, roughness: 0.42, metalness: 0.5 }),
    bedBase:   std({ color: 0x333c68, roughness: 0.85 }),
    bedding:   std({ color: 0x8a94b8, roughness: 0.95 }),
    pillow:    std({ color: 0xdfe3f2, roughness: 0.95 }),
    mirror:    std({ color: 0xb8c2cc, roughness: 0.05, metalness: 1.0 }),
    emWhite:   std({ color: 0x0c0e16, emissive: 0xd6dcff, emissiveIntensity: 1.0 }),
    emViolet:  std({ color: 0x0c0718, emissive: 0x8a5cff, emissiveIntensity: 1.8 }),
    emPink:    std({ color: 0x140a12, emissive: 0xff6ec7, emissiveIntensity: 1.6 }),
    emMagenta: std({ color: 0x14060e, emissive: 0xff4fa0, emissiveIntensity: 1.5 }),
    emBlue:    std({ color: 0x060a16, emissive: 0x4f8cff, emissiveIntensity: 1.6 })
  };
}
