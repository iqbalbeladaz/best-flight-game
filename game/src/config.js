// Meridian Sky Rally — tuning constants and mission definition.
// One clear job: every number the flight model, the course and the scoring use.
export const WORLD = {
  size: 2600, // terrain spans -1300..1300 m on x and z
  seed: 20261126,
  gravity: 9.81,
  // Runway: north-south strip centred on the origin, 520 m long, 26 m wide.
  runway: { x: 0, z: 0, length: 520, width: 26, heading: 0 },
  riverX: -420,
};

export const PLANE = {
  maxSpeed: 88, // m/s, about 171 kt at full throttle
  cruiseSpeed: 52,
  stallSpeed: 27, // below this the wing stops flying and the nose drops
  accel: 14, // m/s^2 toward the throttle's target speed
  drag: 0.55, // extra decel when the brake is held
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 1.9, // rad/s at full stick
  maxRoll: 1.05, // rad, about 60 degrees of bank
  maxPitchUp: 0.5,
  maxPitchDown: -0.42,
  turnAuthority: 0.92,
  groundClearance: 1.6, // metres of gear above the terrain when parked
};

// The rally course: eight rings out across the valley, then home to the runway.
// Each ring: centre, altitude, and the heading the pilot should be flying when
// they pass it (the torus faces the incoming aircraft).
export const RINGS = [
  { x: 0, z: -420, y: 95, heading: 0 },
  { x: 330, z: -700, y: 120, heading: 35 },
  { x: 640, z: -420, y: 110, heading: 95 },
  { x: 700, z: 60, y: 85, heading: 160 },
  { x: 420, z: 430, y: 130, heading: 205 },
  { x: -60, z: 620, y: 100, heading: 255 },
  { x: -520, z: 380, y: 140, heading: 300 },
  { x: -560, z: -140, y: 90, heading: 340 },
];

export const RING_RADIUS = 16; // metres; the glowing torus the pilot flies through
export const RING_SCORE = 100; // points per ring
export const RING_CENTER_BONUS = 25; // extra when the pass is within 5 m of centre

export const FUEL = {
  capacity: 100,
  burnPerSecond: 0.4, // at full throttle; roughly half that at cruise
  reserveWarning: 25,
};

export const SCORING = {
  timeBonusMax: 300, // full bonus at the par time, fading to zero at twice par
  parSeconds: 210,
  landingMax: 400, // centreline + soft touchdown + on-runway
  fuelBonusPerUnit: 2, // points per unit of fuel left at touchdown
};

export const PHASES = {
  TITLE: 'title',
  TAKEOFF: 'takeoff',
  RINGS: 'rings',
  LANDING: 'landing',
  RESULTS: 'results',
  CRASHED: 'crashed',
};

export const STEP = 1 / 60; // fixed simulation step, seconds
