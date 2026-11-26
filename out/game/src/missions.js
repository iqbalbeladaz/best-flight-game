// Meridian Sky Rally — the mission: takeoff, rings, landing, score.
// One clear job: run the sortie's phases and add up the score, so the game
// is a complete flight (not just free flight) with a result worth chasing.
import { PHASES, RINGS, RING_SCORE, RING_CENTER_BONUS, SCORING } from './config.js';
import { landingQuality } from './plane.js';

export function createMission() {
  return {
    phase: PHASES.TITLE,
    phaseLabel: 'READY',
    score: 0,
    elapsed: 0,
    ringsPassed: 0,
    ringsTotal: RINGS.length,
    activeRing: 0,
    groundBelow: 0,
    timeBonus: 0,
    landingBonus: 0,
    fuelBonus: 0,
    ringLog: [],
    landing: null,
    crashReason: null,
    started: false,
  };
}

/**
 * Advance the mission one step. `events` are the flight model's events for
 * this step; `ctx` carries the flight state, the rings and the callbacks the
 * game wires up (onRing, onTakeoff, onLanded, onCrash). Returns nothing; the
 * mission object is updated in place.
 */
export function stepMission(mission, events, ctx) {
  const { state, rings, callbacks } = ctx;

  if (mission.phase === PHASES.TITLE) return;

  if (mission.started) mission.elapsed += 1 / 60;

  for (const event of events) {
    if (event === 'takeoff' && mission.phase === PHASES.TAKEOFF) {
      mission.phase = PHASES.RINGS;
      mission.phaseLabel = 'RING RUN';
      mission.started = true;
      callbacks.onTakeoff();
    }
    if (event === 'stall') callbacks.onStall();
    if (event === 'crash') {
      mission.phase = PHASES.CRASHED;
      mission.phaseLabel = 'CRASHED';
      mission.crashReason = state.onGround
        ? 'Ran off the runway into rough ground.'
        : 'Flew into the terrain.';
      callbacks.onCrash();
    }
    if (event === 'landed') {
      if (mission.phase === PHASES.LANDING) {
        // A real landing ends the sortie: score it.
        const q = landingQuality(state);
        mission.landing = q;
        mission.landingBonus = Math.round(q.total * SCORING.landingMax);
        mission.timeBonus = Math.max(
          0,
          Math.round(SCORING.timeBonusMax * (1 - mission.elapsed / (SCORING.parSeconds * 2))),
        );
        mission.fuelBonus = Math.round(state.fuel * SCORING.fuelBonusPerUnit);
        mission.score += mission.landingBonus + mission.timeBonus + mission.fuelBonus;
        mission.phase = PHASES.RESULTS;
        mission.phaseLabel = 'LANDED';
        callbacks.onLanded(q, mission);
      } else {
        // Touched down early (a bounce on the runway): keep flying.
        callbacks.onTouchdown();
      }
    }
  }

  // Ring pass detection runs every step while the ring run is on.
  if (mission.phase === PHASES.RINGS) {
    const pass = ctx.checkRing(ctx.prevPos, state.pos);
    if (pass) {
      const pts = RING_SCORE + (pass.centred ? RING_CENTER_BONUS : 0);
      mission.score += pts;
      mission.ringsPassed += 1;
      mission.ringLog.push({ ring: mission.activeRing, points: pts, centred: pass.centred });
      mission.activeRing += 1;
      callbacks.onRing(pass, mission);
      if (mission.ringsPassed >= mission.ringsTotal) {
        mission.phase = PHASES.LANDING;
        mission.phaseLabel = 'FINAL APPROACH';
        callbacks.onFinalApproach();
      }
    }
  }

  // Out of fuel in the air with no runway under the nose: it ends in the field.
  if (mission.started && state.fuel <= 0 && !state.onGround && mission.phase !== PHASES.CRASHED) {
    mission.fuelEmptySeconds = (mission.fuelEmptySeconds ?? 0) + 1 / 60;
  }
}

/** Start the sortie from the title screen. */
export function startSortie(mission) {
  mission.phase = PHASES.TAKEOFF;
  mission.phaseLabel = 'TAKEOFF';
  mission.score = 0;
  mission.elapsed = 0;
  mission.ringsPassed = 0;
  mission.activeRing = 0;
  mission.started = false;
  mission.ringLog = [];
  mission.landing = null;
  mission.crashReason = null;
}
