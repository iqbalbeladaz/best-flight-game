// Meridian Sky Rally — deterministic randomness.
// One clear job: a seeded generator and the value-noise field the terrain,
// the trees and the clouds all sample, so the same seed always builds the
// same valley (and the screenshot scenes always render the same frame).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth interpolation between 0 and 1.
function smooth(t) {
  return t * t * (3 - 2 * t);
}

// A hash of integer lattice coordinates, stable for any (x, z).
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

// 2D value noise in [-1, 1], bilinearly smoothed.
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fz;
}

// Three octaves of value noise, still in roughly [-1, 1].
export function fbm(x, z, seed) {
  return (
    valueNoise(x, z, seed) * 0.55 +
    valueNoise(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 11) * 0.3 +
    valueNoise(x * 4.31 + 13.7, z * 4.31 + 9.4, seed + 23) * 0.15
  );
}
