import * as THREE from 'three';

const SEND_RATE_MS = 66; // ~15 Hz

function avatarColor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.6, 0.55);
}

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(14,8,30,0.65)';
  ctx.beginPath();
  ctx.roundRect(28, 10, 200, 44, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,110,255,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ddd2ff';
  ctx.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.38, 1);
  sprite.position.y = 0.72;
  return sprite;
}

class RemotePlayer {
  constructor(scene, id, name) {
    this.id = id;
    this.name = name;
    this.group = new THREE.Group(); // origin at eye height

    const color = avatarColor(id);
    const suitMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 });
    const suitDark = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.45), roughness: 0.7, metalness: 0.2 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, roughness: 0.3, metalness: 0.15 });
    this.visorMat = new THREE.MeshStandardMaterial({
      color: 0x0c1420, metalness: 0.85, roughness: 0.12,
      emissive: 0x8a5cff, emissiveIntensity: 0
    });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    add(new THREE.SphereGeometry(0.26, 20, 16), helmetMat, 0, 0.05, 0);                    // helmet
    const visor = add(new THREE.SphereGeometry(0.19, 16, 12), this.visorMat, 0, 0.06, -0.14);
    visor.scale.set(1, 0.72, 0.82);
    add(new THREE.CapsuleGeometry(0.27, 0.48, 6, 14), suitMat, 0, -0.62, 0);               // torso
    add(new THREE.BoxGeometry(0.2, 0.14, 0.04), suitDark, 0, -0.5, -0.27);                 // chest panel
    add(new THREE.BoxGeometry(0.34, 0.46, 0.18), suitDark, 0, -0.58, 0.27);                // backpack
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.1, 10, 8), suitDark, s * 0.3, -0.42, 0);              // shoulders
      add(new THREE.CapsuleGeometry(0.085, 0.28, 4, 8), suitDark, s * 0.13, -1.18, 0);     // legs
    }
    const chestLight = add(new THREE.BoxGeometry(0.05, 0.05, 0.02), new THREE.MeshStandardMaterial({
      color: 0x0a0d12, emissive: 0xb08aff, emissiveIntensity: 1.4
    }), 0.06, -0.48, -0.29);
    chestLight.visible = true;

    // talk ring above the helmet
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff6ec7, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 26), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.44;
    this.group.add(ring);

    this.group.add(makeNameSprite(name));
    this.group.position.set(0, 1.6, 0);
    scene.add(this.group);

    this.targetPos = this.group.position.clone();
    this.targetYaw = 0;
    this._talk = 0;
  }

  setTarget(p, ry) {
    this.targetPos.set(p[0], p[1], p[2]);
    this.targetYaw = ry;
  }

  setTalking(level) {
    this._talk = Math.max(level, this._talk * 0.9);
  }

  update(dt) {
    const k = Math.min(1, dt * 12);
    this.group.position.lerp(this.targetPos, k);
    let d = this.targetYaw - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * k;
    this.ringMat.opacity += ((this._talk > 0.09 ? 0.85 : 0) - this.ringMat.opacity) * Math.min(1, dt * 8);
    this.visorMat.emissiveIntensity += ((this._talk > 0.09 ? 0.7 : 0) - this.visorMat.emissiveIntensity) * Math.min(1, dt * 8);
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}

export class Net {
  // events: onWelcome(id, peers[]), onPeerJoined(peer), onPeerLeft(id),
  //         onSignal(from, data), onStatus(text), onCrewCount(n)
  constructor(scene, handlers) {
    this.scene = scene;
    this.handlers = handlers;
    this.remotes = new Map();
    this.id = null;
    this.ws = null;
    this._lastSend = 0;
  }

  connect(name) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.hostname}:3001`);
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.onStatus?.('online');
      ws.send(JSON.stringify({ type: 'join', name }));
    };
    ws.onclose = () => {
      this.handlers.onStatus?.('disconnected');
      for (const r of this.remotes.values()) r.dispose(this.scene);
      this.remotes.clear();
      this._updateCount();
    };
    ws.onerror = () => this.handlers.onStatus?.('error');

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'welcome':
          this.id = msg.id;
          for (const peer of msg.peers) this._addRemote(peer);
          this.handlers.onWelcome?.(msg.id, msg.peers, msg.spawn, msg.shipId, msg.objs);
          this._updateCount();
          break;
        case 'peer-joined':
          this._addRemote(msg.peer);
          this.handlers.onPeerJoined?.(msg.peer);
          this._updateCount();
          break;
        case 'peer-left': {
          const r = this.remotes.get(msg.id);
          if (r) { r.dispose(this.scene); this.remotes.delete(msg.id); }
          this.handlers.onPeerLeft?.(msg.id);
          this._updateCount();
          break;
        }
        case 'pos': {
          const r = this.remotes.get(msg.id);
          if (r) r.setTarget(msg.p, msg.ry);
          break;
        }
        case 'signal':
          this.handlers.onSignal?.(msg.from, msg.data);
          break;
        case 'act':
          this.handlers.onAct?.(msg.id, msg.s);
          break;
        case 'obj':
          this.handlers.onObj?.(msg.id, msg.p, msg.v);
          break;
      }
    };
  }

  sendAct(id, s) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'act', id, s }));
    }
  }

  sendObj(u) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'obj', ...u }));
    }
  }

  _addRemote(peer) {
    if (peer.id === this.id || this.remotes.has(peer.id)) return;
    const r = new RemotePlayer(this.scene, peer.id, peer.name);
    if (peer.p) r.setTarget(peer.p, peer.ry || 0);
    this.remotes.set(peer.id, r);
  }

  _updateCount() {
    this.handlers.onCrewCount?.(this.remotes.size + 1);
  }

  sendSignal(to, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', to, data }));
    }
  }

  sendPosition(pos, yaw) {
    const now = performance.now();
    if (now - this._lastSend < SEND_RATE_MS) return;
    this._lastSend = now;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'pos',
        p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)],
        ry: +yaw.toFixed(3)
      }));
    }
  }

  update(dt) {
    for (const r of this.remotes.values()) r.update(dt);
  }
}
