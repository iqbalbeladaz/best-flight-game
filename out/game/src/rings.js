// Meridian Sky Rally — the rally rings.
// One clear job: build the glowing rings from the course definition, light
// the next one, and tell the game when the aircraft flies through one.
import * as THREE from 'three';
import { RINGS, RING_RADIUS } from './config.js';

const GOLD = 0xffb020;
const CYAN = 0x27c4d8;

/** Build one ring mesh: torus + glow sprite + a ground beacon for the next. */
function buildRingMesh(def, index) {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(RING_RADIUS, 1.1, 12, 40),
    new THREE.MeshStandardMaterial({
      color: 0x12333d,
      emissive: CYAN,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4,
    }),
  );
  group.add(torus);
  // A soft halo so the ring reads from far away.
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ringGlowTexture(),
      color: 0x66e0f0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  halo.scale.set(RING_RADIUS * 3.4, RING_RADIUS * 3.4, 1);
  group.add(halo);
  // Beacon: a translucent column from the ground to the ring, for the active one.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.6, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beacon.visible = false;
  group.add(beacon);
  group.position.set(def.x, def.y, def.z);
  // Face the incoming aircraft: the torus's hole must point along the flight
  // direction (sin h, 0, -cos h), so rotate by PI - h, not by h.
  group.rotation.y = Math.PI - (def.heading * Math.PI) / 180;
  group.userData = { index, def, torus, halo, beacon };
  return group;
}

let glowTex = null;
function ringGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Build the course. Returns the group and the per-ring state. */
export function buildRings(scene) {
  const group = new THREE.Group();
  const rings = RINGS.map((def, i) => {
    const mesh = buildRingMesh(def, i);
    group.add(mesh);
    return { def, mesh, passed: false, centreDistance: null };
  });
  scene.add(group);
  return { group, rings };
}

/** Highlight ring `index` as the next target; dim the rest. */
export function setActiveRing(rings, index) {
  rings.forEach((ring, i) => {
    const active = i === index;
    const mat = ring.mesh.userData.torus.material;
    mat.emissive.setHex(active ? GOLD : CYAN);
    mat.emissiveIntensity = active ? 2.4 : 1.1;
    ring.mesh.userData.halo.material.color.setHex(active ? 0xffd27a : 0x66e0f0);
    ring.mesh.userData.halo.material.opacity = active ? 0.55 : 0.3;
    const beacon = ring.mesh.userData.beacon;
    beacon.visible = active;
    if (active) {
      // Stretch the beacon from the terrain up to the ring.
      const h = ring.def.y - 2;
      beacon.scale.y = Math.max(1, h);
      beacon.position.y = -h / 2;
    }
    // Passed rings turn green and stop glowing.
    if (ring.passed) {
      mat.emissive.setHex(0x2aff5a);
      mat.emissiveIntensity = 0.7;
      ring.mesh.userData.halo.material.opacity = 0.12;
    }
  });
}

/**
 * Check the aircraft against the active ring. Returns the ring when the plane
 * crosses its plane within the radius (with the pass offset from centre),
 * or null. Uses the previous position so a fast crossing is never missed.
 */
export function checkRingPass(rings, index, prevPos, pos) {
  if (index < 0 || index >= rings.length) return null;
  const ring = rings[index];
  if (ring.passed) return null;
  const c = new THREE.Vector3(ring.def.x, ring.def.y, ring.def.z);
  // The ring faces along its heading: its plane normal is the approach vector.
  const heading = (ring.def.heading * Math.PI) / 180;
  const normal = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
  const dPrev = prevPos.clone().sub(c).dot(normal);
  const dNow = pos.clone().sub(c).dot(normal);
  // The crossing must go from the approach side to the far side.
  if (!(dPrev < 0 && dNow >= 0)) return null;
  // Where the flight path pierces the ring plane.
  const t = dPrev / (dPrev - dNow);
  const pierce = prevPos.clone().lerp(pos, t);
  const offset = pierce.clone().sub(c);
  offset.sub(normal.clone().multiplyScalar(offset.dot(normal)));
  const distance = offset.length();
  if (distance > RING_RADIUS - 1) return null;
  ring.passed = true;
  ring.centreDistance = distance;
  return { ring, distance, centred: distance <= 5 };
}
