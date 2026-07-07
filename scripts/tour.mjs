// Boards the ship headlessly and screenshots every room for visual review.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch('http://localhost:9222/json')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));

let seq = 0;
const pending = new Map();
const errors = [];
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
});
const cdp = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: 'http://localhost:5173' });
await sleep(4000);
await evaluate(`document.getElementById('overlay').click()`);
await sleep(4500);

const views = [
  ['bridge',        0,    -15.2, 0,        -0.05],
  ['bridge-seat',  -3.6,  -17.4, -0.55,     0.05],
  ['corridor',      0,    -12.5, Math.PI,  -0.02],
  ['cantina',      -3.4,  -7,    Math.PI / 2, 0],
  ['dorm',         -3.4,   7,    Math.PI / 2, 0],
  ['bedroom',       3.4,  -7,   -Math.PI / 2, 0],
  ['bathroom',      3.4,   7,   -Math.PI / 2, 0],
  ['machine',       0,     15.8, Math.PI,   0.02],
  ['door-open',     0,    -12.2, 0,         0]
];

for (const [name, x, z, yaw, pitch] of views) {
  await evaluate(`(() => { const p = __spacehub.player; p.position.set(${x}, 1.6, ${z}); p.yaw = ${yaw}; p.pitch = ${pitch}; })()`);
  await sleep(900);
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`/tmp/tour-${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log('captured', name);
}
console.log('console errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
