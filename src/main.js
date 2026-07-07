import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildShip, roomAt } from './ship.js';
import { Player } from './player.js';
import { Net } from './net.js';
import { Voice } from './voice.js';
import { ShipAudio } from './audio.js';
import { Interactions } from './interact.js';
import { Dynamics } from './dynamics.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const crosshair = document.getElementById('crosshair');
const roomNameEl = document.getElementById('room-name');
const crewCountEl = document.getElementById('crew-count');
const micStateEl = document.getElementById('mic-state');
const netStateEl = document.getElementById('net-state');
const vesselEl = document.getElementById('vessel-id');

// ---- renderer / scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02010a);
scene.fog = new THREE.Fog(0x050310, 32, 110);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.38;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 900);
const listener = new THREE.AudioListener();
camera.add(listener);

// ---- post ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.68, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- world ----
const audio = new ShipAudio(listener);
const interact = new Interactions(camera, document.getElementById('prompt'), (id, s) => net.sendAct(id, s));
const ship = buildShip(scene, audio, interact);
const player = new Player(camera, renderer.domElement, ship.colliders);

// toy objects: kickable ball in the dorm, pushable crate in the machine room
const dyn = new Dynamics(scene, ship.colliders, ship.dynColliders, audio);
dyn.addBall('ball1', -5.5, 8.5);
dyn.addCrate('crate1', -3.2, 16.2);

// ---- networking + voice ----
const net = new Net(scene, {
  onStatus: (s) => { netStateEl.textContent = s; },
  onCrewCount: (n) => { crewCountEl.textContent = n; },
  onWelcome: (_id, peers, spawn, shipId, objs) => {
    if (spawn) player.position.set(spawn[0], spawn[1], spawn[2]);
    if (shipId) vesselEl.textContent = `ISV-${shipId.toUpperCase()}`;
    if (objs) for (const [id, o] of Object.entries(objs)) dyn.applyRemote(id, o.p, o.v);
    // newcomer rings everyone already aboard
    for (const p of peers) voice.callPeer(p.id);
  },
  onPeerJoined: () => {},          // they will call us
  onPeerLeft: (id) => voice.closePeer(id),
  onSignal: (from, data) => voice.handleSignal(from, data),
  onAct: (id, s) => interact.runRemote(id, s),
  onObj: (id, p, v) => dyn.applyRemote(id, p, v)
});
const voice = new Voice(net, listener);

// ---- boarding ----
let boarded = false;
overlay.addEventListener('click', async () => {
  if (boarded) return;
  boarded = true;
  overlay.style.display = 'none';
  hud.style.display = 'flex';
  crosshair.style.display = 'block';
  document.getElementById('vignette').style.display = 'block';
  document.getElementById('scanlines').style.display = 'block';
  const hint = document.getElementById('controls-hint');
  hint.style.display = 'block';
  setTimeout(() => { hint.style.opacity = '0'; }, 9000);
  try { renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch {}
  if (listener.context.state === 'suspended') listener.context.resume();
  audio.start();

  const micOk = await voice.init();
  micStateEl.textContent = micOk ? 'LIVE' : 'N/A';

  const callsign = 'CREW-' + Math.floor(1000 + Math.random() * 9000);
  net.connect(callsign);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && boarded && voice.available) {
    voice.setMuted(!voice.muted);
    micStateEl.textContent = voice.muted ? 'MUTED' : 'LIVE';
    micStateEl.classList.toggle('muted', voice.muted);
  }
  if (e.code === 'KeyE' && boarded) interact.use();
});
document.addEventListener('mousedown', () => {
  if (boarded && player.locked) interact.use();
});

window.__spacehub = { net, voice, player, interact, dyn };

// ---- main loop ----
const clock = new THREE.Clock();
const doorProbe = [];
let elapsed = 0;
let talkTimer = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;

  player.update(dt);
  if (player.consumeStep()) audio.footstep();
  net.update(dt);
  ship.animate(elapsed, dt);
  interact.update(dt);
  dyn.update(dt, player);
  if (boarded) {
    for (const u of dyn.collectUpdates(performance.now())) net.sendObj(u);
  }

  // doors react to every crew member, local and remote
  doorProbe.length = 0;
  doorProbe.push(player.position);
  for (const r of net.remotes.values()) doorProbe.push(r.group.position);
  for (const d of ship.doors) d.update(dt, doorProbe);

  // talk indicators
  talkTimer += dt;
  if (talkTimer > 0.08 && boarded) {
    talkTimer = 0;
    const levels = voice.getLevels();
    for (const [id, r] of net.remotes) r.setTalking(levels[id] || 0);
    if (voice.available && !voice.muted) {
      micStateEl.style.textShadow = voice.getLocalLevel() > 0.12
        ? '0 0 10px rgba(90,255,190,0.9)' : 'none';
    }
  }

  if (boarded) {
    net.sendPosition(player.position, player.yaw);
    roomNameEl.textContent = roomAt(player.position.x, player.position.z);
  }

  composer.render();
}
renderer.setAnimationLoop(animate);
