import * as THREE from 'three';
import { makeMats, nebulaTex, planetTex } from './materials.js';
import {
  ScreenManager, drawRadar, drawTelemetry, drawAttitude,
  drawReactorPanel, drawMenu, drawStarchart
} from './screens.js';
import * as P from './props.js';

// Ship layout (top view, +z = aft):
//
//         cockpit  (z -26.5..-14, angled glass nose)
//            |door
//    cantina | bedroom     (z -13..0)
//    --------+--------
//    dorm    | bathroom    (z 0..13)
//            |door
//        machine room (z 14..26)
//
// Central corridor: x -2..2, z -14..14. Side rooms span x ±2..±10.

const H = 3;        // wall height
const T = 0.3;      // wall thickness
const DOOR_W = 2;   // door opening width
const DOOR_H = 2.3; // door opening height

export const ROOMS = [
  { name: 'BRIDGE',       minX: -7,  maxX: 7,  minZ: -26.5, maxZ: -14 },
  { name: 'MACHINE ROOM', minX: -7,  maxX: 7,  minZ: 14,    maxZ: 26 },
  { name: 'CANTINA',      minX: -10, maxX: -2, minZ: -13,   maxZ: 0 },
  { name: 'DORM ROOM',    minX: -10, maxX: -2, minZ: 0,     maxZ: 13 },
  { name: 'BEDROOM',      minX: 2,   maxX: 10, minZ: -13,   maxZ: 0 },
  { name: 'BATHROOM',     minX: 2,   maxX: 10, minZ: 0,     maxZ: 13 },
  { name: 'CORRIDOR',     minX: -2,  maxX: 2,  minZ: -14,   maxZ: 14 }
];

export function roomAt(x, z) {
  for (const r of ROOMS) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r.name;
  }
  return 'CORRIDOR';
}

class Door {
  // Double sliding door with frame, hazard posts and status light.
  constructor(ctx, x, z, along) {
    this.ctx = ctx;
    this.center = new THREE.Vector3(x, DOOR_H / 2, z);
    this.along = along;
    this.openAmount = 0;
    this._wasNear = false;

    const { scene, mats, colliders } = ctx;
    const half = DOOR_W / 2;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2b303c, metalness: 0.65, roughness: 0.38 });
    const insetMat = new THREE.MeshStandardMaterial({ color: 0x1a1f2a, metalness: 0.5, roughness: 0.5 });

    const mk = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), panelMat);
    const mkPanel = (edgeSign) => {
      const g = new THREE.Group();
      const main = along === 'x' ? mk(half, DOOR_H, T * 0.55) : mk(T * 0.55, DOOR_H, half);
      g.add(main);
      const inset = new THREE.Mesh(
        along === 'x'
          ? new THREE.BoxGeometry(half - 0.24, DOOR_H - 0.55, T * 0.55 + 0.03)
          : new THREE.BoxGeometry(T * 0.55 + 0.03, DOOR_H - 0.55, half - 0.24),
        insetMat
      );
      g.add(inset);
      // glowing rounded bar on the leading edge; the two bars merge into one
      // seam of light when the door is shut
      const strip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.1, DOOR_H - 0.5, 4, 12),
        mats.emViolet
      );
      strip.position[along === 'x' ? 'x' : 'z'] = edgeSign * (half / 2 - 0.035);
      g.add(strip);
      const grip = new THREE.Mesh(
        along === 'x'
          ? new THREE.BoxGeometry(0.06, 0.5, T * 0.55 + 0.05)
          : new THREE.BoxGeometry(T * 0.55 + 0.05, 0.5, 0.06),
        mats.trim
      );
      grip.position[along === 'x' ? 'x' : 'z'] = edgeSign * (half / 2 - 0.14);
      grip.position.y = -0.15;
      g.add(grip);
      scene.add(g);
      return g;
    };
    this.a = mkPanel(-1); // slides +
    this.b = mkPanel(1);  // slides -

    // frame: rounded column posts with hazard bands, lintel, threshold
    const post = new THREE.CylinderGeometry(0.15, 0.15, H, 16);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(post, mats.trim);
      p.position.set(
        along === 'x' ? x + s * (half + 0.13) : x,
        H / 2,
        along === 'x' ? z : z + s * (half + 0.13)
      );
      scene.add(p);
      // hazard stripe band wrapping the post base
      const hz = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.5, 16), mats.hazard);
      hz.position.copy(p.position);
      hz.position.y = 0.4;
      scene.add(hz);
    }
    const lintel = new THREE.Mesh(
      along === 'x'
        ? new THREE.BoxGeometry(DOOR_W + 0.78, H - DOOR_H, T + 0.16)
        : new THREE.BoxGeometry(T + 0.16, H - DOOR_H, DOOR_W + 0.78),
      mats.hullDark
    );
    lintel.position.set(x, DOOR_H + (H - DOOR_H) / 2, z);
    scene.add(lintel);
    const thresh = new THREE.Mesh(
      along === 'x'
        ? new THREE.BoxGeometry(DOOR_W + 0.2, 0.045, T + 0.26)
        : new THREE.BoxGeometry(T + 0.26, 0.045, DOOR_W + 0.2),
      mats.steel
    );
    thresh.position.set(x, 0.022, z);
    scene.add(thresh);

    // status light pills above the opening, both faces
    this.indMat = new THREE.MeshStandardMaterial({ color: 0x120612, emissive: 0xff2e86, emissiveIntensity: 1.6 });
    for (const f of [-1, 1]) {
      const ind = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.62, 4, 10), this.indMat);
      ind.rotation[along === 'x' ? 'z' : 'x'] = Math.PI / 2;
      ind.position.set(
        along === 'x' ? x : x + f * ((T + 0.16) / 2 + 0.02),
        DOOR_H + 0.14,
        along === 'x' ? z + f * ((T + 0.16) / 2 + 0.02) : z
      );
      scene.add(ind);
    }

    this.collider = along === 'x'
      ? { minX: x - half, maxX: x + half, minZ: z - T, maxZ: z + T, door: this }
      : { minX: x - T, maxX: x + T, minZ: z - half, maxZ: z + half, door: this };
    colliders.push(this.collider);
    this._place();
  }

  _place() {
    const slide = (DOOR_W / 2) * this.openAmount;
    const q = DOOR_W / 4;
    const c = this.center;
    if (this.along === 'x') {
      this.a.position.set(c.x + q + slide, c.y, c.z);
      this.b.position.set(c.x - q - slide, c.y, c.z);
    } else {
      this.a.position.set(c.x, c.y, c.z + q + slide);
      this.b.position.set(c.x, c.y, c.z - q - slide);
    }
  }

  get blocking() { return this.openAmount < 0.6; }

  update(dt, positions) {
    let near = false;
    for (const p of positions) {
      const dx = p.x - this.center.x, dz = p.z - this.center.z;
      if (dx * dx + dz * dz < 2.4 * 2.4) { near = true; break; }
    }
    if (near !== this._wasNear) {
      this._wasNear = near;
      this.ctx.audio?.door(this.center, near);
    }
    const target = near ? 1 : 0;
    this.openAmount = Math.max(0, Math.min(1, this.openAmount + Math.sign(target - this.openAmount) * 4 * dt));
    this._place();
    const o = this.openAmount;
    this.indMat.emissive.setHSL(0.91 - 0.35 * o, 0.95, 0.55); // shut = hot pink, open = cyan-blue
  }
}

