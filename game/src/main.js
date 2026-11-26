// Meridian Sky Rally — bootstrap and the main loop.
// One clear job: own the renderer, the camera and the screens; step the
// flight model, the mission and the HUD at a fixed 60 Hz; and stage the
// deterministic ?shot= scenes for screenshots.
import * as THREE from 'three';
import { PHASES, STEP, RINGS, RING_SCORE } from './config.js';
import { buildTerrain, groundHeight } from './terrain.js';
import { buildPlaneMesh, freshFlightState, stepFlight, forwardVector } from './plane.js';
import { buildRings, setActiveRing, checkRingPass } from './rings.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createMission, stepMission, startSortie } from './missions.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 5000);

const terrain = buildTerrain(scene);
const planeMesh = buildPlaneMesh();
scene.add(planeMesh.group);
const ringsBuilt = buildRings(scene);

const state = freshFlightState();
const mission = createMission();
const audio = createAudio();
const input = createInput(canvas);
const hud = createHud();

// --- Overlays -------------------------------------------------------------
const screens = {
  title: document.getElementById('screen-title'),
  results: document.getElementById('screen-results'),
  crashed: document.getElementById('screen-crashed'),
  pause: document.getElementById('screen-pause'),
};
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', key !== name);
  }
}
function showResults() {
  document.getElementById('res-score').textContent = mission.score;
  document.getElementById('res-rings').textContent = `${mission.ringsPassed}/${mission.ringsTotal}`;
  document.getElementById('res-time').textContent = mission.timeBonus;
  document.getElementById('res-landing').textContent = mission.landingBonus;
  document.getElementById('res-fuel').textContent = mission.fuelBonus;
  const q = mission.landing;
  document.getElementById('res-landing-detail').textContent = q
    ? `Centreline ${Math.round(q.centre * 100)}% · Touchdown ${Math.round(q.soft * 100)}% · Speed ${Math.round(q.speedOk * 100)}%`
    : '';
  showScreen('results');
}
function showCrash() {
  document.getElementById('crash-reason').textContent = mission.crashReason ?? 'The Kestrel is down.';
  document.getElementById('crash-score').textContent = mission.score;
  showScreen('crashed');
}

// --- World object shared with the mission and screenshot staging ----------
const world = {
  state,
  mission,
  rings: ringsBuilt.rings,
  checkRing(prevPos, pos) {
    return checkRingPass(ringsBuilt.rings, mission.activeRing, prevPos, pos);
  },
  syncPlane() {
    planeMesh.group.position.copy(state.pos);
    planeMesh.group.rotation.set(0, 0, 0);
    planeMesh.group.rotateY(state.heading);
    planeMesh.group.rotateX(-state.pitch);
    planeMesh.group.rotateZ(-state.roll);
    planeMesh.prop.rotation.z = state.propAngle;
  },
  callbacks: {
    onTakeoff() {
      hud.showMessage('AIRBORNE — fly the gold ring!');
    },
    onRing(pass, m) {
      audio.ring(pass.centred);
      hud.showMessage(pass.centred ? `RING ${m.ringsPassed} — DEAD CENTRE! +${RING_SCORE + 25}` : `RING ${m.ringsPassed}/${m.ringsTotal} +${RING_SCORE}`);
      setActiveRing(ringsBuilt.rings, m.activeRing);
    },
    onFinalApproach() {
      hud.showMessage('ALL RINGS — bring her home, runway ahead!');
      audio.beep(880);
    },
    onLanded(q, m) {
      audio.thud(false);
      hud.showMessage(`TOUCHDOWN — landing ${Math.round(q.total * 100)}%`);
      showResults();
    },
    onTouchdown() {
      audio.thud(false);
    },
    onCrash() {
      audio.thud(true);
      showCrash();
    },
    onStall() {
      // Beep at most once a second so the warning does not stutter.
      const now = performance.now();
      if (!world.lastStallBeep || now - world.lastStallBeep > 1000) {
        world.lastStallBeep = now;
        audio.beep(620);
      }
    },
  },
};

