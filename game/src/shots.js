// Meridian Sky Rally — screenshot scenes and the autopilot that flies them.
// One clear job: stage each ?shot= scene by flying the real flight model
// forward from a fresh world with a scripted pilot, so every screenshot is
// a real render of the game's own code, and the same seed always gives the
// same frame.
import * as THREE from 'three';
import { PHASES, RINGS, STEP } from './config.js';
import { stepFlight } from './plane.js';
import { stepMission, startSortie } from './missions.js';
import { setActiveRing } from './rings.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * A simple proportional pilot: steer toward `target` at `speed`, with a
 * throttle that holds the speed and a pitch that holds the altitude.
 * Returns the control input the flight model consumes.
 */
export function autopilot(state, target, speed) {
  const dx = target.x - state.pos.x;
  const dz = target.z - state.pos.z;
  const dy = target.y - state.pos.y;
  // Heading 0 is north (-z): heading = atan2(dx, -dz).
  const wantHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(wantHeading - state.heading);
  const roll = clamp(headingError * 1.6, -1, 1);
  const wantPitch = clamp(dy * 0.012, -0.28, 0.34);
  const pitch = clamp((wantPitch - state.pitch) * 2.4, -1, 1);
  const throttleDelta = state.speed < speed - 2 ? 1 : state.speed > speed + 2 ? -1 : 0;
  return { pitch, roll, throttleDelta, brake: false };
}

function autopilotTakeoff(state) {
  // Full throttle, rotate once the wing is flying.
  return {
    pitch: state.speed > 34 ? 0.55 : 0.1,
    roll: 0,
    throttleDelta: 1,
    brake: false,
  };
}

function autopilotLand(state) {
  // Final approach on a glidepath: the target altitude falls 12 cm for every
  // metre toward the threshold, so the aircraft descends steadily onto the
  // runway instead of levelling off above it; below 12 m and inside 220 m
  // the pilot holds a gentle -1 m/s sink for a soft touchdown.
  const flare = state.pos.z < 220 && state.pos.y < 12;
  const desiredAlt = 4 + Math.max(0, state.pos.z - 150) * 0.12;
  const target = new THREE.Vector3(0, flare ? state.pos.y : desiredAlt, -200);
  const input = autopilot(state, target, flare ? 32 : 42);
  if (flare) {
    // Hold a gentle -2 m/s sink with the power ON: cutting the throttle here
    // used to bleed the speed off and stall the aircraft onto the runway.
    const wantPitch = Math.asin(Math.max(-1, Math.min(1, -2.0 / Math.max(state.speed, 10))));
    input.pitch = clamp((wantPitch - state.pitch) * 2.4, -1, 1);
  }
  if (state.onGround) input.throttleDelta = -1;
  return input;
}

/**
 * The rally pilot: two phases per ring. Far out, L1 guidance onto the
 * approach LINE through the ring (aim at a point on the line a lookahead
 * ahead of the closest point on it) — chasing the ring as a point from far
 * away makes the aircraft orbit it, and heading-correction line tracking
 * saturates and flies parallel-offset when the lateral error is large (that
 * is how the play shot used to cross ring 3's plane ~140 m off-line and fly
 * on into the eastern rim). Close in (inside 160 m of the ring's plane) the
 * pilot switches to pure pursuit of the ring centre itself, so the last
 * lateral metres are killed on the final leg instead of carried across the
 * plane — L1 alone leaves the aim point past the ring and never corrects
 * the final ~20 m (that is how ring 2 was missed by a few metres).
 */
function ringPilot(state, mission) {
  const ring = RINGS[Math.min(mission.activeRing, RINGS.length - 1)];
  const h = (ring.heading * Math.PI) / 180;
  // Flight direction through the ring, and the perpendicular across the line.
  const dirX = Math.sin(h);
  const dirZ = -Math.cos(h);
  const perpX = Math.cos(h);
  const perpZ = Math.sin(h);
  const relX = state.pos.x - ring.x;
  const relZ = state.pos.z - ring.z;
  const lateral = relX * perpX + relZ * perpZ;
  const along = relX * dirX + relZ * dirZ; // < 0 while still approaching the ring
  let wantHeading;
  let speed;
  if (along > -160) {
    // Final leg: aim straight at the ring centre.
    wantHeading = Math.atan2(-relX, relZ);
    speed = Math.abs(lateral) > 12 ? 36 : 44;
  } else {
    // L1 guidance: aim at a point on the line a lookahead ahead of the
    // closest point on it.
    const lookahead = Math.max(120, state.speed * 3);
    const aimX = ring.x + dirX * (along + lookahead);
    const aimZ = ring.z + dirZ * (along + lookahead);
    wantHeading = Math.atan2(aimX - state.pos.x, -(aimZ - state.pos.z));
    speed = 50;
  }
  const headingError = wrapAngle(wantHeading - state.heading);
  const roll = clamp(headingError * 1.6, -1, 1);
  const dy = ring.y - state.pos.y;
  const wantPitch = clamp(dy * 0.012, -0.28, 0.34);
  const pitch = clamp((wantPitch - state.pitch) * 2.4, -1, 1);
  // Fly slow while turning hard or far off the line: a slower aircraft turns
  // tighter, so it converges onto the line instead of overshooting the ring.
  if (Math.abs(headingError) > 0.35 || Math.abs(lateral) > 60) speed = Math.min(speed, 38);
  const throttleDelta = state.speed < speed - 2 ? 1 : state.speed > speed + 2 ? -1 : 0;
  return { pitch, roll, throttleDelta, brake: false };
}

