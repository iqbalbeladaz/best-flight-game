# Meridian Sky Rally

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/iqbalbeladaz/best-flight-game/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/iqbalbeladaz/best-flight-game/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

**Meridian Sky Rally** is a complete 3D flight game for the [make.fun "Make the best flight game" bounty](https://make.fun/c/best-flight-game-20261126-0057). Fly the Kestrel MK-II out of Meridian Valley: full throttle down the runway, thread all eight glowing gold rings over the river, the pines and the mountain rim, then bring her home for a soft landing on the centreline. Rings, time, fuel and a gentle touchdown all score — fly clean, fly fast.

## Play it

Serve `game/` with any static server and open it in desktop Chrome — no build step, no network requests:

```sh
node serve.ts   # http://127.0.0.1:8080
```

## How to fly

| Control | Action |
| --- | --- |
| ↑ / ↓ (or W / S) | Pitch up / down |
| ← / → (or A / D) | Bank and turn |
| Shift / Ctrl (or E / Q) | Throttle up / down |
| Space | Brake |
| Drag mouse | Steer |
| P | Pause · R | Restart |

Take off at 65 kt, keep above 52 kt or the wing stalls, watch the fuel gauge, and mind the terrain — a hard landing anywhere but the runway ends the sortie. A perfect landing is judged on centreline, touchdown softness and speed.

## What is in the game

- **Real 3D chase view** (Three.js, vendored under `game/vendor/`): procedural valley with a river, pine forest, mountain rim, clouds, airfield with runway, hangars and control tower, and a low-poly Kestrel MK-II with spinning propeller and navigation lights.
- **Flight model with consequences**: throttle and drag, banked turns, stall and sink, fuel burn, terrain collision, and a landing judged on centreline, softness and speed.
- **A complete sortie**: takeoff → eight-ring rally course → final approach → scored landing, with a results breakdown (rings, time, landing, fuel).
- **Lit instruments**: airspeed, altitude, vertical speed, scrolling compass tape, throttle and fuel bars, and a live attitude ball — all on a glass HUD.
- **Synthesised sound**: engine hum, wind rush, ring chimes and touchdown thuds, all generated with the Web Audio API — no audio files.
- **Deterministic screenshots**: `?shot=start|play|landing|end` stages each scene by flying the real flight model with a scripted pilot (see `game/src/shots.js`); the same seed always renders the same frame.

## Layout

```
game/                 playable game (static files only)
  index.html          page, HUD, overlays, import map
  src/
    main.js           bootstrap, loop, camera, screens
    config.js         tuning constants and the rally course
    random.js         seeded RNG + value noise (deterministic world)
    terrain.js        valley, runway, river, trees, airfield, clouds
    plane.js          Kestrel mesh + flight model
    rings.js          rally rings + pass detection
    missions.js       sortie phases and scoring
    hud.js            HUD readouts + attitude ball + compass tape
    audio.js          synthesised engine, wind, chimes
    input.js          keyboard + mouse steering
    shots.js          autopilot + deterministic screenshot scenes
  vendor/
    three.module.min.js   Three.js r160 (MIT), vendored
main.ts               entrypoint: hands game/ + screenshots/ + dossier.json in
screenshots/         4 real renders of the game's own code
vendor/makefun-game.ts  make.fun dossier library (kit copy, unchanged)
```

## Entry

Built for the make.fun bounty **best-flight-game-20261126-0057** ("Make the best flight game", $500, deadline 28 Nov 2026). License: MIT.
