import * as THREE from 'three';
import { canvasTex } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);

function ballTex() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#9aa2b8'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#232838';
    for (let i = 0; i < 8; i++) {
      const x = (i % 4) * 64 + (i > 3 ? 32 : 0) + 16;
      const y = i > 3 ? 88 : 24;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - 0.3;
        const px = x + Math.cos(a) * 14, py = y + Math.sin(a) * 14;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
    g.fillStyle = '#e0479a';
    g.fillRect(0, 60, 256, 8);
  });
}

// Push/kick physics for toy objects (ball, crate), shared over the network.
// Whoever last touched an object streams its state; everyone else lerps.
export class Dynamics {
  constructor(scene, colliders, dynColliders, audio) {
    this.scene = scene;
    this.colliders = colliders;
    this.dynColliders = dynColliders || [];
    this.audio = audio;
    this.objects = new Map();
    this._dirty = new Map(); // id -> lastSent time
  }

  addBall(id, x, z) {
    const r = 0.22;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 20, 16),
      new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.55, metalness: 0.05 })
    );
    mesh.position.set(x, r, z);
    this.scene.add(mesh);
    this.objects.set(id, {
      id, kind: 'ball', mesh, r,
      vel: new THREE.Vector2(), vy: 0,
      kickCd: 0, net: null, touched: false
    });
  }

  addCrate(id, x, z) {
    const half = 0.3;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2, half * 2, half * 2),
      new THREE.MeshStandardMaterial({ color: 0x2c2a44, roughness: 0.7, metalness: 0.3 })
    );
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2 + 0.01, 0.09, half * 2 + 0.01),
      new THREE.MeshStandardMaterial({ color: 0xd9479a, roughness: 0.6 })
    );
    stripe.position.y = half - 0.09;
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.8 })
    );
    label.position.set(0, 0, half + 0.002);
    group.add(body, stripe, label);
    group.position.set(x, half, z);
    this.scene.add(group);
    this.objects.set(id, {
      id, kind: 'crate', mesh: group, r: half + 0.06,
      vel: new THREE.Vector2(), vy: 0,
      kickCd: 0, net: null, touched: false
    });
  }

  applyRemote(id, p, v) {
    const o = this.objects.get(id);
    if (!o) return;
    o.net = new THREE.Vector3(p[0], p[1], p[2]);
    o.vel.set(v[0], v[1]);
    o.touched = false; // remote authority now
  }

  // objects the local player has touched, throttled to ~10 Hz while moving
  collectUpdates(now) {
    const out = [];
    for (const o of this.objects.values()) {
      if (!o.touched) continue;
      const last = this._dirty.get(o.id) || 0;
      const moving = o.vel.lengthSq() > 0.002 || Math.abs(o.vy) > 0.05;
      if (now - last > 100 && moving) {
        this._dirty.set(o.id, now);
        out.push({ id: o.id, p: o.mesh.position.toArray().map((n) => +n.toFixed(2)), v: [+o.vel.x.toFixed(2), +o.vel.y.toFixed(2)] });
      }
      if (!moving && now - last > 250) {
        // one final rest state
        this._dirty.set(o.id, now + 1e12);
        out.push({ id: o.id, p: o.mesh.position.toArray().map((n) => +n.toFixed(2)), v: [0, 0] });
        o.touched = false;
      }
    }
    return out;
  }

  update(dt, player) {
    for (const o of this.objects.values()) {
      const pos = o.mesh.position;
      o.kickCd = Math.max(0, o.kickCd - dt);

      // network smoothing when someone else has authority
      if (o.net) {
        pos.lerp(o.net, Math.min(1, dt * 10));
        if (pos.distanceToSquared(o.net) < 0.003) o.net = null;
      }

      // local player interaction
      const dx = pos.x - player.position.x, dz = pos.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (o.kind === 'ball') {
        if (d < o.r + 0.52 && o.kickCd <= 0) {
          const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
          const speed = 3.4 + Math.random() * 0.8;
          o.vel.set(nx * speed, nz * speed);
          o.vy = 1.4 + Math.random() * 0.5;
          o.kickCd = 0.35;
          o.touched = true;
          o.net = null;
          this._dirty.set(o.id, 0);
          this.audio?.kick(pos);
        }
      } else if (d < o.r + 0.42) {
        // crate: steady shove
        const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
        pos.x += nx * (o.r + 0.42 - d) * 0.8;
        pos.z += nz * (o.r + 0.42 - d) * 0.8;
        o.vel.set(nx * 1.1, nz * 1.1);
        o.touched = true;
        o.net = null;
        if (o.kickCd <= 0) { o.kickCd = 0.5; this.audio?.scrape(pos); }
      }

      // integrate
      pos.x += o.vel.x * dt;
      pos.z += o.vel.y * dt;
      if (o.kind === 'ball') {
        o.vy -= 9.8 * dt;
        pos.y += o.vy * dt;
        if (pos.y < o.r) {
          pos.y = o.r;
          if (Math.abs(o.vy) > 0.8) this.audio?.bounce(pos, Math.abs(o.vy));
          o.vy = -o.vy * 0.45;
          if (Math.abs(o.vy) < 0.4) o.vy = 0;
        }
        o.vel.multiplyScalar(Math.exp(-(pos.y <= o.r + 0.01 ? 0.9 : 0.15) * dt));
      } else {
        o.vel.multiplyScalar(Math.exp(-5.5 * dt));
      }

      // collide with the world
      this._collide(o);

      // object vs object
      for (const other of this.objects.values()) {
        if (other === o) continue;
        const ox = pos.x - other.mesh.position.x, oz = pos.z - other.mesh.position.z;
        const od = Math.hypot(ox, oz), minD = o.r + other.r;
        if (od < minD && od > 0.001) {
          pos.x += (ox / od) * (minD - od) * 0.5;
          pos.z += (oz / od) * (minD - od) * 0.5;
        }
      }

      // rolling
      if (o.kind === 'ball') {
        const sp = o.vel.length();
        if (sp > 0.01) {
          const axis = new THREE.Vector3(o.vel.y, 0, -o.vel.x).normalize();
          o.mesh.rotateOnWorldAxis(axis, (sp * dt) / o.r);
        }
      }
    }
  }

  _collide(o) {
    const pos = o.mesh.position;
    const lists = [this.colliders, this.dynColliders];
    for (const list of lists) {
      for (const c of list) {
        if (c.door && !c.door.blocking) continue;
        const minX = c.minX - o.r, maxX = c.maxX + o.r;
        const minZ = c.minZ - o.r, maxZ = c.maxZ + o.r;
        if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
        const pushes = [pos.x - minX, maxX - pos.x, pos.z - minZ, maxZ - pos.z];
        const m = Math.min(...pushes);
        const bounce = o.kind === 'ball' ? -0.62 : 0;
        if (m === pushes[0]) { pos.x = minX; o.vel.x *= bounce; }
        else if (m === pushes[1]) { pos.x = maxX; o.vel.x *= bounce; }
        else if (m === pushes[2]) { pos.z = minZ; o.vel.y *= bounce; }
        else { pos.z = maxZ; o.vel.y *= bounce; }
        if (o.kind === 'ball' && Math.abs(bounce) > 0 && o.vel.length() > 1.2) this.audio?.bounce(pos, 1);
      }
    }
  }
}
