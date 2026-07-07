import * as THREE from 'three';

const EYE_HEIGHT = 1.6;
const RADIUS = 0.35;
const SPEED = 4.2;

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.position = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.yaw = 0; // face the bridge (-z)
    this.pitch = 0;
    this.keys = {};
    this.locked = false;
    this._bobPhase = 0;
    this._bob = 0;
    this._strideAcc = 0;
    this._step = false;

    domElement.addEventListener('click', () => {
      if (!this.locked) {
        try { domElement.requestPointerLock()?.catch?.(() => {}); } catch {}
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  consumeStep() {
    const s = this._step;
    this._step = false;
    return s;
  }

  update(dt) {
    let fwd = 0, strafe = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) fwd += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) fwd -= 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) strafe -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) strafe += 1;

    if (fwd || strafe) {
      const len = Math.hypot(fwd, strafe);
      const s = (SPEED * dt) / len;
      const before = this.position.clone();
      this.position.x += (-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * strafe) * s;
      this.position.z += (-Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * strafe) * s;
      this.resolveCollisions();
      const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
      this._bobPhase += moved * 4.4;
      this._bob = THREE.MathUtils.lerp(this._bob, Math.sin(this._bobPhase) * 0.032, Math.min(1, dt * 10));
      this._strideAcc += moved;
      if (this._strideAcc > 0.78) {
        this._strideAcc -= 0.78;
        this._step = true;
      }
    } else {
      this._bob = THREE.MathUtils.lerp(this._bob, 0, Math.min(1, dt * 6));
    }

    this.camera.position.set(this.position.x, this.position.y + this._bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  resolveCollisions() {
    // circle (RADIUS) vs AABB list, two passes for corners
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.door && !c.door.blocking) continue;
        const minX = c.minX - RADIUS, maxX = c.maxX + RADIUS;
        const minZ = c.minZ - RADIUS, maxZ = c.maxZ + RADIUS;
        const { x, z } = this.position;
        if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
        const pushLeft = x - minX, pushRight = maxX - x;
        const pushFront = z - minZ, pushBack = maxZ - z;
        const min = Math.min(pushLeft, pushRight, pushFront, pushBack);
        if (min === pushLeft) this.position.x = minX;
        else if (min === pushRight) this.position.x = maxX;
        else if (min === pushFront) this.position.z = minZ;
        else this.position.z = maxZ;
      }
    }
  }
}