// --- Camera: chase view with speed-sensitive field of view -----------------
const camPos = new THREE.Vector3(0, 20, 40);
function updateCamera(dt) {
  const fwd = forwardVector(state.heading, state.pitch);
  const want = state.pos.clone().addScaledVector(fwd, -15).add(new THREE.Vector3(0, 5, 0));
  // Roll the camera with the aircraft a little, so banks read on screen.
  want.add(new THREE.Vector3(Math.sin(state.roll) * 2.2, 0, 0));
  if (frozen) camPos.copy(want);
  else camPos.lerp(want, 1 - Math.exp(-dt * 5));
  camera.position.copy(camPos);
  camera.lookAt(state.pos.clone().addScaledVector(fwd, 26).add(new THREE.Vector3(0, 1, 0)));
  camera.rotation.z += state.roll * 0.22;
  const targetFov = 62 + Math.max(0, state.speed - 40) * 0.22;
  camera.fov += (targetFov - camera.fov) * dt * 3;
  camera.updateProjectionMatrix();
}

// --- Screenshot staging ----------------------------------------------------
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
if (params.has('trace')) window.__trace = [];
let frozen = false;
if (shotName) {
  const staged = stageShot(shotName, world);
  if (staged.screen === 'title') showScreen('title');
  else if (staged.screen === 'results') showResults();
  else showScreen(null);
  setActiveRing(ringsBuilt.rings, mission.activeRing);
  frozen = true;
} else {
  showScreen('title');
}

// --- Main loop: fixed-step simulation, render every frame -------------------
let accumulator = 0;
let lastTime = performance.now();
let paused = false;
let lowFuelBeeped = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  // Title screen: Enter or click starts the sortie.
  if (mission.phase === PHASES.TITLE) {
    if (input.pressed('Enter')) {
      audio.unlock();
      startSortie(mission);
      showScreen(null);
      hud.showMessage('FULL THROTTLE — rotate at 65 kt!');
    }
  }
  // Restart from the results or the crash screen.
  if (
    (mission.phase === PHASES.RESULTS || mission.phase === PHASES.CRASHED) &&
    input.pressed('KeyR')
  ) {
    resetGame();
  }
  // Pause with P (not while a screenshot is staged).
  if (!shotName && input.pressed('KeyP') && mission.phase !== PHASES.TITLE) {
    if (!frame.pauseLatch) {
      paused = !paused;
      showScreen(paused ? 'pause' : null);
      frame.pauseLatch = true;
      setTimeout(() => { frame.pauseLatch = false; }, 250);
    }
  }

  if (!frozen && !paused && mission.phase !== PHASES.TITLE) {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 5) {
      accumulator -= STEP;
      guard += 1;
      const prevPos = state.pos.clone();
      const controls = input.read();
      const events = stepFlight(state, controls, STEP);
      mission.groundBelow = groundHeight(state.pos.x, state.pos.z);
      stepMission(mission, events, {
        state,
        rings: ringsBuilt.rings,
        prevPos,
        checkRing: (a, b) => world.checkRing(a, b),
        callbacks: world.callbacks,
      });
      if (mission.phase === PHASES.TITLE) break;
    }
    if (state.fuel < 25 && !lowFuelBeeped && state.fuel > 0) {
      lowFuelBeeped = true;
      audio.beep(520);
      hud.showMessage('LOW FUEL — land soon!');
    }
    if (state.fuel > 25) lowFuelBeeped = false;
    audio.update(state.throttle, state.speed * 1.94384, state.airborne);
  }

  world.syncPlane();
  // Windsock and clouds drift with the sim clock, not the wall clock.
  terrain.sock.rotation.y = Math.sin(now * 0.0004) * 0.3;
  terrain.clouds.children.forEach((cloud, i) => {
    cloud.position.x += Math.sin(i * 1.7) * 0.002;
  });
  updateCamera(frozen ? 1 / 60 : dt);
  mission.groundBelow = groundHeight(state.pos.x, state.pos.z);
  hud.update(state, mission);
  renderer.render(scene, camera);
}

function resetGame() {
  const fresh = freshFlightState();
  Object.assign(state, fresh);
  state.pos.copy(fresh.pos);
  Object.assign(mission, createMission());
  ringsBuilt.rings.forEach((r) => { r.passed = false; });
  setActiveRing(ringsBuilt.rings, 0);
  showScreen('title');
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook for headless play-testing (read-only state dump).
window.__game = { state, mission, rings: ringsBuilt.rings };

canvas.addEventListener('pointerdown', () => audio.unlock());
showScreen(mission.phase === PHASES.TITLE ? 'title' : null);
requestAnimationFrame(frame);
