// Meridian Sky Rally — the valley: terrain, runway, river, trees, airfield.
// One clear job: build the world the pilot flies over, and answer the one
// question the flight model keeps asking: how high is the ground at (x, z)?
import * as THREE from 'three';
import { WORLD } from './config.js';
import { fbm, mulberry32 } from './random.js';

const SEED = WORLD.seed;

// Distance from a point to the runway centreline, in metres.
function runwayDistance(x, z) {
  return Math.abs(x - WORLD.runway.x);
}

// The river snakes north-south along the west side of the valley.
function riverCentreX(z) {
  return WORLD.riverX + Math.sin(z * 0.0016) * 90 + Math.sin(z * 0.0042) * 30;
}

/** Ground height in metres at world (x, z). The mesh and the physics share this. */
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  // Rolling hills from fractal noise, a mountain rim near the map edge.
  let h = fbm(x * 0.0016, z * 0.0016, SEED) * 42 + 34;
  const rim = Math.max(0, (r - 950) / 350);
  h += rim * rim * 190;
  // A river valley carved along the river line.
  const riverD = Math.abs(x - riverCentreX(z));
  h -= Math.max(0, 1 - riverD / 110) * 26;
  // The airfield is bulldozed flat so the runway sits level, with a grass
  // overrun past each threshold.
  const dx = Math.max(0, Math.abs(x - WORLD.runway.x) - WORLD.runway.width / 2);
  const dz = Math.max(0, Math.abs(z - WORLD.runway.z) - WORLD.runway.length / 2);
  const dRunway = Math.hypot(dx, dz);
  const flat = smoothstep(170, 60, dRunway);
  h = h * (1 - flat) + 2 * flat;
  return h;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Paint a terrain vertex: grass in the valley, sand by the river, rock on the
