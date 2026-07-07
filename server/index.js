import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3001;
const MAX_CREW = 6;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

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

async function sendFile(res, filePath) {
  const data = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream'
  });
  res.end(data);
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(DIST_DIR, `.${requestPath}`);

  if (!filePath.startsWith(`${DIST_DIR}${path.sep}`) && filePath !== DIST_DIR) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
    await sendFile(res, filePath);
  } catch {
    if (path.extname(requestPath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    try {
      await sendFile(res, path.join(DIST_DIR, 'index.html'));
    } catch {
      res.writeHead(503);
      res.end('Build output not found. Run `npm run build` before starting the server.');
    }
  }
}

const server = createServer((req, res) => {
  serveStatic(req, res).catch((err) => {
    console.error(err);
    res.writeHead(500);
    res.end('Internal Server Error');
  });
});

const wss = new WebSocketServer({ server });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`space-hub server listening on :${PORT}`);
});

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
