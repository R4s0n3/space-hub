import * as THREE from 'three';

// Aim-at + press-E interactables. Effects run locally at once and are
// mirrored to shipmates through an 'act' message; onUse(local, s) returns
// the state to broadcast (or undefined for stateless fire-and-forget).
export class Interactions {
  constructor(camera, promptEl, sendAct) {
    this.camera = camera;
    this.promptEl = promptEl;
    this.sendAct = sendAct;
    this.items = new Map();
    this.hitMeshes = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 3.2;
    this.current = null;
    this._t = 0;
  }

  add(id, label, meshes, onUse, radius = 2.6) {
    for (const m of meshes) {
      m.traverse ? m.traverse((c) => { c.userData.iid = id; }) : (m.userData.iid = id);
      this.hitMeshes.push(m);
    }
    this.items.set(id, { label, onUse, radius });
  }

  _iidOf(obj) {
    let n = obj;
    while (n) {
      if (n.userData?.iid) return n.userData.iid;
      n = n.parent;
    }
    return null;
  }

  update(dt) {
    this._t += dt;
    if (this._t < 0.12) return;
    this._t = 0;
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    const hits = this.ray.intersectObjects(this.hitMeshes, true);
    let found = null;
    for (const h of hits) {
      const iid = this._iidOf(h.object);
      if (!iid) continue;
      const item = this.items.get(iid);
      if (item && h.distance <= item.radius) { found = iid; break; }
    }
    if (found !== this.current) {
      this.current = found;
      if (found) {
        this.promptEl.textContent = `[E] ${this.items.get(found).label}`;
        this.promptEl.style.display = 'block';
      } else {
        this.promptEl.style.display = 'none';
      }
    }
  }

  use() {
    if (!this.current) return;
    this.trigger(this.current);
  }

  // run locally + broadcast (also used by tests)
  trigger(id) {
    const item = this.items.get(id);
    if (!item) return;
    const s = item.onUse(true, undefined);
    this.sendAct?.(id, s);
  }

  runRemote(id, s) {
    this.items.get(id)?.onUse(false, s);
  }
}
