import * as THREE from 'three';
import { textPlateTex } from './materials.js';

// All builders take ctx = { scene, colliders, mats, blinkers, animated, screens, box }
// box(w,h,d,x,y,z,mat,collide) adds a mesh (+XZ collider) and returns it.

export function blinker(ctx, x, y, z, color = 0xb08aff, speed = 2, size = 0.045) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, emissive: color, emissiveIntensity: 0.2 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
  m.position.set(x, y, z);
  ctx.scene.add(m);
  ctx.blinkers.push({ mat, speed, phase: Math.random() * 9 });
  return m;
}

export function screenMesh(ctx, w, h, tex, intensity = 1.5) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x02050a, emissive: 0xffffff, emissiveMap: tex,
    emissiveIntensity: intensity, roughness: 0.35, metalness: 0.1
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// Sign plate mounted on a wall face. n = outward normal axis ('x'|'z'), sign = ±1.
export function signPlate(ctx, text, x, y, z, n, sign, opts) {
  const tex = textPlateTex(text, opts);
  const m = screenMesh(ctx, 0.95, 0.24, tex, 1.15);
  m.position.set(x, y, z);
  if (n === 'x') m.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
  else if (sign < 0) m.rotation.y = Math.PI;
  m.position[n] += sign * 0.02;
  ctx.scene.add(m);
  return m;
}

export function chair(ctx, x, z, rotY, seatColor = 0x394251) {
  const g = new THREE.Group();
  const { mats } = ctx;
  const seatMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.75 });
  const add = (geo, mat, px, py, pz, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz); m.rotation.x = rx;
    g.add(m); return m;
  };
  add(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 16), mats.trim, 0, 0.03, 0);
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 10), mats.steel, 0, 0.25, 0);
  add(new THREE.BoxGeometry(0.6, 0.09, 0.56), seatMat, 0, 0.5, 0);
  add(new THREE.BoxGeometry(0.56, 0.72, 0.09), seatMat, 0, 0.9, 0.28, -0.14);
  add(new THREE.BoxGeometry(0.3, 0.17, 0.07), seatMat, 0, 1.32, 0.33, -0.14);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.2, 0.1), mats.trim, s * 0.32, 0.62, 0.18);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.42), mats.trim, s * 0.32, 0.73, 0.02);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  ctx.colliders.push({ minX: x - 0.38, maxX: x + 0.38, minZ: z - 0.38, maxZ: z + 0.38 });
  return g;
}

export function roundTable(ctx, x, z, r = 0.85) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 28), mats.white);
  top.position.y = 0.98;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 28), mats.steel);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.96;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.95, 12), mats.trim);
  stem.position.y = 0.48;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 20), mats.trim);
  foot.position.y = 0.03;
  g.add(top, rim, stem, foot);
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  ctx.colliders.push({ minX: x - r * 0.8, maxX: x + r * 0.8, minZ: z - r * 0.8, maxZ: z + r * 0.8 });
  return g;
}

export function stool(ctx, x, z) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 16), mats.accent);
  seat.position.y = 0.56;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.54, 10), mats.steel);
  stem.position.y = 0.27;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 14), mats.trim);
  foot.position.y = 0.02;
  g.add(seat, stem, foot);
  g.position.set(x, 0, z);
  ctx.scene.add(g);
  ctx.colliders.push({ minX: x - 0.24, maxX: x + 0.24, minZ: z - 0.24, maxZ: z + 0.24 });
  return g;
}

export function bunk(ctx, x, z, rotY) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    g.add(m); return m;
  };
  // frame: 2.15 long (local x), 1.05 deep (local z)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 2.25, 0.08), mats.trim, sx * 1.03, 1.12, sz * 0.48);
  }
  for (const y of [0.48, 1.52]) {
    add(new THREE.BoxGeometry(2.14, 0.09, 1.04), mats.trim, 0, y, 0);
    add(new THREE.BoxGeometry(2.0, 0.15, 0.92), mats.bedBase, 0, y + 0.11, 0);
    add(new THREE.BoxGeometry(1.3, 0.06, 0.94), mats.bedding, 0.34, y + 0.2, 0);        // folded sheet
    add(new THREE.BoxGeometry(0.42, 0.09, 0.66), mats.pillow, -0.78, y + 0.21, 0);       // pillow
    // reading light
    const lamp = add(new THREE.BoxGeometry(0.16, 0.05, 0.08), mats.emPink, 0.6, y + 0.78, -0.44);
    lamp.rotation.x = 0.5;
  }
  // guard rail on top bunk + ladder at foot end
  add(new THREE.BoxGeometry(1.1, 0.05, 0.05), mats.steel, -0.4, 1.86, 0.5);
  for (const y of [0.55, 0.95, 1.35]) add(new THREE.BoxGeometry(0.05, 0.05, 0.5), mats.steel, 1.08, y, 0);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const hx = 1.12 * c + 0.55 * s, hz = 1.12 * s + 0.55 * c;
  ctx.colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
  return g;
}

