// CDP smoke test: load the client, click to board, verify HUD + render.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const DEBUG_PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://localhost:${DEBUG_PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));

let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
function cdp(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const res = await cdp('Runtime.evaluate', { expression, returnByValue: true });
  return res.result?.result?.value;
}

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

await cdp('Page.navigate', { url: 'http://localhost:5173' });
await sleep(3500);

const overlayVisible = await evaluate(`getComputedStyle(document.getElementById('overlay')).display !== 'none'`);
const shot1 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/space-overlay.png', Buffer.from(shot1.result.data, 'base64'));

// board the ship
await evaluate(`document.getElementById('overlay').click()`);
await sleep(3000);

const state = await evaluate(`JSON.stringify({
  overlayGone: getComputedStyle(document.getElementById('overlay')).display === 'none',
  hudShown: getComputedStyle(document.getElementById('hud')).display !== 'none',
  room: document.getElementById('room-name').textContent,
  crew: document.getElementById('crew-count').textContent,
  net: document.getElementById('net-state').textContent,
  mic: document.getElementById('mic-state').textContent
})`);

// walk forward toward the bridge: door at z=-14 must auto-open to let us through.
// generous duration: headless software rendering runs a few fps, and dt clamping
// slows simulated movement well below the nominal 4.2 m/s
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
await sleep(16000);
await evaluate(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
await sleep(400);
const room2 = await evaluate(`document.getElementById('room-name').textContent`);

const shot2 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/space-boarded.png', Buffer.from(shot2.result.data, 'base64'));

console.log('overlayVisible(before):', overlayVisible);
console.log('state(after board):', state);
console.log('room after walking forward:', room2);
console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
ws.close();
process.exit(0);
