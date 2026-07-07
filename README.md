# Space Hub

A multiplayer spaceship you can walk around in, built with Three.js + Vite.
Up to **6 players** are randomly matched onto the same vessel and can talk to
each other with **proximity voice chat** (WebRTC, spatialised — voices fade
with distance). Talking crew get a glowing helmet ring, so you can see who's
speaking.

## Ship layout

- **Bridge** (nose) — angled panoramic glass looking out on a ringed gas
  giant, wraparound consoles with animated radar / attitude / telemetry
  screens, a holographic nav display, pilot seats
- **Cantina** — round tables, stools, bar with glowing bottle shelves,
  animated galley menu, vending machine, pendant lamps
- **Dorm room** — bunk stacks with reading lights and ladders, lockers
- **Bedroom** — captain's cabin: bed, star-chart desk, bedside lamp, rug
- **Bathroom** — tiled floor, glass shower, sink with mirror, the rest
- **Machine room** (aft) — pulsing reactor core with rotating containment
  rings, safety railing, breaker cabinets with live gauges, coolant tanks
- Central corridor with structural ribs, pipe runs, floor guide lights,
  hazard-striped **auto-opening doors** with status lights and glowing
  destination signage (doors react to any nearby crew member, local or remote)

The look is dark Death-Star-interior futurism: near-black metal plating with
rounded corners, violet/blue/pink light everywhere — glowing arch ribs over
the corridor (elongated-octagon cross-section with chamfered corners),
recessed vertical light slots between wall panels, pink/blue floor guide
strips. All sound is synthesized in WebAudio at runtime — ambient engine
rumble, positional reactor throb, door servo whooshes, footsteps, console
beeps. Rendering uses ACES tone mapping + bloom; portholes are real openings
in the hull with the starfield visible beyond.

## Interactions

Aim at a gadget and press **E** (or click). Everything is mirrored to the
whole crew in real time:

- **Bridge** — a bank of toggle buttons on the main console, and a big red
  **RED ALERT** button that floods the ship in pulsing red light with a
  klaxon for a few seconds
- **Cantina** — pull the **AUTO-GALLEY** lever: the caf machine rattles,
  vents steam and serves a cup; the vending machine dispenses a glowing can
- **Machine room** — spin the **PURGE COOLANT** valve (steam burst, gauges
  spike); a **cargo crate** can be shoved around the deck
- **Dorm** — a **ball** you can kick around (it bounces, rolls through open
  doors, and syncs to everyone on board — late joiners see where it ended
  up); light switch by the door
- **Bedroom** — bedside lamp toggle
- **Bathroom** — start the shower

## Run

```bash
npm install
npm run dev
```

This starts both the WebSocket server (`:3001`) and the Vite dev server
(`:5173`). Open http://localhost:5173, click to board, allow the microphone.

- **WASD / arrows** — walk
- **Mouse** — look (click to capture the pointer, ESC to release)
- **M** — mute / unmute

Open the page in more tabs (or from other machines on the LAN — Vite listens
on all interfaces) to fill the crew; the 7th player gets a fresh ship.

## Deploy on Coolify with Nixpacks

Use the Nixpacks build pack. The included `nixpacks.toml` runs:

```bash
npm ci
npm run build
npm run start
```

Coolify should expose the generated application port from `PORT`. The Node
server serves the Vite `dist/` build and the WebSocket multiplayer relay from
the same origin, so no separate WebSocket service is needed.

For normal Coolify HTTPS deployments, leave `VITE_WS_URL` unset. Set
`VITE_WS_URL` only if you intentionally host the WebSocket server on a separate
public URL.

## Architecture

- `src/ship.js` — procedural ship interior: walls with door/window gaps,
  AABB colliders, framed sliding doors, instanced wall plating, per-room
  props and lighting, animated reactor/holo/blinkers, space backdrop
- `src/materials.js` — shared PBR materials + procedural canvas textures
  (tread plate, grating, tiles, hazard stripes, planet, signage)
- `src/screens.js` — animated canvas screens (radar sweep, telemetry,
  attitude, reactor panel, galley menu, star chart)
- `src/props.js` — prop builders (chairs, bunks, tables, portholes, pipes…)
- `src/audio.js` — WebAudio synth: ambient bed, positional reactor hum,
  door whooshes, footsteps, cockpit beeps (no audio assets)
- `src/interact.js` — aim-and-press interactable system (raycast + HUD
  prompt), effects mirrored to shipmates via `act` messages
- `src/dynamics.js` — push/kick physics for toy objects, streamed via `obj`
  messages with last-toucher authority
- `src/player.js` — first-person controller, circle-vs-AABB collision,
  head bob + stride events
- `src/net.js` — WebSocket client, astronaut avatars with interpolation
  and talk indicators
- `src/voice.js` — WebRTC mesh; newest joiner offers to existing crew;
  remote streams feed `THREE.PositionalAudio` for proximity falloff, with
  per-peer analysers driving the speaking indicators
- `server/index.js` — matchmaking (random non-full ship, max 6), position
  relay and WebRTC signaling relay scoped per ship

## Smoke tests

With `npm run dev` running and a headless Chromium on `:9222`
(`chromium --headless=new --remote-debugging-port=9222 --no-sandbox --use-fake-ui-for-media-stream --use-fake-device-for-media-stream`):

```bash
node scripts/smoke-browser.mjs    # boards, walks through the bridge door
node scripts/smoke-multi.mjs      # two tabs: same ship, avatar sync, voice connected
node scripts/smoke-relay.mjs      # server-only: act/obj relay + late-joiner state
node scripts/smoke-interact.mjs   # kicks the ball, pushes the crate, fires every gadget
node scripts/tour.mjs             # screenshots every room to /tmp/tour-*.png
```

Note: tests share one browser; a boarded tab stays connected and will join
subsequent ships. Restart the headless Chromium between tests that assert
crew counts.