export function locker(ctx, x, z, rotY, n = 3) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const W = 0.55;
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * W;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 1.95, 0.5), mats.hullDark);
    body.position.set(lx, 0.98, 0);
    g.add(body);
    for (let v = 0; v < 3; v++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), mats.trim);
      slot.position.set(lx, 1.62 - v * 0.09, 0.255);
      g.add(slot);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.03), mats.steel);
    handle.position.set(lx + 0.17, 1.05, 0.26);
    g.add(handle);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const hw = (n * W) / 2 + 0.02, hd = 0.28;
  ctx.colliders.push({ minX: x - (hw * c + hd * s), maxX: x + (hw * c + hd * s), minZ: z - (hw * s + hd * c), maxZ: z + (hw * s + hd * c) });
  return g;
}

export function pipeRun(ctx, points, r, mat) {
  const group = new THREE.Group();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < points.length - 1; i++) {
    a.fromArray(points[i]); b.fromArray(points[i + 1]);
    const len = a.distanceTo(b);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    cyl.position.copy(a).add(b).multiplyScalar(0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(cyl);
    if (i < points.length - 2) {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 10, 8), mat);
      joint.position.copy(b);
      group.add(joint);
    }
  }
  ctx.scene.add(group);
  return group;
}

export function valveWheel(ctx, x, y, z, rotY, mat) {
  const g = new THREE.Group();
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 18), mat);
  g.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), mat);
    spoke.rotation.z = (i * Math.PI) / 3;
    g.add(spoke);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8), mat);
  stem.rotation.x = Math.PI / 2; stem.position.z = -0.07;
  g.add(stem);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  return g;
}

// Circular porthole with a real hole (extruded plate) — placed in a wall
// window gap so actual space is visible through the glass.
export function porthole(ctx, x, y, z, n /* 'x'|'z' wall normal axis */) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.66, -0.66); shape.lineTo(0.66, -0.66); shape.lineTo(0.66, 0.66); shape.lineTo(-0.66, 0.66); shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false }), mats.hull);
  plate.position.z = -0.17;
  g.add(plate);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 10, 24), mats.steel);
    rim.position.z = s * 0.17;
    g.add(rim);
    for (let i = 0; i < 6; i++) {
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.trim);
      const a = (i / 6) * Math.PI * 2 + 0.3;
      bolt.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, s * 0.18);
      g.add(bolt);
    }
  }
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.41, 24), mats.glass);
  g.add(glass);
  g.position.set(x, y, z);
  if (n === 'x') g.rotation.y = Math.PI / 2;
  ctx.scene.add(g);
  return g;
}

export function plant(ctx, x, y, z) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 10), mats.accent);
  pot.position.y = 0.06;
  g.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9a52, roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), leafMat);
    const a = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.045, 0.2, Math.sin(a) * 0.045);
    leaf.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * -0.5);
    g.add(leaf);
  }
  g.position.set(x, y, z);
  ctx.scene.add(g);
  return g;
}

export function extinguisher(ctx, x, z, wallSign) {
  const g = new THREE.Group();
  const redMat = new THREE.MeshStandardMaterial({ color: 0xb8352c, roughness: 0.4, metalness: 0.3 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.48, 12), redMat);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.1, 8), ctx.mats.steel);
  top.position.y = 0.28;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.22), ctx.mats.trim);
  bracket.position.x = wallSign * 0.1;
  g.add(tank, top, bracket);
  g.position.set(x, 0.85, z);
  ctx.scene.add(g);
  return g;
}

export function intercom(ctx, x, y, z, n, sign) {
  const { mats } = ctx;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.2), mats.housing);
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.13), mats.trim);
    slit.position.set(0.026 * (n === 'x' ? sign : 1), 0.06 - i * 0.04, 0);
    g.add(slit);
  }
  g.position.set(x, y, z);
  if (n === 'z') g.rotation.y = Math.PI / 2;
  ctx.scene.add(g);
  blinker(ctx, x + (n === 'x' ? sign * 0.035 : 0), y + 0.11, z + (n === 'z' ? sign * 0.035 : 0), 0x8a8aff, 1.2, 0.03);
  return g;
}
