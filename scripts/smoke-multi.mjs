// Two-tab multiplayer smoke test: same ship, avatars, WebRTC voice connected.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newTab() {
  const created = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const cdp = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) =>
    (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
  return { cdp, evaluate, close: () => ws.close() };
}

const a = await newTab();
const b = await newTab();
await a.cdp('Page.navigate', { url: 'http://localhost:5173' });
await b.cdp('Page.navigate', { url: 'http://localhost:5173' });
await sleep(3500);
await a.evaluate(`document.getElementById('overlay').click()`);
await sleep(1500);
await b.evaluate(`document.getElementById('overlay').click()`);
await sleep(5000);

const probe = `JSON.stringify({
  crew: document.getElementById('crew-count').textContent,
  remotes: __spacehub.net.remotes.size,
  voicePeers: [...__spacehub.voice.peers.values()].map(p => p.pc.connectionState),
  hasPosAudio: [...__spacehub.voice.peers.values()].map(p => !!p.posAudio)
})`;
console.log('tab A:', await a.evaluate(probe));
console.log('tab B:', await b.evaluate(probe));

// B walks toward A's spawn; A should see B's avatar move
await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
await sleep(1000);
await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
await sleep(600);
console.log('A sees B at:', await a.evaluate(
  `JSON.stringify([...__spacehub.net.remotes.values()].map(r => r.group.position.toArray().map(n => +n.toFixed(1))))`
));

const shot = await a.cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/space-multi.png', Buffer.from(shot.result.data, 'base64'));

a.close(); b.close();
process.exit(0);