export function buildShip(scene, audio = null, interact = null) {
  const mats = makeMats();
  const colliders = [];
  const doors = [];
  const blinkers = [];
  const animated = [];
  const screens = new ScreenManager();
  const segs = []; // recorded wall pieces, used for panel plating

  function box(w, h, d, x, y, z, mat, collide = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }

  const ctx = { scene, colliders, mats, blinkers, animated, screens, box, audio };

  // shared state for interactive gadget effects
  const fx = { alertT: 0, galleyT: 0, valveT: 0, showerT: 0, vendT: 0, needleBoost: 1 };

  // pooled steam puffs (galley, coolant valve)
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTex('225,232,242'), transparent: true, opacity: 0, depthWrite: false
    }));
    sp.scale.setScalar(0.01);
    scene.add(sp);
    puffs.push({ sp, life: 0, scale0: 0.1 });
  }
  function puff(x, y, z) {
    const p = puffs.find((q) => q.life <= 0);
    if (!p) return;
    p.life = 1;
    p.scale0 = 0.12 + Math.random() * 0.1;
    p.sp.position.set(x + (Math.random() - 0.5) * 0.14, y, z + (Math.random() - 0.5) * 0.14);
  }
  animated.push((t, dt) => {
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.85;
      p.sp.position.y += dt * 0.55;
      const sc = p.scale0 + (1 - p.life) * 0.5;
      p.sp.scale.set(sc, sc, 1);
      p.sp.material.opacity = Math.max(0, p.life) * 0.4;
    }
  });

  // ---------- wall builders ----------
  function solidZ(x, a, b) {
    if (b - a < 0.01) return;
    box(T, H, b - a, x, H / 2, (a + b) / 2, mats.hull);
    segs.push({ axis: 'z', fixed: x, from: a, to: b });
    if (b - a > 0.7) {
      box(T + 0.06, 0.14, b - a, x, 0.07, (a + b) / 2, mats.trim, false);
      box(T + 0.05, 0.1, b - a, x, 2.94, (a + b) / 2, mats.trim, false);
    }
  }
  function solidX(z, a, b) {
    if (b - a < 0.01) return;
    box(b - a, H, T, (a + b) / 2, H / 2, z, mats.hull);
    segs.push({ axis: 'x', fixed: z, from: a, to: b });
    if (b - a > 0.7) {
      box(b - a, 0.14, T + 0.06, (a + b) / 2, 0.07, z, mats.trim, false);
      box(b - a, 0.1, T + 0.05, (a + b) / 2, 2.94, z, mats.trim, false);
    }
  }

  // Wall along z at fixed x, with full-height door gaps and porthole windows.
  function wallZ(x, z0, z1, { doors: doorGaps = [], windows = [] } = {}) {
    const edges = [z0];
    for (const g of [...doorGaps].sort((a, b) => a - b)) edges.push(g - DOOR_W / 2, g + DOOR_W / 2);
    edges.push(z1);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      const wins = windows.filter((w) => w > a + 0.7 && w < b - 0.7).sort((p, q) => p - q);
      let cur = a;
      for (const w of wins) {
        solidZ(x, cur, w - 0.66);
        box(T, 1.08, 1.32, x, 0.54, w, mats.hull);                    // sill (blocks walking)
        box(T, H - 2.36, 1.32, x, (2.36 + H) / 2, w, mats.hull, false); // header
        box(T + 0.1, 0.06, 1.4, x, 1.11, w, mats.trim, false);          // ledge
        P.porthole(ctx, x, 1.72, w, 'x');
        cur = w + 0.66;
      }
      solidZ(x, cur, b);
    }
    for (const g of doorGaps) doors.push(new Door(ctx, x, g, 'z'));
  }

  function wallX(z, x0, x1, { doors: doorGaps = [] } = {}) {
    const edges = [x0];
    for (const g of [...doorGaps].sort((a, b) => a - b)) edges.push(g - DOOR_W / 2, g + DOOR_W / 2);
    edges.push(x1);
    for (let i = 0; i < edges.length; i += 2) solidX(z, edges[i], edges[i + 1]);
    for (const g of doorGaps) doors.push(new Door(ctx, g, z, 'x'));
  }

  // ---------- floor & ceiling ----------
  box(22, 0.2, 54, 0, -0.1, 0, mats.deck, false).position.y = -0.1;
  box(22, 0.2, 54, 0, H + 0.1, 0, new THREE.MeshStandardMaterial({ color: 0x191d28, roughness: 0.7, metalness: 0.35 }), false);

  const overlay = (w, d, x, z, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    scene.add(m);
  };
  overlay(13.6, 12.2, 0, -20.3, mats.deckPlain);                                            // bridge
  overlay(13.6, 11.6, 0, 20, mats.grate);                                                   // machine
  overlay(7.6, 12.6, -6, -6.5, new THREE.MeshStandardMaterial({ color: 0x241a30, roughness: 0.85 })); // cantina
  overlay(7.6, 12.6, -6, 6.5, new THREE.MeshStandardMaterial({ color: 0x171c2c, roughness: 0.8 }));   // dorm
  overlay(7.6, 12.6, 6, -6.5, new THREE.MeshStandardMaterial({ color: 0x291b30, roughness: 0.95 }));  // bedroom carpet
  overlay(7.6, 12.6, 6, 6.5, mats.tile);                                                    // bathroom

  // ---------- structure ----------
  wallZ(-10, -13, 13, { windows: [-11, -2, 6.5] });
  wallZ(10, -13, 13, { windows: [-10.6, -2.4, 6.5] });
  wallZ(-7, -22.8, -14);
  wallZ(7, -22.8, -14);
  wallZ(-7, 14, 26);
  wallZ(7, 14, 26);
  wallX(26, -7, 7);
  wallX(-13, -10, -2); wallX(-13, 2, 10);
  wallX(13, -10, -2);  wallX(13, 2, 10);
  wallX(-14, -7, 7, { doors: [0] });
  wallX(14, -7, 7, { doors: [0] });
  wallZ(-2, -14, 14, { doors: [-7, 7] });
  wallZ(2, -14, 14, { doors: [-7, 7] });
  wallX(0, -10, -2); wallX(0, 2, 10);

  // ---------- angled glass nose ----------
  function noseSegment(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const g = new THREE.Group();
    g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    g.rotation.y = yaw;
    const add = (w, h, d, y, mat, py = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(py, y, 0);
      g.add(m); return m;
    };
    add(len, 1.08, T, 0.54, mats.hull);
    add(len, 0.06, T + 0.14, 1.11, mats.trim);
    add(len - 0.06, 1.28, 0.06, 1.72, mats.glass);
    add(len, H - 2.36, T, 2.68, mats.hull);
    for (const s of [-1, 1]) add(0.16, H, T + 0.08, H / 2, mats.trim, s * (len / 2 - 0.07));
    const nMul = Math.floor(len / 1.5);
    for (let i = 1; i <= nMul; i++) {
      add(0.07, 1.28, T - 0.04, 1.72, mats.trim, -len / 2 + (i * len) / (nMul + 1));
    }
    scene.add(g);
    // stepped colliders along the run
    for (let i = 0; i < 3; i++) {
      const t0 = i / 3, t1 = (i + 1) / 3;
      const x0 = ax + (bx - ax) * t0, x1 = ax + (bx - ax) * t1;
      const z0 = az + (bz - az) * t0, z1 = az + (bz - az) * t1;
      colliders.push({
        minX: Math.min(x0, x1) - 0.28, maxX: Math.max(x0, x1) + 0.28,
        minZ: Math.min(z0, z1) - 0.28, maxZ: Math.max(z0, z1) + 0.28
      });
    }
    return { mid: new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2), yaw, len };
  }
  const noseL = noseSegment(-7, -22.8, -2.2, -26.3);
  const noseC = noseSegment(-2.2, -26.3, 2.2, -26.3);
  const noseR = noseSegment(2.2, -26.3, 7, -22.8);

  // ---------- corridor detail (elongated-octagon cross-section) ----------
  // 45°-ish chamfer panels close off the floor/wall and wall/ceiling corners,
  // interrupted at the side-door bays. Visual only for players; dynColliders
  // keep toy objects (ball/crate) from clipping into the low chamfers.
  const dynColliders = [
    { minX: 1.6, maxX: 2.0, minZ: -13.8, maxZ: 13.8 },
    { minX: -2.0, maxX: -1.6, minZ: -13.8, maxZ: 13.8 }
  ];
  const chamferRuns = [[-13.7, -8.2], [-5.8, 5.8], [8.2, 13.7]];
  for (const [z0, z1] of chamferRuns) {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    for (const s of [-1, 1]) {
      const bot = box(0.06, 0.86, len, s * 1.725, 0.31, zc, mats.hullDark, false);
      bot.rotation.z = -s * 0.7257;
      const top = box(0.06, 0.88, len, s * 1.71, 2.67, zc, mats.hullDark, false);
      top.rotation.z = s * 0.7527;
    }
  }
  // rounded arch rib frames: structural hoop + glowing inner ring, on column feet
  const archGeo = new THREE.TorusGeometry(1.86, 0.09, 12, 30, Math.PI);
  const archGlowGeo = new THREE.TorusGeometry(1.7, 0.026, 8, 30, Math.PI);
  const footGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.06, 12);
  const footGlowGeo = new THREE.CapsuleGeometry(0.026, 0.62, 4, 8);
  for (const rz of [-12, -9, -4.5, -2, 2, 4.5, 9, 12]) {
    const arch = new THREE.Mesh(archGeo, mats.hullDark);
    arch.position.set(0, 1.02, rz);
    const glow = new THREE.Mesh(archGlowGeo, mats.emViolet);
    glow.position.set(0, 1.02, rz);
    scene.add(arch, glow);
    for (const s of [-1, 1]) {
      const foot = new THREE.Mesh(footGeo, mats.hullDark);
      foot.position.set(s * 1.86, 0.53, rz);
      const footGlow = new THREE.Mesh(footGlowGeo, mats.emViolet);
      footGlow.position.set(s * 1.7, 0.7, rz);
      scene.add(foot, footGlow);
    }
  }
  // ceiling light channel
  box(0.1, 0.07, 27.8, -0.38, 2.96, 0, mats.trim, false);
  box(0.1, 0.07, 27.8, 0.38, 2.96, 0, mats.trim, false);
  box(0.62, 0.02, 27.6, 0, 2.985, 0, mats.emWhite, false);
  // floor guide strips (inside the chamfer footprint)
  // port pink, starboard blue
  const guidePort = new THREE.MeshStandardMaterial({ color: 0x120710, emissive: 0xff5ab4, emissiveIntensity: 0.9 });
  const guideStbd = new THREE.MeshStandardMaterial({ color: 0x070a16, emissive: 0x4f8cff, emissiveIntensity: 0.9 });
  box(0.07, 0.012, 27.5, -1.32, 0.02, 0, guidePort, false);
  box(0.07, 0.012, 27.5, 1.32, 0.02, 0, guideStbd, false);
  // pipe runs hug the wall-top corner beneath the upper chamfer
  for (const [px, py, r, mat] of [[-1.85, 2.28, 0.05, mats.copper], [-1.85, 2.16, 0.07, mats.copper], [1.85, 2.28, 0.08, mats.steel]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 27.6, 10), mat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(px, py, 0);
    scene.add(pipe);
  }
  box(0.12, 0.1, 27.6, -1.85, 2.0, 0, mats.housing, false); // conduit tray
  for (let cz = -12; cz <= 12; cz += 4.8) {
    box(0.3, 0.26, 0.12, -1.86, 2.2, cz, mats.trim, false);
    box(0.2, 0.12, 0.12, 1.86, 2.28, cz, mats.trim, false);
  }
  P.intercom(ctx, -1.86, 1.45, -5.5, 'x', 1);
  P.intercom(ctx, 1.86, 1.45, 5.5, 'x', -1);
  P.extinguisher(ctx, 1.78, 12.4, -1);
  P.signPlate(ctx, '◄ BRIDGE  ·  ENGINEERING ►', -1.83, 1.62, 0, 'x', 1, { size: 26 });
  P.signPlate(ctx, '◄ BRIDGE  ·  ENGINEERING ►', 1.83, 1.62, 0, 'x', -1, { size: 26 });

  // hazard thresholds at every door approach
  for (const d of [{ x: 0, z: -14, a: 'x' }, { x: 0, z: 14, a: 'x' }, { x: -2, z: -7, a: 'z' }, { x: -2, z: 7, a: 'z' }, { x: 2, z: -7, a: 'z' }, { x: 2, z: 7, a: 'z' }]) {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.a === 'x' ? 2.3 : 0.55, d.a === 'x' ? 0.55 : 2.3), mats.hazard);
      m.rotation.x = -Math.PI / 2;
      m.position.set(d.x + (d.a === 'z' ? s * 0.62 : 0), 0.022, d.z + (d.a === 'x' ? s * 0.62 : 0));
      scene.add(m);
    }
  }

  // door signage
  P.signPlate(ctx, 'BRIDGE', 0, 2.62, -13.72, 'z', 1);
  P.signPlate(ctx, 'CORRIDOR', 0, 2.62, -14.28, 'z', -1);
  P.signPlate(ctx, 'ENGINEERING', 0, 2.62, 13.72, 'z', -1);
  P.signPlate(ctx, 'CORRIDOR', 0, 2.62, 14.28, 'z', 1);
  P.signPlate(ctx, 'CANTINA', -1.72, 2.62, -7, 'x', 1);
  P.signPlate(ctx, 'CORRIDOR', -2.28, 2.62, -7, 'x', -1);
  P.signPlate(ctx, 'DORM A', -1.72, 2.62, 7, 'x', 1);
  P.signPlate(ctx, 'CORRIDOR', -2.28, 2.62, 7, 'x', -1);
  P.signPlate(ctx, 'CABIN 01', 1.72, 2.62, -7, 'x', -1);
  P.signPlate(ctx, 'CORRIDOR', 2.28, 2.62, -7, 'x', 1);
  P.signPlate(ctx, 'WASHROOM', 1.72, 2.62, 7, 'x', -1);
  P.signPlate(ctx, 'CORRIDOR', 2.28, 2.62, 7, 'x', 1);

  // ---------- bridge ----------
  function consoleSegment(seg, screenDefs) {
    const inward = new THREE.Vector3(Math.sin(seg.yaw), 0, Math.cos(seg.yaw));
    const g = new THREE.Group();
    g.position.copy(seg.mid).addScaledVector(inward, 0.68);
    g.rotation.y = seg.yaw;
    const L = seg.len * 0.86;
    const base = new THREE.Mesh(new THREE.BoxGeometry(L, 0.92, 0.85), mats.housing);
    base.position.y = 0.46;
    const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.95), mats.hullDark);
    top.position.y = 0.95;
    const kick = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.14, 0.7), mats.trim);
    kick.position.y = 0.07;
    g.add(base, top, kick);
    // rounded end caps
    for (const s of [-1, 1]) {
      const capBase = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.92, 18, 1, false, 0, Math.PI), mats.housing);
      capBase.position.set(s * L / 2, 0.46, 0);
      capBase.rotation.y = s > 0 ? 0 : Math.PI;
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.06, 18, 1, false, 0, Math.PI), mats.hullDark);
      capTop.position.set(s * L / 2, 0.95, 0);
      capTop.rotation.y = capBase.rotation.y;
      g.add(capBase, capTop);
    }
    for (const [tex, w, h, ox] of screenDefs) {
      const sm = P.screenMesh(ctx, w, h, tex, 1.4);
      sm.position.set(ox, 1.32, -0.18);
      sm.rotation.x = -0.42;
      g.add(sm);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.07), mats.housing);
      back.position.set(ox, 1.31, -0.22);
      back.rotation.x = -0.42;
      g.add(back);
    }
    // button rows on the desk
    for (let i = 0; i < Math.floor(L / 0.5); i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), [mats.emViolet, mats.emMagenta, mats.emBlue][i % 3]);
      b.position.set(-L / 2 + 0.4 + i * 0.5, 0.985, 0.25);
      g.add(b);
    }
    scene.add(g);
    // collider approximating the oriented box
    const cos = Math.abs(Math.cos(seg.yaw)), sin = Math.abs(Math.sin(seg.yaw));
    const hx = (L / 2) * cos + 0.5 * sin, hz = (L / 2) * sin + 0.5 * cos;
    colliders.push({ minX: g.position.x - hx, maxX: g.position.x + hx, minZ: g.position.z - hz, maxZ: g.position.z + hz });
  }
  const attTex = screens.add(320, 160, 0.12, drawAttitude);
  const radarTex = screens.add(256, 192, 0.1, drawRadar);
  const telTexL = screens.add(320, 192, 0.35, drawTelemetry);
  const telTexR = screens.add(320, 192, 0.42, drawTelemetry);
  consoleSegment(noseC, [[attTex, 1.55, 0.6, -0.95], [radarTex, 1.25, 0.6, 0.95]]);
  consoleSegment(noseL, [[telTexL, 1.7, 0.55, 0]]);
  consoleSegment(noseR, [[telTexR, 1.7, 0.55, 0]]);

  P.chair(ctx, -1.15, -22.3, 0, 0x323a5e);
  P.chair(ctx, 1.15, -22.3, 0, 0x323a5e);

  // center pedestal (rounded column) + holo display
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.9, 22), mats.hullDark);
  pedestal.position.set(0, 0.45, -20.9);
  const pedTop = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 22), mats.trim);
  pedTop.position.set(0, 0.92, -20.9);
  scene.add(pedestal, pedTop);
  colliders.push({ minX: -0.44, maxX: 0.44, minZ: -21.34, maxZ: -20.46 });
  for (const s of [-1, 1]) {
    const lever = box(0.05, 0.24, 0.05, s * 0.14, 1.04, -21.05, mats.accent, false);
    lever.rotation.x = -0.5;
  }
  const holoBase = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.05, 18), mats.housing);
  holoBase.position.set(0, 0.965, -20.75);
  scene.add(holoBase);
  const holoRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 8, 24), mats.emViolet);
  holoRing.rotation.x = Math.PI / 2;
  holoRing.position.set(0, 1.0, -20.75);
  scene.add(holoRing);
  const holoCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.06, 0.6, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })
  );
  holoCone.position.set(0, 1.32, -20.75);
  scene.add(holoCone);
  const holo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 1),
    new THREE.MeshBasicMaterial({ color: 0x5aa8ff, wireframe: true, transparent: true, opacity: 0.75 })
  );
  holo.position.set(0, 1.62, -20.75);
  scene.add(holo);
  animated.push((t, dt) => {
    holo.rotation.y += dt * 0.9;
    holo.position.y = 1.62 + Math.sin(t * 1.4) * 0.045;
  });

  // pressable button bank on the center console
  for (let i = 0; i < 8; i++) {
    const bMat = new THREE.MeshStandardMaterial({ color: 0x14101f, emissive: 0x8a5cff, emissiveIntensity: 0.25 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.05, 12), bMat);
    b.position.set(-0.84 + i * 0.24, 1.0, -25.3);
    scene.add(b);
    const state = { on: false };
    interact?.add(`btn${i}`, 'PRESS', [b], (local, s) => {
      state.on = local ? !state.on : !!s;
      bMat.emissive.set(state.on ? 0xff5ab4 : 0x8a5cff);
      bMat.emissiveIntensity = state.on ? 1.9 : 0.25;
      b.position.y = state.on ? 0.988 : 1.0;
      audio?.click(b.position);
      return state.on ? 1 : 0;
    });
  }

  // the big red one — ship-wide red alert
  const alarmBase = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.03, 14), mats.steel);
  alarmBase.position.set(0.2, 0.945, -21.05);
  const alarmMat = new THREE.MeshStandardMaterial({ color: 0x7a1410, emissive: 0xff2418, emissiveIntensity: 0.45, roughness: 0.35 });
  const alarmBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 14), alarmMat);
  alarmBtn.position.set(0.2, 0.98, -21.05);
  scene.add(alarmBase, alarmBtn);
  interact?.add('alarm', 'RED ALERT', [alarmBtn, alarmBase], () => {
    if (fx.alertT > 0) return;
    fx.alertT = 4.6;
    audio?.klaxon();
  });

  // overhead switch panel with blinkenlights
  const overhead = box(3.2, 0.44, 0.12, 0, 2.56, -24.9, mats.housing, false);
  overhead.rotation.x = 0.5;
  for (let i = 0; i < 8; i++) {
    P.blinker(ctx, -1.4 + i * 0.4, 2.52, -24.76, [0xb08aff, 0xff6ec7, 0x5a8aff][i % 3], 0.7 + (i % 5) * 0.5, 0.05);
  }
  audio?.registerBeeps(new THREE.Vector3(0, 1.4, -24.5));

  // ---------- machine room ----------
  const reactor = new THREE.Group();
  reactor.position.set(0, 0, 21);
  const rAdd = (mesh, y) => { mesh.position.y = y; reactor.add(mesh); return mesh; };
  rAdd(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.5, 24), mats.hullDark), 0.25);
  rAdd(new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 0.12, 24), mats.trim), 0.56);
  const glassCol = rAdd(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.9, 24, 1, true), mats.glass), 1.62);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x150a24, emissive: 0xb44aff, emissiveIntensity: 1.6 });
  rAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.85, 16), coreMat), 1.62);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x565e6d, metalness: 0.85, roughness: 0.3 });
  const rings = [];
  for (const [y, dir] of [[1.05, 1], [1.62, -1], [2.2, 1]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.07, 10, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    rings.push({ ring, dir });
    rAdd(ring, y);
  }
  rAdd(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.55, 24), mats.hullDark), 2.85);
  rAdd(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 0.35, 12), mats.trim), 3.2);
  scene.add(reactor);
  colliders.push({ minX: -2.0, maxX: 2.0, minZ: 19.0, maxZ: 23.0 });
  audio?.attachHum(reactor);
  animated.push((t, dt) => {
    coreMat.emissiveIntensity = 1.6 + 0.7 * Math.sin(t * 2.3);
    for (const { ring, dir } of rings) ring.rotation.z += dt * 0.4 * dir;
  });

  // octagonal safety railing with a gap facing the door
  const railPosts = [];
  for (let i = 0; i < 8; i++) {
    const a = -3 * Math.PI / 8 + i * Math.PI / 4;
    const px = Math.cos(a) * 3.0, pz = 21 + Math.sin(a) * 3.0;
    railPosts.push([px, pz]);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), mats.steel);
    post.position.set(px, 0.52, pz);
    scene.add(post);
  }
  // smooth circular rails through the posts (arc leaves the door gap open)
  for (const ry of [0.55, 0.95]) {
    const railGeo = new THREE.TorusGeometry(3.0, 0.028, 8, 56, Math.PI * 7 / 4);
    railGeo.rotateZ(-3 * Math.PI / 8);
    railGeo.rotateX(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, mats.steel);
    rail.position.set(0, ry, 21);
    scene.add(rail);
  }
  for (let i = 0; i < 7; i++) {
    const [ax, az] = railPosts[i], [bx, bz] = railPosts[i + 1];
    colliders.push({
      minX: Math.min(ax, bx) - 0.06, maxX: Math.max(ax, bx) + 0.06,
      minZ: Math.min(az, bz) - 0.06, maxZ: Math.max(az, bz) + 0.06
    });
  }

  // cabinets, gauges, tanks, pipes, crates
  const needles = [];
  for (const cz of [17.5, 20.5]) {
    box(0.5, 2.2, 1.5, -6.6, 1.1, cz, mats.hullDark);
    box(0.02, 2.0, 1.3, -6.33, 1.1, cz, mats.trim, false);
    for (let v = 0; v < 4; v++) box(0.02, 0.04, 1.1, -6.32, 0.5 + v * 0.16, cz, mats.housing, false);
    const gauge = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 18), mats.white);
    face.rotation.z = Math.PI / 2;
    gauge.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.012), mats.accent);
    needle.position.set(0.025, 0.045, 0);
    gauge.add(needle);
    gauge.position.set(-6.31, 1.85, cz);
    scene.add(gauge);
    needles.push({ g: gauge, sp: 0.7 + Math.random() });
    P.blinker(ctx, -6.31, 1.55, cz + 0.45, 0xb08aff, 1.5 + Math.random());
    P.blinker(ctx, -6.31, 1.55, cz + 0.3, 0xff6ec7, 2.5 + Math.random());
  }
  animated.push((t, dt) => {
    const boost = fx.needleBoost;
    for (const n of needles) n.g.rotation.x = Math.sin(t * n.sp * boost) * 0.8 * Math.min(boost, 1.5);
    fx.needleBoost = 1 + (fx.needleBoost - 1) * Math.exp(-dt * 0.8);
  });
  // reactor output screen
  const reacTex = screens.add(384, 192, 0.15, drawReactorPanel);
  const reacScreen = P.screenMesh(ctx, 1.35, 0.68, reacTex, 1.4);
  reacScreen.position.set(-6.32, 1.55, 23.5);
  reacScreen.rotation.y = Math.PI / 2;
  scene.add(reacScreen);
  box(0.5, 1.2, 1.6, -6.6, 1.1, 23.5, mats.hullDark);

  const tankMat = new THREE.MeshStandardMaterial({ color: 0x565e78, metalness: 0.75, roughness: 0.3 });
  for (const tz of [18.5, 21.5]) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.1, 6, 16), tankMat);
    tank.position.set(6.1, 1.15, tz);
    scene.add(tank);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.2, 16), mats.accent);
    band.position.set(6.1, 1.15, tz);
    scene.add(band);
    colliders.push({ minX: 5.55, maxX: 6.65, minZ: tz - 0.55, maxZ: tz + 0.55 });
    box(0.7, 0.07, 0.07, 6.55, 1.7, tz, mats.steel, false);
    P.pipeRun(ctx, [[6.1, 1.95, tz], [6.1, 2.7, tz], [6.8, 2.7, tz]], 0.055, mats.steel);
  }
  P.pipeRun(ctx, [[0, 2.95, 21], [0, 2.72, 17.5], [0, 2.72, 14.5]], 0.1, mats.steel);
  P.pipeRun(ctx, [[0.9, 2.9, 21], [4.4, 2.78, 21], [6.8, 2.78, 21]], 0.09, mats.copper);
  P.pipeRun(ctx, [[-0.9, 2.9, 21], [-4.4, 2.78, 21], [-6.8, 2.78, 21]], 0.09, mats.copper);
  P.pipeRun(ctx, [[-6.72, 0, 24.5], [-6.72, 2.9, 24.5]], 0.09, mats.copper);
  const valveGroup = P.valveWheel(ctx, -6.5, 1.5, 24.5, Math.PI / 2, mats.steel);
  interact?.add('valve', 'PURGE COOLANT', [valveGroup], () => {
    if (fx.valveT > 0) return;
    fx.valveT = 1.7;
    fx.needleBoost = 2.6;
    audio?.hiss(new THREE.Vector3(-6.6, 2.2, 24.5), 1.9, 0.3);
  });
  animated.push((t, dt) => {
    if (fx.valveT > 0) {
      fx.valveT -= dt;
      valveGroup.rotation.z += dt * 7;
      if (Math.random() < dt * 16) puff(-6.65, 2.1 + Math.random() * 0.5, 24.5);
    }
  });

  box(0.9, 0.9, 0.9, 4.6, 0.45, 24.9, mats.hullDark);
  box(0.92, 0.02, 0.24, 4.6, 0.91, 24.9, mats.hazard, false);
  const crate2 = box(0.55, 0.55, 0.55, 4.5, 1.18, 24.8, mats.hullDark, false);
  crate2.rotation.y = 0.4;
  box(0.7, 0.5, 0.7, 3.3, 0.25, 25.2, mats.trim);

  // aft vent + warning dome
  box(2.2, 1.5, 0.12, -3.2, 1.6, 25.85, mats.housing, false);
  for (let v = 0; v < 5; v++) box(2.0, 0.07, 0.06, -3.2, 1.1 + v * 0.25, 25.8, mats.trim, false);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x24061a, emissive: 0xff3a9c, emissiveIntensity: 0.3 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.set(0, 2.6, 14.4);
  scene.add(dome);
  const domeBlink = { mat: domeMat, speed: 4.5, phase: 0 };
  blinkers.push(domeBlink);
  const hazWalk = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.55), mats.hazard);
  hazWalk.rotation.x = -Math.PI / 2;
  hazWalk.position.set(0, 0.024, 16.6);
  scene.add(hazWalk);

  // ---------- cantina ----------
  P.roundTable(ctx, -6.3, -9.7);
  for (const a of [0.4, 1.9, 3.6, 5.1]) P.stool(ctx, -6.3 + Math.cos(a) * 1.25, -9.7 + Math.sin(a) * 1.25);
  P.roundTable(ctx, -5.4, -4.4);
  for (const a of [0.1, 2.2, 4.3]) P.stool(ctx, -5.4 + Math.cos(a) * 1.25, -4.4 + Math.sin(a) * 1.25);

  box(0.95, 1.05, 4.4, -8.95, 0.52, -6.5, mats.hullDark);        // bar
  box(1.1, 0.05, 4.6, -8.95, 1.07, -6.5, mats.steel, false);
  box(0.9, 0.12, 4.4, -8.95, 0.06, -6.5, mats.trim, false);
  box(0.02, 0.06, 4.3, -8.45, 0.9, -6.5, mats.emViolet, false);
  // rounded bar ends
  for (const s of [-1, 1]) {
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.475, 1.05, 18, 1, false, 0, Math.PI), mats.hullDark);
    capBody.position.set(-8.95, 0.52, -6.5 + s * 2.2);
    capBody.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 18, 1, false, 0, Math.PI), mats.steel);
    capTop.position.set(-8.95, 1.07, -6.5 + s * 2.2);
    capTop.rotation.y = capBody.rotation.y;
    scene.add(capBody, capTop);
    colliders.push({ minX: -9.43, maxX: -8.47, minZ: -6.5 + s * 2.2 - 0.48, maxZ: -6.5 + s * 2.2 + 0.48 });
  }
  const bottleMats = [0xff5ab4, 0x7a5aff, 0xff8ad8, 0x5a8aff, 0xc88aff].map(
    (c) => new THREE.MeshStandardMaterial({ color: 0x101418, emissive: c, emissiveIntensity: 0.5, roughness: 0.3 })
  );
  const shelfGlow = new THREE.MeshStandardMaterial({ color: 0x140a12, emissive: 0xff8ad0, emissiveIntensity: 0.6 });
  for (const sy of [1.5, 2.05]) {
    box(0.26, 0.05, 3.6, -9.7, sy, -6.5, mats.steel, false);
    box(0.02, 0.02, 3.5, -9.6, sy - 0.035, -6.5, shelfGlow, false);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.26, 8), bottleMats[(i + (sy > 2 ? 2 : 0)) % 5]);
      b.position.set(-9.7, sy + 0.16, -8.1 + i * 0.4);
      scene.add(b);
    }
  }
  const cafMachine = box(0.34, 0.42, 0.3, -8.95, 1.3, -4.85, mats.housing, false);
  box(0.1, 0.1, 0.1, -8.95, 1.14, -4.68, mats.steel, false);
  P.blinker(ctx, -8.83, 1.4, -4.85, 0xb08aff, 1.1);

  // AUTO-GALLEY lever: pull it and the machine rattles, steams, and serves
  const leverGroup = new THREE.Group();
  const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.14), mats.trim);
  const leverArm = new THREE.Group();
  const armRod = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.035), mats.steel);
  armRod.position.y = 0.15;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mats.accent);
  knob.position.y = 0.3;
  leverArm.add(armRod, knob);
  leverArm.rotation.z = 0.5;
  leverGroup.add(leverBase, leverArm);
  leverGroup.position.set(-8.95, 1.1, -5.35);
  scene.add(leverGroup);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 10), mats.white);
  cup.position.set(-8.9, 1.15, -6.0);
  cup.visible = false;
  scene.add(cup);
  interact?.add('galley', 'START AUTO-GALLEY', [leverGroup], () => {
    if (fx.galleyT > 0) return;
    fx.galleyT = 3.2;
    fx.cupServed = false;
    audio?.lever(leverGroup.position);
    audio?.hiss(cafMachine.position, 2.2, 0.2);
  });
  animated.push((t, dt) => {
    if (fx.galleyT > 0) {
      fx.galleyT -= dt;
      const ph = 3.2 - fx.galleyT;
      if (ph < 0.35) leverArm.rotation.z = 0.5 - (ph / 0.35) * 1.05;            // pull
      else if (fx.galleyT < 0.4) leverArm.rotation.z = 0.5 - (fx.galleyT / 0.4) * 1.05; // spring back
      else leverArm.rotation.z = -0.55;                                          // held
      cafMachine.position.x = -8.95 + (fx.galleyT > 0.5 ? Math.sin(t * 40) * 0.006 : 0);
      if (fx.galleyT > 0.6 && Math.random() < dt * 10) puff(-8.95, 1.58, -4.85);
      if (!fx.cupServed && fx.galleyT < 0.7) {
        fx.cupServed = true;
        cup.visible = true;
        audio?.ding(cup.position);
      }
    }
  });
  for (const gz of [-5.7, -6.6, -7.4]) {
    const glassCup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.11, 8), mats.white);
    glassCup.position.set(-8.9, 1.15, gz);
    scene.add(glassCup);
  }
  const menuTex = screens.add(320, 224, 0.5, drawMenu);
  const menuScreen = P.screenMesh(ctx, 1.7, 0.98, menuTex, 1.35);
  menuScreen.position.set(-5.6, 1.9, -12.82);
  scene.add(menuScreen);
  box(1.85, 1.12, 0.06, -5.6, 1.9, -12.87, mats.housing, false);
  // vending machine
  const vendBody = box(0.6, 1.9, 0.85, -2.45, 0.95, -11.7, mats.hullDark);
  const vendPanel = box(0.02, 1.0, 0.6, -2.76, 1.3, -11.7, mats.emBlue, false);
  box(0.02, 0.16, 0.45, -2.76, 0.35, -11.7, mats.trim, false);
  P.blinker(ctx, -2.76, 1.9, -11.5, 0xff6ec7, 2.2);
  const canMat = new THREE.MeshStandardMaterial({ color: 0x0a1424, emissive: 0x5ab0ff, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.4 });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), canMat);
  can.position.set(-2.98, 0.07, -11.55);
  can.visible = false;
  scene.add(can);
  interact?.add('vend', 'DISPENSE', [vendBody, vendPanel], () => {
    fx.vendT = 25;
    audio?.click(vendBody.position);
    setTimeout(() => { can.visible = true; audio?.ding(can.position); }, 550);
  });
  animated.push((t, dt) => {
    if (fx.vendT > 0) {
      fx.vendT -= dt;
      if (fx.vendT <= 0) can.visible = false;
    }
  });
  // pendant lamps
  for (const [px, pz] of [[-6.3, -9.7], [-5.4, -4.4]]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), mats.trim);
    cord.position.set(px, 2.68, pz);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.3, 0.24, 14, 1, true), mats.accent);
    shade.position.set(px, 2.28, pz);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.emPink);
    bulb.position.set(px, 2.2, pz);
    scene.add(cord, shade, bulb);
  }

  // ---------- dorm ----------
  P.bunk(ctx, -8.55, 0.72, 0);
  P.bunk(ctx, -8.55, 12.32, Math.PI);
  P.locker(ctx, -2.48, 3.4, -Math.PI / 2, 4);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x3c3452, roughness: 0.85 });
  box(1.7, 0.09, 0.42, -6, 0.42, 5.5, benchMat);
  for (const s of [-1, 1]) box(0.08, 0.4, 0.36, -6 + s * 0.72, 0.2, 5.5, mats.trim, false);
  const duffel = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 5, 10), new THREE.MeshStandardMaterial({ color: 0x474162, roughness: 0.95 }));
  duffel.rotation.z = Math.PI / 2;
  duffel.rotation.y = 0.5;
  duffel.position.set(-4.2, 0.18, 1.4);
  scene.add(duffel);
  box(0.5, 0.04, 0.24, -2.4, 1.4, 10, mats.steel, false);
  P.plant(ctx, -2.4, 1.42, 10);
  // light switch beside the dorm door
  const dormSwPlate = box(0.03, 0.16, 0.1, -2.17, 1.35, 5.7, mats.white, false);
  const dormSwNub = box(0.035, 0.05, 0.05, -2.18, 1.38, 5.7, mats.steel, false);

  // ---------- bedroom (captain's cabin) ----------
  box(1.65, 0.32, 2.15, 8.9, 0.16, -11.75, mats.hullDark);
  box(1.65, 0.85, 0.08, 8.9, 0.75, -12.78, mats.hullDark, false);
  box(1.5, 0.16, 1.95, 8.9, 0.4, -11.75, mats.bedding, false);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.3), new THREE.MeshStandardMaterial({ color: 0x53356e, roughness: 0.95 }));
  blanket.position.set(8.9, 0.49, -11.35);
  scene.add(blanket);
  for (const px of [8.55, 9.25]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.4), mats.pillow);
    pil.position.set(px, 0.53, -12.42);
    pil.rotation.y = (px - 8.9) * 0.2;
    scene.add(pil);
  }
  box(0.48, 0.55, 0.48, 7.6, 0.27, -12.5, mats.hullDark);
  const lampMat = mats.emPink.clone();
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6), mats.steel);
  lampStem.position.set(7.6, 0.67, -12.5);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.13, 12, 1, true), lampMat);
  lampShade.position.set(7.6, 0.82, -12.5);
  scene.add(lampStem, lampShade);
  // desk against the outer wall + chair
  box(0.62, 0.05, 1.5, 9.52, 0.78, -4.2, mats.hullDark);
  for (const s of [-1, 1]) box(0.58, 0.76, 0.05, 9.52, 0.38, -4.2 + s * 0.72, mats.trim, false);
  const chartTex = screens.add(320, 192, 0.2, drawStarchart);
  const chartScreen = P.screenMesh(ctx, 0.95, 0.58, chartTex, 1.35);
  chartScreen.position.set(9.82, 1.5, -4.2);
  chartScreen.rotation.y = -Math.PI / 2;
  scene.add(chartScreen);
  box(0.06, 0.72, 1.1, 9.86, 1.5, -4.2, mats.housing, false);
  P.chair(ctx, 8.75, -4.2, -Math.PI / 2, 0x443a5c);
  // wardrobe, rug, shelf
  box(0.55, 2.0, 1.15, 2.45, 1.0, -11.9, mats.hullDark);
  box(0.02, 1.8, 0.02, 2.74, 1.0, -11.9, mats.trim, false);
  for (const hz of [-11.62, -12.18]) box(0.03, 0.14, 0.03, 2.74, 1.05, hz, mats.steel, false);
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.015, 24), new THREE.MeshStandardMaterial({ color: 0x35244a, roughness: 1 }));
  rug.position.set(6.2, 0.022, -7.5);
  scene.add(rug);
  box(1.3, 0.05, 0.26, 6.5, 1.95, -0.34, mats.steel, false);
  const bookCols = [0xb85a9a, 0x4a6a9c, 0x8a6ac8];
  bookCols.forEach((c, i) => {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.18), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    bk.position.set(6.15 + i * 0.09, 2.11, -0.34);
    bk.rotation.z = i === 2 ? -0.18 : 0;
    scene.add(bk);
  });
  P.plant(ctx, 6.95, 1.98, -0.34);

  // ---------- bathroom ----------
  box(1.7, 0.14, 1.7, 8.95, 0.07, 11.95, mats.white, false);      // shower tray
  box(0.03, 1.9, 1.7, 8.1, 1.09, 11.95, mats.glass);              // glass side
  box(0.8, 1.9, 0.03, 8.5, 1.09, 11.1, mats.glass);               // glass front (entry gap right)
  for (const [gx, gz] of [[8.1, 11.1], [8.1, 12.8], [8.9, 11.1]]) {
    const postC = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 8), mats.chrome);
    postC.position.set(gx, 1.04, gz);
    scene.add(postC);
  }
  P.pipeRun(ctx, [[9.35, 2.5, 12.83], [9.35, 2.5, 12.4], [9.35, 2.28, 12.4]], 0.025, mats.chrome);
  const showerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 0.07, 12), mats.chrome);
  showerHead.position.set(9.35, 2.24, 12.4);
  scene.add(showerHead);
  const showerCtl = box(0.18, 0.3, 0.03, 9.4, 1.4, 12.8, mats.steel, false);
  P.blinker(ctx, 9.4, 1.58, 12.78, 0x5ab0ff, 0.8, 0.03);
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x9fd4ff, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.32, 1.85, 12, 1, true), waterMat);
  water.position.set(9.35, 1.22, 12.35);
  water.visible = false;
  scene.add(water);
  interact?.add('shower', 'SHOWER', [showerCtl], () => {
    if (fx.showerT <= 0) audio?.hiss(water.position, 5, 0.26);
    fx.showerT = 5;
  });
  animated.push((t, dt) => {
    if (fx.showerT > 0) {
      fx.showerT -= dt;
      water.visible = true;
      waterMat.opacity = 0.1 + 0.045 * Math.sin(t * 30);
    } else {
      water.visible = false;
    }
  });
  // sink + mirror
  box(1.9, 0.8, 0.55, 4.2, 0.42, 12.52, mats.hullDark);
  box(2.0, 0.07, 0.62, 4.2, 0.86, 12.5, mats.white, false);
  for (const [bw, bd, bx, bz] of [[0.5, 0.04, 4.2, 12.32], [0.5, 0.04, 4.2, 12.66], [0.04, 0.38, 3.96, 12.49], [0.04, 0.38, 4.44, 12.49]]) {
    box(bw, 0.05, bd, bx, 0.91, bz, mats.white, false);
  }
  P.pipeRun(ctx, [[4.2, 0.9, 12.72], [4.2, 1.06, 12.72], [4.2, 1.06, 12.56]], 0.02, mats.chrome);
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85), mats.mirror);
  mirror.position.set(4.2, 1.78, 12.83);
  mirror.rotation.y = Math.PI;
  scene.add(mirror);
  box(1.4, 0.05, 0.04, 4.2, 2.28, 12.82, mats.emWhite, false);
  // toilet
  box(0.24, 0.5, 0.55, 9.72, 0.75, 2.6, mats.white);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.36, 14), mats.white);
  bowl.position.set(9.33, 0.28, 2.6);
  scene.add(bowl);
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 18), mats.white);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(9.33, 0.47, 2.6);
  scene.add(seat);
  box(0.08, 0.03, 0.12, 9.72, 1.02, 2.45, mats.chrome, false);
  colliders.push({ minX: 9.0, maxX: 10, minZ: 2.2, maxZ: 3.0 });
  // towel rail
  P.pipeRun(ctx, [[2.2, 1.35, 4.25], [2.2, 1.35, 4.95]], 0.015, mats.chrome);
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.45), new THREE.MeshStandardMaterial({ color: 0x6a7ac8, roughness: 0.95 }));
  towel.position.set(2.22, 1.05, 4.6);
  scene.add(towel);

  // ---------- panel plating (instanced) ----------
  const panels = [];
  const rows = [[0.85, 1.26], [2.2, 1.28]];
  for (const seg of segs) {
    const len = seg.to - seg.from;
    if (len < 0.7) continue;
    const n = Math.max(1, Math.round(len / 1.9));
    const panW = (len - 0.07 * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      const c = seg.from + 0.07 * (i + 1) + panW * (i + 0.5);
      for (const [ry, rh] of rows) {
        for (const side of [-1, 1]) {
          panels.push({ seg, c, ry, rh, panW, side });
        }
      }
    }
  }
  // unit rounded-rect plate, scaled per instance (corners stay soft)
  const panelShape = new THREE.Shape();
  {
    const e = 0.5, r = 0.09;
    panelShape.moveTo(-e + r, -e);
    panelShape.lineTo(e - r, -e); panelShape.quadraticCurveTo(e, -e, e, -e + r);
    panelShape.lineTo(e, e - r); panelShape.quadraticCurveTo(e, e, e - r, e);
    panelShape.lineTo(-e + r, e); panelShape.quadraticCurveTo(-e, e, -e, e - r);
    panelShape.lineTo(-e, -e + r); panelShape.quadraticCurveTo(-e, -e, -e + r, -e);
  }
  const panelGeo = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.022, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.009,
    bevelSegments: 2, curveSegments: 5
  });
  panelGeo.translate(0, 0, -0.016);
  const inst = new THREE.InstancedMesh(panelGeo, mats.panel, panels.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  panels.forEach((p, i) => {
    if (p.seg.axis === 'z') {
      v.set(p.seg.fixed + p.side * (T / 2 + 0.017), p.ry, p.c);
      q.setFromAxisAngle(yAxis, Math.PI / 2);
    } else {
      v.set(p.c, p.ry, p.seg.fixed + p.side * (T / 2 + 0.017));
      q.setFromAxisAngle(yAxis, 0);
    }
    sc.set(p.panW, p.rh, 1);
    m4.compose(v, q, sc);
    inst.setMatrixAt(i, m4);
    const r = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = (r - Math.floor(r));
    if (jitter > 0.93) col.setHSL(0.74, 0.35, 0.2);
    else col.setHSL(0.69, 0.09, 0.14 + (jitter - 0.5) * 0.05);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);

  // ---------- wall light slots ----------
  // Vertical glowing pills recessed into the plating, Death-Star style:
  // mostly cool lavender-white with the odd blue or pink one.
  const slotGeo = new THREE.CapsuleGeometry(0.042, 1.35, 4, 10);
  const slotMats = [
    new THREE.MeshStandardMaterial({ color: 0x101322, emissive: 0xcfd4ff, emissiveIntensity: 1.5 }),
    new THREE.MeshStandardMaterial({ color: 0x070a16, emissive: 0x5a8aff, emissiveIntensity: 1.6 }),
    new THREE.MeshStandardMaterial({ color: 0x120710, emissive: 0xff6ec7, emissiveIntensity: 1.6 })
  ];
  // wall-mounted furniture the slots must not pierce
  const slotAvoid = [
    { minX: -7.4, maxX: -4.4, minZ: -13.4, maxZ: -12.3 }, // galley menu screen
    { minX: -7.2, maxX: -5.8, minZ: 16.5, maxZ: 24.6 },   // breaker cabinets + reactor screen
    { minX: -4.6, maxX: -1.9, minZ: 25.4, maxZ: 26.3 },   // aft vent
    { minX: 9.2, maxX: 10.3, minZ: -5.2, maxZ: -3.4 },    // star-chart desk
    { minX: -9.9, maxX: -7.2, minZ: -0.2, maxZ: 1.5 },    // bunk headboard A
    { minX: -9.9, maxX: -7.2, minZ: 11.5, maxZ: 13.3 }    // bunk headboard B
  ];
  const slotSets = [[], [], []];
  for (const seg of segs) {
    if (seg.axis === 'z' && Math.abs(seg.fixed) === 2) continue; // corridor has its arches
    const len = seg.to - seg.from;
    if (len < 2.2) continue;
    const n = Math.floor(len / 2.4);
    for (let i = 0; i < n; i++) {
      const c = seg.from + (len * (i + 0.5)) / n;
      const wx = seg.axis === 'z' ? seg.fixed : c;
      const wz = seg.axis === 'z' ? c : seg.fixed;
      if (slotAvoid.some((a) => wx > a.minX && wx < a.maxX && wz > a.minZ && wz < a.maxZ)) continue;
      const hash = Math.abs(Math.sin(wx * 37.7 + wz * 17.3) * 43758.5453) % 1;
      const which = hash > 0.82 ? (hash > 0.91 ? 2 : 1) : 0;
      for (const side of [-1, 1]) slotSets[which].push({ seg, c, side });
    }
  }
  for (const [k, set] of slotSets.entries()) {
    if (!set.length) continue;
    const im = new THREE.InstancedMesh(slotGeo, slotMats[k], set.length);
    set.forEach((p, i) => {
      if (p.seg.axis === 'z') v.set(p.seg.fixed + p.side * (T / 2 + 0.045), 1.52, p.c);
      else v.set(p.c, 1.52, p.seg.fixed + p.side * (T / 2 + 0.045));
      q.identity();
      sc.set(1, 1, 1);
      m4.compose(v, q, sc);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }

  // ---------- lighting ----------
  scene.add(new THREE.AmbientLight(0x8a86c8, 0.4));
  scene.add(new THREE.HemisphereLight(0xa8a8e8, 0x201a30, 0.55));

  const pl = (x, y, z, color, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z);
    l.userData.baseColor = new THREE.Color(color);
    l.userData.baseIntensity = intensity;
    scene.add(l);
    return l;
  };
  const bridgeLight = pl(0, 2.7, -19, 0x7a9bff, 26, 18);
  pl(0, 1.6, -23.4, 0x4a8aff, 7, 8);
  const machineLight = pl(0, 2.7, 21, 0xa06bff, 26, 18);
  const coreLight = pl(0, 1.6, 21, 0xb44aff, 12, 9);
  const cantinaLight = pl(-5.8, 2.1, -7, 0xff7ac8, 20, 13);
  const dormLight = pl(-6, 2.7, 6.5, 0x9aaaff, 20, 14);
  const bedroomLight = pl(6, 2.7, -6.5, 0xc79aff, 17, 14);
  const bedsideLight = pl(7.6, 1.0, -12.3, 0xff6ea8, 5, 4);
  const bathLight = pl(6, 2.75, 6.5, 0xcfe0ff, 24, 14);
  const corA = pl(0, 2.8, -8, 0x8f8fff, 12, 11);
  const corB = pl(0, 2.8, 8, 0x8f8fff, 12, 11);
  animated.push((t) => {
    if (fx.alertT > 0) return; // red alert owns the lights
    const p = 0.85 + 0.2 * Math.sin(t * 2.3);
    coreLight.intensity = 12 * p;
    machineLight.intensity = 26 * (0.94 + 0.06 * Math.sin(t * 2.3));
  });

  // round dome fixtures over the room lights (own material each, so rooms can dim)
  const fixtureMats = {};
  for (const [fxx, fz] of [[0, -19], [0, 21], [-6, 6.5], [6, -6.5], [6, 6.5]]) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.82, 0.05, 26), mats.hullDark);
    housing.position.set(fxx, 2.95, fz);
    const im = mats.emWhite.clone();
    im.emissive.set(0xc4c8f8);
    im.emissiveIntensity = 0.6;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.05, 26), im);
    disc.position.set(fxx, 2.925, fz);
    scene.add(housing, disc);
    fixtureMats[`${fxx},${fz}`] = im;
  }

  // ---- red alert ----
  const alertLights = [bridgeLight, machineLight, cantinaLight, dormLight, bedroomLight, bathLight, corA, corB];
  const RED = new THREE.Color(0xff2418);
  animated.push((t, dt) => {
    if (fx.alertT <= 0) return;
    fx.alertT -= dt;
    if (fx.alertT > 0) {
      domeBlink.speed = 12;
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      for (const l of alertLights) {
        l.color.copy(l.userData.baseColor).lerp(RED, 0.2 + 0.75 * pulse);
        l.intensity = l.userData.baseIntensity * (0.55 + 0.6 * pulse);
      }
    } else {
      domeBlink.speed = 4.5;
      for (const l of alertLights) {
        l.color.copy(l.userData.baseColor);
        l.intensity = l.userData.baseIntensity;
      }
    }
  });

  // ---- light switches ----
  interact?.add('dormsw', 'LIGHTS', [dormSwPlate, dormSwNub], (local, s) => {
    const on = local ? !(dormLight.userData.baseIntensity > 5) : !!s;
    dormLight.userData.baseIntensity = on ? 20 : 1.2;
    dormLight.intensity = dormLight.userData.baseIntensity;
    fixtureMats['-6,6.5'].emissiveIntensity = on ? 0.6 : 0.06;
    dormSwNub.position.y = on ? 1.38 : 1.32;
    audio?.click(dormSwPlate.position);
    return on ? 1 : 0;
  });
  interact?.add('lamp', 'LAMP', [lampShade, lampStem], (local, s) => {
    const on = local ? !(bedsideLight.userData.baseIntensity > 1) : !!s;
    bedsideLight.userData.baseIntensity = on ? 5 : 0.001;
    bedsideLight.intensity = bedsideLight.userData.baseIntensity;
    lampMat.emissiveIntensity = on ? 1.5 : 0.08;
    audio?.click(lampShade.position);
    return on ? 1 : 0;
  });

  // ---------- space backdrop ----------
  const space = new THREE.Group();
  const starGeo = new THREE.BufferGeometry();
  const starCount = 2200;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const vv = new THREE.Vector3().randomDirection().multiplyScalar(330 + Math.random() * 190);
    pos.set([vv.x, vv.y, vv.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  space.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe6f0ff, size: 2.6, sizeAttenuation: false, fog: false })));

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 32),
    new THREE.MeshBasicMaterial({ map: planetTex(), fog: false })
  );
  planet.position.set(-120, 6, -290);
  space.add(planet);
  const ringM = new THREE.Mesh(
    new THREE.RingGeometry(38, 56, 64),
    new THREE.MeshBasicMaterial({ color: 0xb0a0e0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false })
  );
  ringM.position.copy(planet.position);
  ringM.rotation.set(1.35, 0.2, 0);
  space.add(ringM);

  const sunMat = new THREE.SpriteMaterial({ map: nebulaTex('235,220,255'), blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
  const sun = new THREE.Sprite(sunMat);
  sun.scale.setScalar(110);
  sun.position.set(280, 90, 210);
  space.add(sun);
  const nebCols = ['150,90,255', '255,110,200', '90,130,255'];
  for (let i = 0; i < 6; i++) {
    const neb = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTex(nebCols[i % 3]), blending: THREE.AdditiveBlending,
      opacity: 0.32, fog: false, depthWrite: false
    }));
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(430);
    neb.position.copy(dir);
    neb.scale.setScalar(170 + Math.random() * 140);
    space.add(neb);
  }
  scene.add(space);
  animated.push((t, dt) => {
    space.rotation.y = t * 0.0011;
    planet.rotation.y += dt * 0.008;
  });

  // ---------- animate hook ----------
  function animate(t, dt) {
    for (const b of blinkers) {
      b.mat.emissiveIntensity = Math.sin(t * b.speed + b.phase) > 0.25 ? 1.9 : 0.12;
    }
    for (const fn of animated) fn(t, dt);
    screens.update(t);
  }

  return { colliders, doors, dynColliders, animate };
}
