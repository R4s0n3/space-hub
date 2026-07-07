import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 3001;
const MAX_CREW = 6;

// Spawn points spread along the corridor so crews don't stack up.
const SPAWNS = [
  [0, 1.6, 0], [0, 1.6, 3], [0, 1.6, -3],
  [0, 1.6, 6], [0, 1.6, -6], [0, 1.6, 9]
];

const ships = new Map(); // shipId -> { crew: Map<playerId, player>, objs: { objId: {p, v} } }

function findShip() {
  // "randomly put together": pick a random ship that still has room
  const open = [...ships.entries()].filter(([, s]) => s.crew.size < MAX_CREW);
  if (open.length > 0) {
    return open[Math.floor(Math.random() * open.length)][0];
  }
  const id = randomUUID().slice(0, 8);
  ships.set(id, { crew: new Map(), objs: {} });
  return id;
}

function broadcast(shipId, msg, exceptId = null) {
  const ship = ships.get(shipId);
  if (!ship) return;
  const data = JSON.stringify(msg);
  for (const [pid, p] of ship.crew) {
    if (pid !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

const wss = new WebSocketServer({ port: PORT });
console.log(`space-hub server listening on :${PORT}`);

wss.on('connection', (ws) => {
  let playerId = null;
  let shipId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join' && !playerId) {
      playerId = randomUUID().slice(0, 8);
      shipId = findShip();
      const ship = ships.get(shipId);
      const spawn = SPAWNS[ship.crew.size % SPAWNS.length];
      const player = {
        ws,
        id: playerId,
        name: String(msg.name || 'CREW').slice(0, 24),
        p: [...spawn],
        ry: 0
      };

      const peers = [...ship.crew.values()].map((p) => ({ id: p.id, name: p.name, p: p.p, ry: p.ry }));
      ship.crew.set(playerId, player);

      ws.send(JSON.stringify({ type: 'welcome', id: playerId, shipId, spawn, peers, objs: ship.objs }));
      broadcast(shipId, { type: 'peer-joined', peer: { id: playerId, name: player.name, p: player.p, ry: 0 } }, playerId);
      console.log(`[${shipId}] ${player.name} boarded (crew: ${ship.crew.size}/${MAX_CREW})`);
      return;
    }

    if (!playerId || !shipId) return;
    const ship = ships.get(shipId);
    const player = ship?.crew.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'pos':
        if (Array.isArray(msg.p) && msg.p.length === 3) {
          player.p = msg.p;
          player.ry = msg.ry || 0;
          broadcast(shipId, { type: 'pos', id: playerId, p: player.p, ry: player.ry }, playerId);
        }
        break;
      case 'obj':
        // toy object state (ball, crate): persist for late joiners + relay
        if (typeof msg.id === 'string' && Array.isArray(msg.p)) {
          ship.objs[msg.id] = { p: msg.p, v: msg.v || [0, 0] };
          broadcast(shipId, { type: 'obj', id: msg.id, p: msg.p, v: msg.v || [0, 0] }, playerId);
        }
        break;
      case 'act':
        // interactable used (button, lever, switch…): relay to shipmates
        if (typeof msg.id === 'string') {
          broadcast(shipId, { type: 'act', id: msg.id, s: msg.s }, playerId);
        }
        break;
      case 'signal': {
        // WebRTC signaling relay, only within the same ship
        const target = ship.crew.get(msg.to);
        if (target && target.ws.readyState === target.ws.OPEN) {
          target.ws.send(JSON.stringify({ type: 'signal', from: playerId, data: msg.data }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!playerId || !shipId) return;
    const ship = ships.get(shipId);
    if (!ship) return;
    const player = ship.crew.get(playerId);
    ship.crew.delete(playerId);
    broadcast(shipId, { type: 'peer-left', id: playerId });
    console.log(`[${shipId}] ${player?.name ?? playerId} left (crew: ${ship.crew.size}/${MAX_CREW})`);
    if (ship.crew.size === 0) ships.delete(shipId);
  });

  ws.on('error', () => {});
});