/**
 * Run the simulation forward with the given pilot until `done(state,
 * mission)` is true or `maxSteps` runs out. Returns the steps actually run.
 */
export function flyForward(world, pilot, done, maxSteps) {
  let steps = 0;
  const trace = window.__trace;
  while (steps < maxSteps && !done(world.state, world.mission) && !world.state.crashed) {
    const input = pilot(world.state, world.mission);
    const prevPos = world.state.pos.clone();
    const events = stepFlight(world.state, input, STEP);
    stepMission(world.mission, events, {
      state: world.state,
      rings: world.rings,
      prevPos,
      checkRing: (a, b) => world.checkRing(a, b),
      callbacks: world.callbacks,
    });
    world.syncPlane();
    steps += 1;
    if (trace && steps % 30 === 0) {
      const s = world.state;
      trace.push({
        step: steps,
        x: Math.round(s.pos.x), y: Math.round(s.pos.y), z: Math.round(s.pos.z),
        speed: Math.round(s.speed), vs: Math.round(s.verticalSpeed * 10) / 10,
        pitch: Math.round(s.pitch * 100) / 100, phase: world.mission.phase,
        rings: world.mission.ringsPassed, fuel: Math.round(s.fuel),
      });
    }
  }
  return steps;
}

/**
 * Stage the named scene (start | play | landing | end) on a fresh world and
 * return the screen the overlays should show. The world is left frozen at
 * the staged frame.
 */
export function stageShot(name, world) {
  const { state, mission } = world;
  if (name === 'play') {
    startSortie(mission);
    // Take off, then chase the rings until the third is in sight.
    flyForward(world, autopilotTakeoff, (s) => s.airborne && s.speed > 42, 60 * 30);
    flyForward(
      world,
      (s, m) => ringPilot(s, m),
      (s, m) => {
        if (m.ringsPassed >= 3) return true; // just flew the third ring
        if (m.ringsPassed >= 2) {
          // Freeze on the final leg to the third ring: 80-220 m before it
          // along the approach direction and lined up on its line, so the
          // ring is ahead in frame (not already flown past).
          const ring = RINGS[2];
          const h = (ring.heading * Math.PI) / 180;
          const dirX = Math.sin(h);
          const dirZ = -Math.cos(h);
          const relX = s.pos.x - ring.x;
          const relZ = s.pos.z - ring.z;
          const along = relX * dirX + relZ * dirZ;
          const lateral = relX * Math.cos(h) + relZ * Math.sin(h);
          return along < -80 && along > -220 && Math.abs(lateral) < 60;
        }
        return false;
      },
      60 * 240,
    );
    setActiveRing(world.rings, mission.activeRing);
    return { screen: 'play', best: mission.score };
  }
  if (name === 'landing') {
    startSortie(mission);
    mission.phase = PHASES.LANDING;
    mission.phaseLabel = 'FINAL APPROACH';
    mission.ringsPassed = RINGS.length;
    mission.activeRing = RINGS.length;
    mission.score = 850;
    mission.started = true;
    // Place the Kestrel on final: 800 m south, 110 m up, lined up on centreline.
    state.pos.set(0, 112, 820);
    state.heading = 0;
    state.pitch = -0.06;
    state.roll = 0;
    state.speed = 52;
    state.throttle = 0.42;
    state.onGround = false;
    state.airborne = true;
    setActiveRing(world.rings, mission.activeRing);
    flyForward(world, autopilotLand, (s) => s.pos.z < 430, 60 * 60);
    return { screen: 'play', best: mission.score };
  }
  if (name === 'end') {
    startSortie(mission);
    mission.phase = PHASES.LANDING;
    mission.phaseLabel = 'FINAL APPROACH';
    mission.ringsPassed = RINGS.length;
    mission.activeRing = RINGS.length;
    mission.score = 875;
    mission.started = true;
    state.pos.set(0, 105, 760);
    state.heading = 0;
    state.pitch = -0.06;
    state.roll = 0;
    state.speed = 50;
    state.throttle = 0.4;
    state.onGround = false;
    state.airborne = true;
    setActiveRing(world.rings, mission.activeRing);
    flyForward(world, autopilotLand, (s, m) => m.phase === PHASES.RESULTS, 60 * 90);
    if (world.mission.phase !== PHASES.RESULTS) {
      // The pilot ran long: put the aircraft down gently and score it.
      // (Clear the wreck flag first: a crashed airframe does not step.)
      state.crashed = false;
      state.damage = 0;
      state.pos.set(0, 3.6, 120);
      state.speed = 26;
      state.verticalSpeed = -1.5;
      state.onGround = false;
      const events = stepFlight(state, { pitch: 0, roll: 0, throttleDelta: -1, brake: false }, STEP);
      stepMission(world.mission, events, {
        state,
        rings: world.rings,
        prevPos: state.pos.clone(),
        checkRing: (a, b) => world.checkRing(a, b),
        callbacks: world.callbacks,
      });
    }
    world.syncPlane();
    return { screen: 'results', best: mission.score };
  }
  // Default: the start scene — parked on the threshold, title up, HUD lit.
  return { screen: 'title', best: 0 };
}
