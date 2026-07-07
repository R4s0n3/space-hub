// Verifies act/obj relay + obj persistence for late joiners (no browser).
import WebSocket from 'ws';

function connect(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3001');
    const c = { ws, name, msgs: [] };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.type === 'welcome') { c.id = m.id; c.shipId = m.shipId; c.welcome = m; resolve(c); }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const a = await connect('A');
const b = await connect('B');
if (a.shipId !== b.shipId) { console.log('FAIL: not same ship'); process.exit(1); }

a.ws.send(JSON.stringify({ type: 'act', id: 'btn3', s: 1 }));
a.ws.send(JSON.stringify({ type: 'obj', id: 'ball1', p: [1, 0.22, 5], v: [2, 0] }));
await sleep(300);

const gotAct = b.msgs.some((m) => m.type === 'act' && m.id === 'btn3' && m.s === 1);
const gotObj = b.msgs.some((m) => m.type === 'obj' && m.id === 'ball1' && m.p[0] === 1);
const aEcho = a.msgs.some((m) => m.type === 'act' || m.type === 'obj'); // must NOT echo to sender

const c = await connect('C'); // late joiner sees stored ball position
const lateObjs = c.welcome.objs?.ball1?.p?.[0] === 1;

console.log('act relayed:', gotAct, '| obj relayed:', gotObj, '| echo to sender:', aEcho, '| late-joiner objs:', lateObjs);
for (const x of [a, b, c]) x.ws.close();
process.exit(gotAct && gotObj && !aEcho && lateObjs ? 0 : 1);