// steep slopes, snow on the high rim — one consistent palette for the whole map.
function paintVertex(color, x, z, h, slope) {
  const riverD = Math.abs(x - riverCentreX(z));
  const grass = new THREE.Color(0x5d8a3c);
  const meadow = new THREE.Color(0x7fae4e);
  const sand = new THREE.Color(0xcbb27a);
  const rock = new THREE.Color(0x8a7f72);
  const snow = new THREE.Color(0xeef2f5);
  const n = fbm(x * 0.01 + 3, z * 0.01 + 8, SEED + 5) * 0.5 + 0.5;
  color.copy(grass).lerp(meadow, n);
  if (riverD < 55) color.lerp(sand, smoothstep(55, 18, riverD) * 0.85);
  if (slope > 0.55) color.lerp(rock, smoothstep(0.55, 0.9, slope));
  if (h > 105) color.lerp(snow, smoothstep(105, 150, h));
  // The airfield apron: mown grass around the runway.
  if (Math.abs(x) < 90 && Math.abs(z) < 330) color.lerp(new THREE.Color(0x6f9a45), 0.55);
}

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const blobs = [
    [64, 70, 46], [38, 76, 30], [92, 76, 30], [55, 52, 32], [80, 56, 26],
  ];
  for (const [x, y, r] of blobs) {
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/**
 * Build the whole static world and return it plus the helpers the game needs:
 * the group to add to the scene, the windsock cone to animate, and the runway
 * threshold the landing logic aims at.
 */
export function buildTerrain(scene) {
  const group = new THREE.Group();
  const rng = mulberry32(SEED);

  // --- Sky, sun and fog -------------------------------------------------
  scene.background = new THREE.Color(0x8ec7e8);
  scene.fog = new THREE.Fog(0xa8cfe8, 700, 2400);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5d7a45, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
  sun.position.set(500, 700, -300);
  scene.add(sun);

  // --- Terrain mesh -----------------------------------------------------
  const SIZE = WORLD.size;
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    // Slope from the height a few metres away, for the rock painting.
    const slope = Math.abs(groundHeight(x + 6, z) - h) / 6 + Math.abs(groundHeight(x, z + 6) - h) / 6;
    paintVertex(color, x, z, h, slope);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  group.add(terrain);

  // --- River ------------------------------------------------------------
  const riverPts = [];
  for (let z = -1300; z <= 1300; z += 40) {
    riverPts.push(new THREE.Vector3(riverCentreX(z), groundHeight(riverCentreX(z), z) + 1.2, z));
  }
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverGeo = new THREE.TubeGeometry(riverCurve, 120, 26, 6, false);
  riverGeo.scale(1, 0.18, 1);
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({ color: 0x3f7fb8, roughness: 0.25, metalness: 0.1 }),
  );
  group.add(river);

  // --- Runway -----------------------------------------------------------
  const rw = WORLD.runway;
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(rw.width, 0.4, rw.length),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }),
  );
  asphalt.position.set(rw.x, 2.2, rw.z);
  group.add(asphalt);
  // Centreline dashes and threshold bars, slightly above the asphalt.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (let z = -rw.length / 2 + 30; z < rw.length / 2 - 20; z += 36) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 14), lineMat);
    dash.position.set(rw.x, 2.45, z);
    group.add(dash);
  }
  for (const dz of [-rw.length / 2 + 12, rw.length / 2 - 12]) {
    for (let dx = -9; dx <= 9; dx += 4.5) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 9), lineMat);
      bar.position.set(rw.x + dx, 2.45, dz);
      group.add(bar);
    }
  }
  // Runway edge lights: small amber posts along both edges.
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  for (let z = -rw.length / 2; z <= rw.length / 2; z += 52) {
    for (const dx of [-rw.width / 2 - 2, rw.width / 2 + 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), edgeMat);
      post.position.set(rw.x + dx, 3, z);
      group.add(post);
    }
  }

  // --- Airfield buildings: hangars, tower, windsock ----------------------
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0xb8bfc7, roughness: 0.7, metalness: 0.25 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4f6b8a, roughness: 0.6, metalness: 0.2 });
  const hangarSpots = [
    { x: -58, z: -80, w: 34, d: 26 },
    { x: -58, z: -30, w: 30, d: 22 },
  ];
  for (const s of hangarSpots) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(s.w, 9, s.d), hangarMat);
    base.position.set(s.x, 6.5, s.z);
    group.add(base);
    // Flat roof slab with a slight overhang, plus a teal fascia stripe.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(s.w + 2, 0.8, s.d + 2), roofMat);
    roof.position.set(s.x, 11.4, s.z);
    group.add(roof);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 7, s.d * 0.7),
      new THREE.MeshStandardMaterial({ color: 0x2e4a63, roughness: 0.5, metalness: 0.3 }),
    );
    door.position.set(s.x + s.w / 2 + 0.1, 5.5, s.z);
    group.add(door);
  }
  // Control tower east of the runway.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5.5, 26, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.8 }),
  );
  tower.position.set(46, 15, 40);
  group.add(tower);
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 5, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x274b63, roughness: 0.25, metalness: 0.4 }),
  );
  cab.position.set(46, 30, 40);
  group.add(cab);
  // Windsock on a pole at the runway's south end.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 }),
  );
  pole.position.set(20, 6.5, 210);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2 - 0.25;
  sock.position.set(22.5, 10.6, 210);
  group.add(sock);

  // --- Trees: instanced pines, kept clear of the runway and the river -----
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 5);
  const crownGeo = new THREE.ConeGeometry(3.4, 11, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 1 });
  const COUNT = 420;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, COUNT);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard < 6000) {
    guard += 1;
    const x = (rng() * 2 - 1) * 1250;
    const z = (rng() * 2 - 1) * 1250;
    if (Math.abs(x) < 110 && Math.abs(z) < 340) continue; // airfield clear zone
    if (Math.abs(x - riverCentreX(z)) < 48) continue; // riverbank clear
    if (groundHeight(x, z) > 120) continue; // no trees on the snowy rim
    const h = groundHeight(x, z);
    const scale = 0.8 + rng() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.set(scale, scale, scale);
    m.compose(new THREE.Vector3(x, h + 2 * scale, z), q, s);
    trunks.setMatrixAt(placed, m);
    m.compose(new THREE.Vector3(x, h + (4 + 5.5) * scale, z), q, s);
    crowns.setMatrixAt(placed, m);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  group.add(trunks);
  group.add(crowns);

  // --- Clouds: soft billboard puffs drifting high above the valley -------
  const cloudTex = makeCloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 42; i += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75 + rng() * 0.2, depthWrite: false }),
    );
    sprite.position.set((rng() * 2 - 1) * 1200, 190 + rng() * 120, (rng() * 2 - 1) * 1200);
    const w = 120 + rng() * 160;
    sprite.scale.set(w, w * 0.42, 1);
    clouds.add(sprite);
  }
  group.add(clouds);

  scene.add(group);
  return { group, sock, clouds, runwayDistance };
}
