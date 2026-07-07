// Boards headlessly, kicks the ball, fires every interactable, screenshots.
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
const cdp = (m, p = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: 'http://localhost:5173' });
await sleep(4000);
await ev(`document.getElementById('overlay').click()`);
await sleep(4000);

// kick the ball: stand right next to it
const before = await ev(`JSON.stringify(__spacehub.dyn.objects.get('ball1').mesh.position.toArray())`);
await ev(`__spacehub.player.position.set(-5.5, 1.6, 9.05); __spacehub.player.yaw = Math.PI;`);
await sleep(1500);
const after = await ev(`JSON.stringify(__spacehub.dyn.objects.get('ball1').mesh.position.toArray())`);
console.log('ball before:', before, '→ after:', after, '| moved:', before !== after);

// push the crate
await ev(`__spacehub.player.position.set(-3.2, 1.6, 15.55); __spacehub.player.yaw = Math.PI;`);
const crateBefore = await ev(`JSON.stringify(__spacehub.dyn.objects.get('crate1').mesh.position.toArray())`);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}))`);
await sleep(2500);
await ev(`document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}))`);
const crateAfter = await ev(`JSON.stringify(__spacehub.dyn.objects.get('crate1').mesh.position.toArray())`);
console.log('crate before:', crateBefore, '→ after:', crateAfter, '| moved:', crateBefore !== crateAfter);

// fire every interactable
for (const id of ['btn0', 'btn3', 'galley', 'valve', 'dormsw', 'lamp', 'shower', 'vend', 'alarm']) {
  await ev(`__spacehub.interact.trigger('${id}')`);
  await sleep(150);
}
await sleep(1200);

// red alert corridor shot
await ev(`__spacehub.player.position.set(0, 1.6, -11); __spacehub.player.yaw = Math.PI; __spacehub.player.pitch = 0;`);
await sleep(600);
const shot1 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/interact-alert.png', Buffer.from(shot1.result.data, 'base64'));

await sleep(6000); // alert over; galley done
await ev(`__spacehub.player.position.set(-6.8, 1.6, -3.6); __spacehub.player.yaw = 2.4; __spacehub.player.pitch = 0.15;`);
await sleep(800);
const shot2 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/interact-galley.png', Buffer.from(shot2.result.data, 'base64'));

// bridge buttons
await ev(`__spacehub.player.position.set(0, 1.6, -24.2); __spacehub.player.yaw = 0; __spacehub.player.pitch = -0.5;`);
await sleep(800);
const shot3 = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync('/tmp/interact-buttons.png', Buffer.from(shot3.result.data, 'base64'));

console.log('console errors:', errors.length ? errors : 'none');
ws.close();
process.exit(0);
