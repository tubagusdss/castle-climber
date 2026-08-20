/* ============================================================
   CASTLE CLIMBER - a blocky run-and-jump climb up a candy castle
   Three.js r160 (inlined at build time as `THREE`)
   ============================================================ */

// ---------- palette ----------
const C = {
  red:    0xef476f,
  gold:   0xffd166,
  mint:   0x06d6a0,
  sky:    0x4cc9f0,
  grape:  0x9b5de5,
  cream:  0xfff3dc,
  stone:  0xf3e2c0,
  stone2: 0xe3cda1,
  grass:  0x63d471,
  grass2: 0x4aba5c,
  wood:   0x8d5524,
  dark:   0x2b1b4a,
};

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd7ff);
scene.fog = new THREE.Fog(0xa9e2ff, 90, 320);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

// ---------- lights ----------
// warm ground bounce, not green - green bounce turns every cream face olive
scene.add(new THREE.HemisphereLight(0xeaf7ff, 0xd8c3a0, 1.25));
const fill = new THREE.DirectionalLight(0xbfe4ff, 0.42);
fill.position.set(-55, 26, -38);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xfff4dd, 1.35);
sun.position.set(48, 92, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
const S = 70;
sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
sun.shadow.camera.top = S;   sun.shadow.camera.bottom = -S;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

// ============================================================
//  WORLD BUILDING HELPERS
// ============================================================
const solids = [];        // collidable bodies
const solidMeshes = [];   // for camera occlusion rays
const matCache = new Map();

function mat(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.flat ? 1 : 0) + '|' + (opts.opacity ?? 1);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    flatShading: !!opts.flat,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    side: opts.side || THREE.FrontSide,
  });
  matCache.set(key, m);
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Adds a box. `solid:false` for decoration. Returns the mesh. */
function box(w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(boxGeo, mat(color, o));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.y = o.rotY || 0;
  m.castShadow = o.shadow !== false;
  m.receiveShadow = o.shadow !== false;
  scene.add(m);
  if (o.solid !== false) {
    solids.push({ obj: m, hx: w / 2, hy: h / 2, hz: d / 2, rotY: o.rotY || 0, tag: o.tag || null, prev: m.position.clone() });
    solidMeshes.push(m);
  }
  return m;
}

function cyl(rTop, rBot, h, seg, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(color, o));
  m.position.set(x, y, z);
  m.rotation.y = o.rotY || 0;
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ============================================================
//  THE CASTLE
// ============================================================
const TOWER = 11;          // tower is a TOWER x TOWER square prism
const TOWER_TOP = 54;      // roof deck height
const spinners = [];       // decorative rotators
const movers = [];         // moving platforms
const gems = [];
const pads = [];           // bounce pads

// --- ground ---
box(260, 4, 260, 0, -2, 0, C.grass, { shadow: true });
// grass patchwork
for (let i = 0; i < 26; i++) {
  const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 92;
  box(6 + Math.random() * 12, 0.12, 6 + Math.random() * 12,
      Math.cos(a) * r, 0.06, Math.sin(a) * r, C.grass2, { solid: false });
}
// moat-ish courtyard ring
cyl(26, 26, 0.3, 48, 0, 0.16, 0, C.stone, { flat: false }).receiveShadow = true;

// --- central tower: stacked colored bands ---
const bandColors = [0xffe9c4, 0xffc0cb, 0xfff3dc, 0xbfe8ff, 0xfff3dc, 0xd6c8ff, 0xffe9c4];
const BANDS = 7, bandH = TOWER_TOP / BANDS;
for (let i = 0; i < BANDS; i++) {
  box(TOWER, bandH, TOWER, 0, bandH * i + bandH / 2, 0, bandColors[i % bandColors.length]);
  // trim stripe
  box(TOWER + 0.5, 0.5, TOWER + 0.5, 0, bandH * (i + 1), 0, i % 2 ? C.grape : C.red, { solid: false });
}
// windows + banners on the tower faces
for (let i = 1; i < BANDS; i++) {
  const y = bandH * i + bandH * 0.45;
  for (let f = 0; f < 4; f++) {
    const a = f * Math.PI / 2;
    const nx = Math.sin(a), nz = Math.cos(a);
    box(1.5, 2.4, 0.35, nx * (TOWER / 2 + 0.1), y, nz * (TOWER / 2 + 0.1), C.dark, { solid: false, rotY: a });
    box(1.1, 0.9, 0.2, nx * (TOWER / 2 + 0.3), y + 0.5, nz * (TOWER / 2 + 0.3), C.sky, { solid: false, rotY: a });
  }
}

// --- roof deck + battlements + spire ---
box(TOWER + 3, 1.2, TOWER + 3, 0, TOWER_TOP + 0.6, 0, C.stone2, { tag: 'roof' });
for (let i = 0; i < 4; i++) {
  const a = i * Math.PI / 2, r = (TOWER + 3) / 2 - 0.45;
  for (let j = -2; j <= 2; j++) {
    const px = Math.cos(a) * r - Math.sin(a) * j * 1.5;
    const pz = -Math.sin(a) * r - Math.cos(a) * j * 1.5;
    if (Math.abs(j) === 2 && i % 2) continue;
    box(1.0, 1.5, 1.0, px, TOWER_TOP + 1.95, pz, j % 2 ? C.red : C.cream, { solid: false });
  }
}

// --- corner turrets with cone roofs ---
const turretColors = [C.red, C.mint, C.grape, C.gold];
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + i * Math.PI / 2;
  const r = TOWER * 0.72;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = 20 + i * 4;
  cyl(2.1, 2.3, h, 12, x, h / 2, z, C.cream);
  solids.push({ obj: { position: new THREE.Vector3(x, h / 2, z) }, hx: 2.0, hy: h / 2, hz: 2.0, rotY: 0, prev: new THREE.Vector3(x, h / 2, z) });
  cyl(0.01, 3.1, 4.2, 12, x, h + 2.1, z, turretColors[i], { flat: true });
  // pennant
  const pole = cyl(0.09, 0.09, 3, 6, x, h + 5.6, z, 0x6b4b2a); pole.castShadow = false;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), mat(turretColors[(i + 2) % 4], { side: THREE.DoubleSide }));
  flag.position.set(x + 0.9, h + 6.4, z);
  scene.add(flag);
  spinners.push({ obj: flag, wave: true, base: flag.position.clone(), phase: i });
}

// ============================================================
//  SPIRAL STAIRCASE  (courtyard -> the landing)
//  Nothing solid ever overhangs the flight, so you can never bump your
//  head on the level above while climbing.
// ============================================================
const STEPS = 68, STAIR_R = 9.6;
const STAIR_A0 = Math.PI / 2;      // the flight starts on the courtyard side
const STAIR_Y0 = 0.8, STAIR_RISE = 0.4, STAIR_TURNS = 2.15;
const stairA = i => STAIR_A0 + (i / (STEPS - 1)) * STAIR_TURNS * Math.PI * 2;
const stairY = i => STAIR_Y0 + i * STAIR_RISE;

for (let i = 0; i < STEPS; i++) {
  const a = stairA(i), y = stairY(i);
  const x = Math.cos(a) * STAIR_R, z = Math.sin(a) * STAIR_R;
  box(3.4, 0.5, 2.3, x, y, z, i % 2 ? C.stone : C.stone2, { rotY: -a });
  // outer railing posts
  if (i % 3 === 0) {
    const rr = STAIR_R + 1.5;
    box(0.35, 2.0, 0.35, Math.cos(a) * rr, y + 1.1, Math.sin(a) * rr, C.wood, { solid: false });
    box(0.9, 0.35, 0.9, Math.cos(a) * rr, y + 2.2, Math.sin(a) * rr, i % 6 ? C.mint : C.red, { solid: false });
  }
}

// ============================================================
//  THE LANDING - top of the stairs, where the jumping starts
// ============================================================
const LAND_A = stairA(STEPS - 1);
const LAND_TOP = stairY(STEPS - 1) + 0.25;          // flush with the last step
const LAND_R = 12.0;
const LAND_X = Math.cos(LAND_A) * LAND_R, LAND_Z = Math.sin(LAND_A) * LAND_R;

box(8.0, 1.2, 7.0, LAND_X, LAND_TOP - 0.6, LAND_Z, C.stone2, { rotY: -LAND_A });
box(7.0, 0.12, 6.0, LAND_X, LAND_TOP + 0.06, LAND_Z, C.cream, { solid: false, rotY: -LAND_A });
// crenellated parapet around the outer half of the landing
for (let j = -3; j <= 3; j++) {
  const ox = Math.cos(LAND_A) * 3.3 - Math.sin(LAND_A) * j * 1.25;
  const oz = -Math.sin(LAND_A) * 3.3 - Math.cos(LAND_A) * j * 1.25;
  box(1.0, 1.5, 0.9, LAND_X + ox, LAND_TOP + 0.75, LAND_Z + oz,
      j % 2 ? C.cream : C.grape, { solid: false, rotY: -LAND_A });
}
// torches marking the landing
for (const side of [-1, 1]) {
  const tx = LAND_X - Math.sin(LAND_A) * side * 3.2;
  const tz = LAND_Z - Math.cos(LAND_A) * side * 3.2;
  box(0.4, 2.4, 0.4, tx, LAND_TOP + 1.2, tz, C.wood, { solid: false });
  const fire = box(0.9, 1.1, 0.9, tx, LAND_TOP + 2.8, tz, 0xffa62b,
                   { solid: false, shadow: false, emissive: 0x8a3b00 });
  spinners.push({ obj: fire, flicker: true, base: fire.position.clone() });
}

// ============================================================
//  FLOATING JUMP COURSE (landing -> roof)
//  A widening spiral of blocks. Every hop is roughly 6 across and 1.5 up,
//  well inside a single jump; the double jump is the safety net.
// ============================================================
const platColors = [C.red, C.gold, C.mint, C.sky, C.grape];
function platform(x, y, z, w = 5.6, d = 5.6, color = C.mint, o = {}) {
  const top = box(w, 1.0, d, x, y, z, color, o);
  box(w - 0.8, 0.5, d - 0.8, x, y - 0.7, z, C.cream, { solid: false, rotY: o.rotY || 0 });
  return top;
}
function mover(x, y, z, axis, amp, speed, color, rotY) {
  const m = platform(x, y, z, 7.0, 7.0, color, { tag: 'mover', rotY });
  movers.push({ obj: m, base: new THREE.Vector3(x, y, z), axis, amp, speed, phase: Math.random() * 6.28 });
  return m;
}

// Spacing is set from the jump envelope: at RUN_SPEED you cover ~8.7 units in the
// air while rising 1.5, so hops sit at ~8 apart and the platforms are wide enough
// that landing early or late still puts you on deck.
const COURSE_N = 17;
const COURSE_Y0 = LAND_TOP + 1.6, COURSE_Y1 = 53.4;
const coursePts = [];
for (let i = 0; i < COURSE_N; i++) {
  const t = i / (COURSE_N - 1);
  const a = LAND_A + 0.42 + t * 1.45 * Math.PI * 2;
  const r = 12.8 + Math.sin(t * Math.PI) * 2.2;          // bulges outward mid-climb
  coursePts.push({
    x: Math.cos(a) * r,
    y: COURSE_Y0 + t * (COURSE_Y1 - COURSE_Y0),
    z: Math.sin(a) * r,
    rotY: -a,
  });
}
// Movers swing a little, never enough to push the next hop out of reach.
const courseMeshes = coursePts.map((p, i) => {
  const color = platColors[i % platColors.length];
  if (i === 5)  return mover(p.x, p.y, p.z, 'x', 1.6, 0.8, C.gold, p.rotY);
  if (i === 10) return mover(p.x, p.y, p.z, 'z', 1.6, 0.7, C.sky, p.rotY);
  if (i === 14) return mover(p.x, p.y, p.z, 'y', 1.6, 0.55, C.red, p.rotY);
  const w = i % 3 === 0 ? 6.8 : 6.0;
  return platform(p.x, p.y, p.z, w, w, color, { rotY: p.rotY });
});

// --- bounce pads ---
function bouncePad(x, y, z) {
  const base = box(3.2, 0.7, 3.2, x, y, z, C.grape, { tag: 'pad' });
  const top = box(2.6, 0.35, 2.6, x, y + 0.5, z, C.mint, { solid: false, emissive: 0x063b2a });
  pads.push({ x, y, z, top, t: 0 });
  return base;
}
bouncePad(-4.5, 1.0, 22.5);   // off to the side of the run-up, not in the way
bouncePad(-22, 1.0, -8);
// a victory trampoline on the roof deck (a pad mid-course would fling you off it)
bouncePad(4.6, TOWER_TOP + 1.55, 4.6);

// --- courtyard plaza & the walkway that feeds the staircase ---
box(15, 1.2, 15, 0, 0, 20, C.stone2);                 // top at y = 0.6
for (let ix = -3; ix <= 3; ix++) {                     // checkerboard inlay (flat, walk-through)
  for (let iz = -3; iz <= 3; iz++) {
    if ((ix + iz) % 2) continue;
    box(1.9, 0.06, 1.9, ix * 2.0, 0.63, 20 + iz * 2.0, C.cream, { solid: false, shadow: false });
  }
}
box(6.0, 0.7, 7.5, 0, 0.0, 12.6, C.stone);            // walkway, top at y = 0.35
box(6.6, 0.25, 0.9, 0, 0.35, 8.9, C.gold, { solid: false });   // threshold stripe at the stair foot

// --- decorative trees & rocks ---
for (let i = 0; i < 30; i++) {
  const a = Math.random() * Math.PI * 2, r = 32 + Math.random() * 78;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (Math.random() < 0.75) {
    box(0.9, 3.2, 0.9, x, 1.6, z, C.wood, { solid: false });
    const leaf = [0x4ecb71, 0x2fb35a, 0x8ad66b][i % 3];
    box(3.6, 2.6, 3.6, x, 4.0, z, leaf, { solid: false, rotY: Math.random() });
    box(2.4, 2.0, 2.4, x, 5.6, z, leaf, { solid: false, rotY: Math.random() });
  } else {
    box(2.2, 1.6, 2.0, x, 0.7, z, 0xb9b3c9, { solid: false, rotY: Math.random() });
  }
}

// --- clouds ---
for (let i = 0; i < 22; i++) {
  const g = new THREE.Group();
  const n = 3 + (i % 3);
  for (let j = 0; j < n; j++) {
    const s = 3 + Math.random() * 4;
    const p = new THREE.Mesh(boxGeo, mat(0xffffff, { opacity: 0.92 }));
    p.scale.set(s * 1.7, s * 0.8, s * 1.4);
    p.position.set((j - n / 2) * s * 1.1, Math.random() * 1.2, Math.random() * 2);
    g.add(p);
  }
  const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 90;
  g.position.set(Math.cos(a) * r, 22 + Math.random() * 48, Math.sin(a) * r);
  scene.add(g);
  spinners.push({ obj: g, drift: 0.25 + Math.random() * 0.4, base: g.position.clone() });
}

// ============================================================
//  GEMS
// ============================================================
const gemGeo = new THREE.OctahedronGeometry(0.55);
function gem(x, y, z) {
  const m = new THREE.Mesh(gemGeo, mat(C.gold, { emissive: 0x6b4400, flat: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  gems.push({ obj: m, taken: false, base: y });
}
// gems along the stairs
for (let i = 4; i < STEPS; i += 6) {
  const a = stairA(i);
  gem(Math.cos(a) * STAIR_R, stairY(i) + 1.6, Math.sin(a) * STAIR_R);
}
// gems on the course and on the landing
coursePts.forEach(p => gem(p.x, p.y + 1.9, p.z));
gem(LAND_X, LAND_TOP + 1.6, LAND_Z);
gem(-4.5, 3.0, 22.5); gem(-22, 3.0, -8);
gem(4.6, TOWER_TOP + 9.5, 4.6);      // only reachable off the roof trampoline
gem(0, TOWER_TOP + 3.2, 0);
const GEM_TOTAL = gems.length;

// ============================================================
//  GOAL - the crown on the roof
// ============================================================
const goal = new THREE.Group();
goal.position.set(0, TOWER_TOP + 3.4, 0);
const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.9, 10), mat(C.gold, { emissive: 0x6b4400, flat: true }));
goal.add(crownBase);
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 6), mat(C.gold, { emissive: 0x6b4400, flat: true }));
  spike.position.set(Math.cos(a) * 1.35, 1.0, Math.sin(a) * 1.35);
  goal.add(spike);
  const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat(i % 2 ? C.red : C.sky, { emissive: 0x330011, flat: true }));
  jewel.position.set(Math.cos(a) * 1.35, 1.85, Math.sin(a) * 1.35);
  goal.add(jewel);
}
goal.traverse(o => { o.castShadow = true; });
scene.add(goal);
const goalLight = new THREE.PointLight(0xffd166, 2.2, 26, 2);
goalLight.position.set(0, TOWER_TOP + 5, 0);
scene.add(goalLight);

// ============================================================
//  ENEMIES - lumbering monsters and patrolling robots
//  They never block movement; they bump you for a heart and can be
//  punched or kicked off their perch.
// ============================================================
const enemies = [];
let defeated = 0;

const MON  = { skin: 0x7bc950, dark: 0x4f9e2f, belly: 0xd9f2a3, horn: 0xfff3dc, eye: 0xffd166 };
const BOT  = { shell: 0x9aa7b8, dark: 0x6d7c92, trim: 0xef476f, eye: 0x4cc9f0 };

function bodyPart(g, w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(boxGeo, mat(color, o));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** kind: 'monster' | 'robot'. (x, y, z) is where its feet stand. */
function spawnEnemy(kind, x, y, z, o = {}) {
  const g = new THREE.Group();
  const s = o.scale || 1;
  let hp, radius, height;

  if (kind === 'monster') {
    hp = 2; radius = 0.85; height = 1.95;
    bodyPart(g, 1.24, 0.98, 0.98, 0, 0.66, 0, MON.skin);              // body
    bodyPart(g, 0.86, 0.44, 0.20, 0, 0.52, 0.46, MON.belly);          // belly patch
    bodyPart(g, 1.02, 0.56, 0.86, 0, 1.40, 0.04, MON.dark);           // head
    bodyPart(g, 0.20, 0.40, 0.20, -0.30, 1.80, 0, MON.horn);          // horns
    bodyPart(g, 0.20, 0.40, 0.20, 0.30, 1.80, 0, MON.horn);
    bodyPart(g, 0.17, 0.17, 0.09, -0.23, 1.50, 0.45, MON.eye, { emissive: 0x6b5200 });
    bodyPart(g, 0.17, 0.17, 0.09, 0.23, 1.50, 0.45, MON.eye, { emissive: 0x6b5200 });
    for (let i = -1; i <= 1; i++) bodyPart(g, 0.13, 0.17, 0.07, i * 0.25, 1.24, 0.45, 0xfffdf5);  // teeth
    bodyPart(g, 0.44, 0.32, 0.62, -0.34, 0.16, 0.06, MON.dark);       // feet
    bodyPart(g, 0.44, 0.32, 0.62, 0.34, 0.16, 0.06, MON.dark);
    bodyPart(g, 0.30, 0.72, 0.32, -0.78, 0.76, 0, MON.dark);          // arms
    bodyPart(g, 0.30, 0.72, 0.32, 0.78, 0.76, 0, MON.dark);
  } else {
    hp = 3; radius = 0.80; height = 2.30;
    bodyPart(g, 0.30, 0.62, 0.34, -0.28, 0.31, 0, BOT.dark);          // legs
    bodyPart(g, 0.30, 0.62, 0.34, 0.28, 0.31, 0, BOT.dark);
    bodyPart(g, 0.42, 0.14, 0.52, -0.28, 0.07, 0.06, BOT.shell);      // feet
    bodyPart(g, 0.42, 0.14, 0.52, 0.28, 0.07, 0.06, BOT.shell);
    bodyPart(g, 1.00, 0.86, 0.68, 0, 1.06, 0, BOT.shell);             // chassis
    bodyPart(g, 1.04, 0.13, 0.72, 0, 1.06, 0, BOT.trim);              // warning stripe
    bodyPart(g, 0.26, 0.26, 0.10, 0, 0.86, 0.36, BOT.eye, { emissive: 0x0b4a63 });  // core light
    bodyPart(g, 0.76, 0.52, 0.62, 0, 1.72, 0, BOT.dark);              // head
    bodyPart(g, 0.60, 0.17, 0.09, 0, 1.74, 0.33, BOT.eye, { emissive: 0x0b4a63 });  // visor
    bodyPart(g, 0.08, 0.38, 0.08, 0, 2.14, 0, BOT.shell);             // antenna
    bodyPart(g, 0.19, 0.19, 0.19, 0, 2.38, 0, BOT.trim, { emissive: 0x5c0f22 });
    bodyPart(g, 0.26, 0.70, 0.30, -0.66, 1.06, 0, BOT.dark);          // arms
    bodyPart(g, 0.26, 0.70, 0.30, 0.66, 1.06, 0, BOT.dark);
    bodyPart(g, 0.32, 0.24, 0.36, -0.66, 0.62, 0.02, BOT.shell);      // claws
    bodyPart(g, 0.32, 0.24, 0.36, 0.66, 0.62, 0.02, BOT.shell);
  }

  g.scale.setScalar(s);
  g.position.set(x, y, z);
  scene.add(g);

  const e = {
    kind, obj: g, scale: s,
    hp: Math.round(hp * (o.hpMul || 1)), maxHp: Math.round(hp * (o.hpMul || 1)),
    home: new THREE.Vector3(x, y, z),
    radius: radius * s, height: height * s,
    speed: (kind === 'monster' ? 3.2 : 4.0) * (o.speedMul || 1),
    leash: o.leash ?? 4.0,
    detect: o.detect ?? 8.5,
    axis: o.axis || 'x', amp: o.amp ?? 2.2,
    phase: Math.random() * 6.28, bob: Math.random() * 6.28,
    vel: new THREE.Vector3(), hitT: 0, dead: false, respawnT: 0, face: 0,
  };
  enemies.push(e);
  return e;
}

function reviveEnemy(e) {
  e.dead = false;
  e.hp = e.maxHp;
  e.vel.set(0, 0, 0);
  e.obj.position.copy(e.home);
  e.obj.rotation.set(0, 0, 0);
  e.obj.scale.setScalar(e.scale);
  e.obj.visible = true;
}

function updateEnemies(dt, t) {
  const pp = player.pos;
  for (const e of enemies) {
    const g = e.obj;

    if (e.dead) {                       // spin, shrink, then come back later
      e.respawnT -= dt;
      g.rotation.y += dt * 11;
      g.scale.multiplyScalar(Math.max(0, 1 - dt * 3.4));
      if (g.scale.x < 0.02) g.visible = false;
      if (e.respawnT <= 0) reviveEnemy(e);
      continue;
    }

    g.position.addScaledVector(e.vel, dt);          // knockback carry
    e.vel.multiplyScalar(Math.max(0, 1 - 6 * dt));

    const dx = pp.x - g.position.x, dz = pp.z - g.position.z;
    const dy = pp.y - e.home.y;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const hunting = dist < e.detect && dy > -2.2 && dy < 3.4;

    let mx = 0, mz = 0;
    if (hunting && dist > 0.8) {
      mx = dx / dist; mz = dz / dist;
    } else {                                        // patrol around home
      const target = e.home[e.axis] + Math.sin(t * 0.55 + e.phase) * e.amp;
      const tx = e.axis === 'x' ? target : e.home.x;
      const tz = e.axis === 'z' ? target : e.home.z;
      const ax = tx - g.position.x, az = tz - g.position.z;
      const ad = Math.hypot(ax, az);
      if (ad > 0.15) { mx = ax / ad; mz = az / ad; }
    }
    const sp = (hunting ? e.speed : e.speed * 0.5) * dt;
    g.position.x += mx * sp;
    g.position.z += mz * sp;

    // stay tethered to the deck it guards
    const hx = g.position.x - e.home.x, hz = g.position.z - e.home.z;
    const hd = Math.hypot(hx, hz);
    if (hd > e.leash) {
      g.position.x = e.home.x + hx / hd * e.leash;
      g.position.z = e.home.z + hz / hd * e.leash;
      e.vel.multiplyScalar(0.4);
    }

    if (mx || mz) e.face = Math.atan2(mx, mz);
    let turn = e.face - g.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    g.rotation.y += turn * Math.min(1, 9 * dt);

    e.bob += dt * (hunting ? 9 : 4.5);
    g.position.y = e.home.y + Math.abs(Math.sin(e.bob)) * 0.13 * e.scale;
    g.rotation.z = Math.sin(e.bob) * 0.05;

    if (e.hitT > 0) {
      e.hitT -= dt;
      g.scale.setScalar(e.scale * (1 + Math.max(0, e.hitT) * 1.1));
    }

    if (player.invuln <= 0 && !won &&
        dist < e.radius + 0.75 && Math.abs(pp.y - e.home.y) < e.height) hurtPlayer(e);
  }
}


// ---------- repulsor blasts ----------
const bolts = [];
const boltGeo = new THREE.BoxGeometry(0.26, 0.26, 0.85);
const BOLT_SPEED = 44, BOLT_LIFE = 1.1;
const _mz = new THREE.Vector3(), _aim = new THREE.Vector3();

/** Is this point inside any solid block? Used to stop bolts at walls. */
function pointSolid(v) {
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i], cp = s.obj.position;
    const l = toLocal(v.x - cp.x, v.z - cp.z, s.rotY);
    if (Math.abs(l.x) < s.hx && Math.abs(v.y - cp.y) < s.hy && Math.abs(l.z) < s.hz) return true;
  }
  return false;
}

/** The enemy a blast fired right now would home onto, or null. */
function findTarget() {
  const p = player;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const ox = p.pos.x, oy = p.pos.y + 0.25, oz = p.pos.z;
  let best = null, bestDot = 0.86;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.obj.position.x - ox, dz = e.obj.position.z - oz;
    const dy = e.obj.position.y + e.height * 0.55 - oy;
    const d = Math.hypot(dx, dy, dz);
    if (d > 22) continue;
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot > bestDot) { bestDot = dot; best = { e, d, dir: { x: dx / d, y: dy / d, z: dz / d } }; }
  }
  return best;
}

function fireRepulsor() {
  const p = player;
  if (!started || won || p.shootCool > 0) return;
  p.shootCool = 0.26;
  p.shootT = 0.2;
  p.facing = yaw + Math.PI;                       // always fire where the camera looks
  sfx.shoot();

  const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
  _mz.set(p.pos.x + fx * 0.7, p.pos.y + 0.25, p.pos.z + fz * 0.7);   // palm muzzle

  // fire straight ahead, or onto whatever the reticle has locked
  _aim.set(fx, 0, fz);
  const locked = findTarget();
  if (locked) _aim.set(locked.dir.x, locked.dir.y, locked.dir.z);

  const m = new THREE.Mesh(boltGeo, mat(0xbdf3ff, { emissive: 0x2ad4ff }));
  m.position.copy(_mz);
  m.lookAt(_mz.x + _aim.x, _mz.y + _aim.y, _mz.z + _aim.z);
  scene.add(m);
  bolts.push({ obj: m, vel: _aim.clone().multiplyScalar(BOLT_SPEED), life: BOLT_LIFE });
  burst(_mz, 0xbdf3ff, 3, 2.5);
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.obj.position.addScaledVector(b.vel, dt);
    b.obj.scale.z = 1 + Math.sin(clock.elapsedTime * 40) * 0.15;

    let done = b.life <= 0;
    if (!done) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.obj.position.x - b.obj.position.x;
        const dz = e.obj.position.z - b.obj.position.z;
        const dy = e.obj.position.y + e.height * 0.55 - b.obj.position.y;
        if (Math.hypot(dx, dz) < e.radius + 0.7 && Math.abs(dy) < e.height * 0.7) {
          const d = Math.hypot(dx, dz) || 1;
          hitEnemy(e, 'blast', dx / d, dz / d);
          done = true;
          break;
        }
      }
    }
    if (!done && pointSolid(b.obj.position)) {
      burst(b.obj.position, 0xbdf3ff, 5, 3);
      done = true;
    }
    if (done) { scene.remove(b.obj); bolts.splice(i, 1); }
  }
}

// ---------- the player's punch and kick ----------
function attack(kind) {
  const p = player;
  if (!started || won || p.attackT > 0 || p.cool > 0) return;
  p.attackType = kind;
  p.attackDur = kind === 'kick' ? 0.34 : 0.24;
  p.attackT = p.attackDur;
  p.cool = p.attackDur + 0.10;
  // standing still: swing where the camera is pointing
  if (Math.hypot(p.vel.x, p.vel.z) < 1.5) p.facing = yaw + Math.PI;
  sfx.swing(kind);

  const reach = kind === 'kick' ? 2.5 : 2.1;
  const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.obj.position.x - p.pos.x, dz = e.obj.position.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 0.0001;
    if (d > reach + e.radius) continue;
    if (e.obj.position.y - p.pos.y > 2.2 || e.obj.position.y - p.pos.y < -2.8) continue;
    if ((dx / d) * fx + (dz / d) * fz < 0.3) continue;      // must be in front
    hitEnemy(e, kind, dx / d, dz / d);
  }
}

function hitEnemy(e, kind, nx, nz) {
  e.hp -= kind === 'kick' ? 2 : 1;
  e.hitT = 0.2;
  const power = kind === 'kick' ? 11 : kind === 'blast' ? 5 : 7;
  e.vel.set(nx * power, 0, nz * power);
  const at = e.obj.position.clone();
  at.y += e.height * 0.6;
  burst(at, e.kind === 'monster' ? MON.skin : BOT.eye, 10, 6);
  sfx.hit();
  if (e.hp <= 0) {
    e.dead = true;
    e.respawnT = 10;
    defeated++;
    hud.ko.textContent = String(defeated);
    burst(at, C.gold, 18, 9);
    sfx.ko();
    toast(e.kind === 'monster' ? 'Monster down!' : 'Robot scrapped!');
  }
}

function hurtPlayer(e) {
  const p = player;
  p.hp--;
  p.invuln = 1.5;
  const dx = p.pos.x - e.obj.position.x, dz = p.pos.z - e.obj.position.z;
  const d = Math.hypot(dx, dz) || 1;
  p.vel.x = dx / d * 12;
  p.vel.z = dz / d * 12;
  p.vel.y = 10;
  p.grounded = false;
  p.cut = false;
  burst(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), C.red, 12, 6);
  sfx.hurt();
  updateHearts();
  if (p.hp <= 0) {
    p.hp = 3;
    updateHearts();
    respawn(false);
    toast('Knocked out - back to the last block');
  } else {
    toast(e.kind === 'monster' ? 'A monster bumped you!' : 'A robot zapped you!');
  }
}

function updateHearts() {
  for (let i = 0; i < hud.hearts.length; i++) {
    hud.hearts[i].classList.toggle('off', i >= player.hp);
  }
}


// ---------- where they stand guard ----------
spawnEnemy('monster', 9.5, 0, 17.5, { axis: 'x', amp: 3.0, leash: 5.0 });
spawnEnemy('monster', -9.5, 0, 15.0, { axis: 'z', amp: 3.0, leash: 5.0 });
spawnEnemy('monster', 13.5, 0, 27.0, { axis: 'x', amp: 2.4, leash: 4.5 });
spawnEnemy('monster', -7.0, 0, 8.0, { axis: 'z', amp: 2.4, leash: 4.5 });
spawnEnemy('robot', -21.0, 0, -6.0, { axis: 'x', amp: 3.0, leash: 5.0 });

// one on the landing at the top of the stairs
spawnEnemy('robot', LAND_X - Math.sin(LAND_A) * 2.0, LAND_TOP, LAND_Z - Math.cos(LAND_A) * 2.0,
           { axis: 'x', amp: 1.2, leash: 2.2, detect: 7 });

// robots on the three widest course platforms, parked toward the outer edge
for (const i of [3, 6, 12]) {
  const p = coursePts[i];
  const r = Math.hypot(p.x, p.z);
  spawnEnemy('robot', p.x + p.x / r * 1.9, p.y + 0.5, p.z + p.z / r * 1.9,
             { axis: 'x', amp: 1.0, leash: 1.5, detect: 6, speedMul: 0.85 });
}

// the big one guarding the crown
spawnEnemy('robot', -3.8, TOWER_TOP + 1.2, -3.8,
           { scale: 1.45, hpMul: 2, leash: 4.5, detect: 13, amp: 2.5, speedMul: 0.9 });

// ============================================================
//  PLAYER - a brick-built figure in red-and-gold armour
// ============================================================
const HX = 0.55, HY = 1.35, HZ = 0.55;   // collider half-extents
const SPAWN = new THREE.Vector3(0, 2.2, 24);

const SUIT = 0xd62828, SUIT_DARK = 0x9d1c22, PLATE = 0xf2b134, PLATE_LIT = 0xffd166;
const ARC = 0xbdf3ff, ARC_GLOW = 0x1f9ad6, VISOR_GLOW = 0x2c7fa8;
const TORSO_Y = 0.14;                    // rest height of the chest, bobbed while running

const avatar = new THREE.Group();

/** A single brick. */
function brick(w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(boxGeo, mat(color, o));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (o.rotZ) m.rotation.z = o.rotZ;
  if (o.rotX) m.rotation.x = o.rotX;
  return m;
}
/** A round piece - minifig heads, studs, repulsors. */
function round(r, h, seg, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, o.rBot ?? r, h, seg), mat(color, o));
  m.position.set(x, y, z);
  if (o.rotX) m.rotation.x = o.rotX;
  return m;
}

// ---- torso: chest, belt, gold plating and the chest light ----
const torso = new THREE.Group();
torso.position.y = TORSO_Y;
torso.add(brick(1.00, 0.94, 0.58, 0, 0, 0, SUIT));                 // chest block
torso.add(brick(1.06, 0.22, 0.64, 0, -0.42, 0, SUIT_DARK));        // hip flare of the torso
torso.add(brick(0.56, 0.60, 0.08, 0, 0.10, 0.31, PLATE));          // gold breastplate
torso.add(brick(0.90, 0.16, 0.10, 0, -0.14, 0.31, PLATE));         // ab band
torso.add(brick(0.16, 0.70, 0.09, -0.42, 0.02, 0.30, PLATE_LIT));  // side stripes
torso.add(brick(0.16, 0.70, 0.09, 0.42, 0.02, 0.30, PLATE_LIT));
torso.add(round(0.24, 0.07, 12, 0, 0.20, 0.34, PLATE_LIT, { rotX: Math.PI / 2 }));   // reactor bezel
torso.add(round(0.15, 0.09, 12, 0, 0.20, 0.37, ARC, { rotX: Math.PI / 2, emissive: ARC_GLOW }));
torso.add(brick(0.30, 0.20, 0.30, -0.58, 0.34, 0, PLATE));         // shoulder pads
torso.add(brick(0.30, 0.20, 0.30, 0.58, 0.34, 0, PLATE));
torso.add(brick(0.44, 0.30, 0.14, 0, 0.12, -0.32, SUIT_DARK));     // back vent
avatar.add(torso);

// ---- head: helmet cylinder, gold faceplate, glowing slit eyes, top stud ----
const head = new THREE.Group();
head.position.y = 0.98;
head.add(round(0.40, 0.62, 10, 0, 0, 0, SUIT));                    // helmet
head.add(brick(0.54, 0.46, 0.20, 0, -0.02, 0.30, PLATE));          // faceplate
head.add(brick(0.50, 0.10, 0.10, 0, 0.22, 0.34, PLATE_LIT));       // brow ridge
head.add(brick(0.13, 0.08, 0.06, -0.14, 0.06, 0.40, ARC, { emissive: VISOR_GLOW }));   // eye slits
head.add(brick(0.13, 0.08, 0.06, 0.14, 0.06, 0.40, ARC, { emissive: VISOR_GLOW }));
head.add(brick(0.30, 0.16, 0.12, 0, -0.20, 0.34, SUIT_DARK));      // mouth grille
head.add(round(0.17, 0.13, 10, 0, 0.37, 0, SUIT));                 // minifig stud on top
avatar.add(head);

// ---- limbs on pivots so they swing from the shoulder / hip ----
function pivot(obj, x, y) {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  g.add(obj);
  avatar.add(g);
  return g;
}
function buildArm(side) {
  const g = new THREE.Group();
  g.add(brick(0.30, 0.60, 0.34, 0, -0.30, 0, SUIT));               // upper arm
  g.add(brick(0.34, 0.16, 0.38, 0, -0.66, 0, PLATE));              // gauntlet cuff
  g.add(brick(0.28, 0.24, 0.28, 0, -0.84, 0, SUIT_DARK));          // claw hand
  g.add(round(0.10, 0.05, 10, 0, -0.97, 0, ARC, { emissive: ARC_GLOW }));  // palm repulsor
  return g;
}
function buildLeg() {
  const g = new THREE.Group();
  g.add(brick(0.38, 0.42, 0.42, 0, -0.20, 0, SUIT));               // thigh
  g.add(brick(0.42, 0.10, 0.46, 0, -0.42, 0.02, PLATE_LIT));       // knee band
  g.add(brick(0.44, 0.52, 0.56, 0, -0.60, 0.05, PLATE));           // tall gold boot
  g.add(brick(0.46, 0.10, 0.60, 0, -0.82, 0.07, SUIT_DARK));       // sole
  return g;
}
const pArmL = pivot(buildArm(-1), -0.64, 0.50), pArmR = pivot(buildArm(1), 0.64, 0.50);
const pLegL = pivot(buildLeg(), -0.26, -0.50), pLegR = pivot(buildLeg(), 0.26, -0.50);

// hip brick joining the legs
avatar.add(brick(0.74, 0.24, 0.46, 0, -0.44, 0, SUIT_DARK));

// ---- boot thrusters: parented to the legs so the flames track the boots ----
const thrusters = [pLegL, pLegR].map(leg => {
  const t = round(0.15, 0.5, 8, 0, -1.12, 0.05, ARC, { rBot: 0.02, emissive: ARC_GLOW, shadow: false });
  t.visible = false;
  leg.add(t);
  return t;
});

avatar.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
for (const t of thrusters) t.castShadow = false;      // flames should not cast shadows
avatar.position.copy(SPAWN);
scene.add(avatar);

const player = {
  pos: SPAWN.clone(),
  vel: new THREE.Vector3(),
  grounded: false,
  coyote: 0,
  buffer: 0,
  jumps: 0,
  facing: Math.PI,
  standingOn: null,
  animT: 0,
  spin: 0,
  cut: false,
  hp: 3,
  invuln: 0,
  attackT: 0,
  attackDur: 0.24,
  attackType: 'punch',
  cool: 0,
  shootT: 0,
  shootCool: 0,
  safe: SPAWN.clone(),
  safeT: 0,
};

// ============================================================
//  INPUT
// ============================================================
const keys = Object.create(null);
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && !keys[e.code]) player.buffer = 0.16;
  keys[e.code] = true;
  if (e.code === 'KeyR') { player.hp = 3; updateHearts(); respawn(true); }
  if (e.code === 'KeyJ') attack('punch');
  if (e.code === 'KeyK') attack('kick');
  if (e.code === 'KeyL') fireRepulsor();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// yaw 0 puts the camera south of the player, looking north at the tower
let yaw = 0, pitch = 0.28, camDist = 11;
const canvas = renderer.domElement;

function grabPointer() {
  if (isTouch || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
canvas.addEventListener('click', () => { if (started) grabPointer(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) {
    yaw -= e.movementX * 0.0026;
    pitch = clamp(pitch - e.movementY * 0.0022, -0.5, 1.15);
  } else if (dragging) {
    yaw -= e.movementX * 0.005;
    pitch = clamp(pitch - e.movementY * 0.004, -0.5, 1.15);
  }
});
let dragging = false;
canvas.addEventListener('mousedown', e => {
  dragging = true;
  // once the pointer is locked the mouse buttons are free for fighting
  if (document.pointerLockElement === canvas) {
    if (e.button === 2) attack('kick');          // right-click kicks
    else fireRepulsor();                          // left-click fires the repulsor
  }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', () => { dragging = false; });
addEventListener('wheel', e => { camDist = clamp(camDist + Math.sign(e.deltaY) * 0.9, 5, 22); }, { passive: true });

// --- touch: left half = stick, right half = look, button = jump ---
const touch = { stick: null, look: null, dx: 0, dy: 0 };
const stickEl = document.getElementById('stick');
const knobEl = document.getElementById('knob');
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

canvas.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.5 && touch.stick === null) {
      touch.stick = { id: t.identifier, x: t.clientX, y: t.clientY };
      stickEl.style.left = t.clientX + 'px';
      stickEl.style.top = t.clientY + 'px';
      stickEl.classList.add('on');
    } else if (touch.look === null) {
      touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (touch.stick && t.identifier === touch.stick.id) {
      const dx = clamp((t.clientX - touch.stick.x) / 52, -1, 1);
      const dy = clamp((t.clientY - touch.stick.y) / 52, -1, 1);
      touch.dx = dx; touch.dy = dy;
      knobEl.style.transform = `translate(calc(-50% + ${dx * 30}px), calc(-50% + ${dy * 30}px))`;
    } else if (touch.look && t.identifier === touch.look.id) {
      yaw -= (t.clientX - touch.look.x) * 0.008;
      pitch = clamp(pitch - (t.clientY - touch.look.y) * 0.006, -0.5, 1.15);
      touch.look.x = t.clientX; touch.look.y = t.clientY;
    }
  }
}, { passive: true });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (touch.stick && t.identifier === touch.stick.id) {
      touch.stick = null; touch.dx = touch.dy = 0;
      stickEl.classList.remove('on');
      knobEl.style.transform = 'translate(-50%, -50%)';
    }
    if (touch.look && t.identifier === touch.look.id) touch.look = null;
  }
}
canvas.addEventListener('touchend', endTouch, { passive: true });
canvas.addEventListener('touchcancel', endTouch, { passive: true });

const jumpBtn = document.getElementById('jumpBtn');
jumpBtn.addEventListener('touchstart', e => { e.preventDefault(); player.buffer = 0.16; }, { passive: false });
document.getElementById('punchBtn').addEventListener('touchstart', e => { e.preventDefault(); attack('punch'); }, { passive: false });
document.getElementById('kickBtn').addEventListener('touchstart', e => { e.preventDefault(); attack('kick'); }, { passive: false });
document.getElementById('blastBtn').addEventListener('touchstart', e => { e.preventDefault(); fireRepulsor(); }, { passive: false });

// ============================================================
//  SOUND (tiny synth, no assets)
// ============================================================
let actx = null;
function beep(freq, dur, type = 'square', vol = 0.06, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
const sfx = {
  jump:  () => beep(430, 0.14, 'square', 0.05, 260),
  flip:  () => beep(620, 0.16, 'triangle', 0.05, 320),
  land:  () => beep(150, 0.08, 'sine', 0.05, -50),
  gem:   () => { beep(880, 0.08, 'triangle', 0.06); setTimeout(() => beep(1320, 0.12, 'triangle', 0.06), 70); },
  pad:   () => beep(300, 0.22, 'sawtooth', 0.05, 700),
  hurt:  () => beep(220, 0.3, 'sawtooth', 0.05, -140),
  win:   () => [0, 130, 260, 420].forEach((d, i) => setTimeout(() => beep([523, 659, 784, 1047][i], 0.35, 'triangle', 0.07), d)),
  swing: k => beep(k === 'kick' ? 240 : 320, 0.09, 'sawtooth', 0.035, -120),
  shoot: () => { beep(1400, 0.09, 'square', 0.035, -900); setTimeout(() => beep(700, 0.07, 'triangle', 0.03, -400), 30); },
  hit:   () => { beep(180, 0.09, 'square', 0.06, -80); setTimeout(() => beep(90, 0.12, 'sine', 0.05, -40), 40); },
  ko:    () => [660, 495, 330].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'square', 0.05, -60), i * 90)),
};

// ============================================================
//  PARTICLES
// ============================================================
const pGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const particles = [];
function burst(pos, color, n = 14, power = 7) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, mat(color, { emissive: 0x111111 }));
    m.position.copy(pos);
    scene.add(m);
    particles.push({
      obj: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power * 0.9 + 1, (Math.random() - 0.5) * power),
      life: 0.7 + Math.random() * 0.6,
    });
  }
}

// ============================================================
//  COLLISION
// ============================================================
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const _l = { x: 0, z: 0 };
function toLocal(dx, dz, rotY) {
  const Cc = Math.cos(rotY), Ss = Math.sin(rotY);
  _l.x = dx * Cc - dz * Ss;
  _l.z = dx * Ss + dz * Cc;
  return _l;
}

function overlaps(p, s) {
  const cp = s.obj.position;
  const l = toLocal(p.x - cp.x, p.z - cp.z, s.rotY);
  return Math.abs(l.x) < s.hx + HX && Math.abs(p.y - cp.y) < s.hy + HY && Math.abs(l.z) < s.hz + HZ;
}
function overlapsAny(p) {
  for (let i = 0; i < solids.length; i++) if (overlaps(p, solids[i])) return true;
  return false;
}

/** Push the player out of every solid it intersects. Returns collision info. */
function resolveAll(p, vel) {
  let grounded = false, ceiling = false, wall = false, ground = null;
  for (let iter = 0; iter < 3; iter++) {
    let hit = false;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i], cp = s.obj.position;
      const l = toLocal(p.x - cp.x, p.z - cp.z, s.rotY);
      const dy = p.y - cp.y;
      const ox = s.hx + HX - Math.abs(l.x);
      const oy = s.hy + HY - Math.abs(dy);
      const oz = s.hz + HZ - Math.abs(l.z);
      if (ox <= 0 || oy <= 0 || oz <= 0) continue;
      hit = true;
      if (oy <= ox && oy <= oz) {
        // vertical
        if (dy > 0) {
          p.y += oy;
          if (vel.y < 0) vel.y = 0;
          grounded = true; ground = s;
        } else {
          p.y -= oy;
          if (vel.y > 0) vel.y = 0;
          ceiling = true;
        }
      } else {
        // horizontal, resolved in the box's local frame then rotated back
        let lx = 0, lz = 0;
        if (ox < oz) lx = l.x > 0 ? ox : -ox; else lz = l.z > 0 ? oz : -oz;
        const Cc = Math.cos(s.rotY), Ss = Math.sin(s.rotY);
        const wx = lx * Cc + lz * Ss, wz = -lx * Ss + lz * Cc;
        p.x += wx; p.z += wz;
        // kill velocity into the wall
        const len = Math.hypot(wx, wz) || 1;
        const nx = wx / len, nz = wz / len;
        const into = vel.x * nx + vel.z * nz;
        if (into < 0) { vel.x -= nx * into; vel.z -= nz * into; }
        wall = true;
      }
    }
    if (!hit) break;
  }
  return { grounded, ceiling, wall, ground };
}

// ============================================================
//  GAME STATE
// ============================================================
let started = false, won = false, time = 0, collected = 0, falls = 0, devPause = false;
const hud = {
  gems: document.getElementById('gemCount'),
  time: document.getElementById('timeVal'),
  height: document.getElementById('heightVal'),
  fill: document.getElementById('gaugeFill'),
  pip: document.getElementById('gaugePip'),
  toast: document.getElementById('toast'),
  ko: document.getElementById('koCount'),
  cross: document.getElementById('crosshair'),
  lock: document.getElementById('lockon'),
  hearts: Array.from(document.querySelectorAll('#hearts .heart')),
};

function respawn(manual) {
  player.pos.copy(manual ? SPAWN : player.safe);
  player.vel.set(0, 0, 0);
  player.jumps = 0;
  if (!manual) falls++;
  burst(player.pos, C.sky, 12, 5);
  sfx.hurt();
  toast(manual ? 'Back to the courtyard' : 'Whoops! Try again');
}

let toastT = 0;
function toast(msg) {
  hud.toast.textContent = msg;
  hud.toast.classList.add('show');
  toastT = 2.0;
}

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  document.body.classList.add('playing');
  started = true;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  grabPointer();
  toast('Follow the stairs up the tower');
});
document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('winCard').classList.remove('show');
  won = false; time = 0; collected = 0; falls = 0; defeated = 0;
  hud.ko.textContent = '0';
  player.hp = 3; player.invuln = 0; updateHearts();
  for (const e of enemies) reviveEnemy(e);
  gems.forEach(g => { if (g.taken) { g.taken = false; g.obj.visible = true; } });
  hud.gems.textContent = '0';
  player.safe.copy(SPAWN);
  respawn(true);
});

// ============================================================
//  MAIN LOOP
// ============================================================
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
const ray = new THREE.Raycaster();
const camPos = new THREE.Vector3();
const desired = new THREE.Vector3();

const STEP_UP = 0.62;
const _before = new THREE.Vector3(), _preVel = new THREE.Vector3();
const _cand = new THREE.Vector3(), _probe = new THREE.Vector3();

const GRAVITY = 62;
const RUN_SPEED = 13.5;
const ACCEL = 110;
const AIR_ACCEL = 45;
const JUMP_V = 24;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 1 / 24);
  if (started && !won) time += dt;

  // ----- world animation -----
  const t = clock.elapsedTime;
  for (const s of spinners) {
    if (s.drift) {
      s.obj.position.x = s.base.x + Math.sin(t * 0.06 + s.base.z) * 6;
      s.obj.position.y = s.base.y + Math.sin(t * 0.3 + s.base.x) * 0.6;
    } else if (s.wave) {
      s.obj.rotation.y = Math.sin(t * 2 + s.phase) * 0.5;
      s.obj.position.y = s.base.y + Math.sin(t * 3 + s.phase) * 0.06;
    } else if (s.flicker) {
      const k = 0.85 + Math.sin(t * 14 + s.base.x) * 0.15 + Math.random() * 0.08;
      s.obj.scale.set(0.9 * k, 1.1 * k, 0.9 * k);
    }
  }
  goal.rotation.y += dt * 0.9;
  goal.position.y = TOWER_TOP + 3.4 + Math.sin(t * 1.6) * 0.22;
  goalLight.intensity = 2.0 + Math.sin(t * 3) * 0.5;

  moveWorld(t);

  if (started && !devPause) { step(dt); updateEnemies(dt, t); updateBolts(dt); }

  // ----- particles -----
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= 26 * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    p.obj.rotation.x += dt * 6; p.obj.rotation.y += dt * 5;
    const s = clamp(p.life, 0, 1);
    p.obj.scale.setScalar(s);
    if (p.life <= 0) { scene.remove(p.obj); particles.splice(i, 1); }
  }

  // ----- gems -----
  for (const g of gems) {
    if (g.taken) continue;
    g.obj.rotation.y += dt * 2.2;
    g.obj.position.y = g.base + Math.sin(t * 2.4 + g.base) * 0.22;
    if (started && g.obj.position.distanceToSquared(player.pos) < 3.2) {
      g.taken = true; g.obj.visible = false; collected++;
      hud.gems.textContent = String(collected);
      burst(g.obj.position, C.gold, 12, 6);
      sfx.gem();
      // every fifth gem patches the armour back up
      if (collected % 5 === 0 && player.hp < 3) {
        player.hp++;
        updateHearts();
        toast('Armour repaired');
      }
    }
  }

  // ----- bounce pads -----
  for (const p of pads) {
    p.t = Math.max(0, p.t - dt * 3);
    p.top.scale.y = 0.35 * (1 - p.t * 0.6);
    p.top.position.y = p.y + 0.5 - p.t * 0.25;
  }

  // ----- camera -----
  camTarget.set(player.pos.x, player.pos.y + 1.55, player.pos.z);   // aim point sits above the helmet
  const cd = Math.cos(pitch) * camDist;
  desired.set(
    camTarget.x + Math.sin(yaw) * cd,
    camTarget.y + Math.sin(pitch) * camDist + 1.4,
    camTarget.z + Math.cos(yaw) * cd
  );
  // pull in if a wall is between the camera and the player
  const dir = desired.clone().sub(camTarget);
  const dist = dir.length();
  ray.set(camTarget, dir.normalize());
  ray.far = dist;
  const hits = ray.intersectObjects(solidMeshes, false);
  const useDist = hits.length ? Math.max(2.6, hits[0].distance - 0.5) : dist;
  camPos.copy(camTarget).addScaledVector(dir, useDist);
  camera.position.lerp(camPos, 1 - Math.pow(0.0005, dt));
  camera.lookAt(camTarget);

  sun.position.set(player.pos.x + 48, player.pos.y + 92, player.pos.z + 40);
  sun.target.position.copy(player.pos);

  // ----- aim reticle and lock-on marker -----
  updateReticle();

  // ----- HUD -----
  const h = Math.max(0, player.pos.y);
  hud.height.textContent = h.toFixed(0);
  hud.time.textContent = formatTime(time);
  const pct = clamp(h / (TOWER_TOP + 4), 0, 1) * 100;
  hud.fill.style.height = pct + '%';
  hud.pip.style.bottom = pct + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.classList.remove('show'); }

  renderer.render(scene, camera);
}

/** Advances every solid that moves. Kept separate from rendering so the
    physics can be stepped on its own. */
function moveWorld(t) {
  for (const s of solids) s.prev.copy(s.obj.position);
  for (const m of movers) {
    m.obj.position[m.axis] = m.base[m.axis] + Math.sin(t * m.speed * 1.6 + m.phase) * m.amp;
  }
}

const _tv = new THREE.Vector3();
function updateReticle() {
  if (!started || won) {
    hud.lock.classList.remove('on');
    hud.cross.classList.remove('locked');
    return;
  }
  const t = findTarget();
  if (!t) {
    hud.lock.classList.remove('on');
    hud.cross.classList.remove('locked');
    return;
  }
  _tv.set(t.e.obj.position.x, t.e.obj.position.y + t.e.height * 0.55, t.e.obj.position.z);
  _tv.project(camera);
  if (_tv.z > 1) {                       // behind the camera
    hud.lock.classList.remove('on');
    hud.cross.classList.remove('locked');
    return;
  }
  const size = clamp(760 / Math.max(4, t.d), 30, 110);
  hud.lock.style.width = size + 'px';
  hud.lock.style.height = size + 'px';
  hud.lock.style.left = ((_tv.x * 0.5 + 0.5) * innerWidth) + 'px';
  hud.lock.style.top = ((-_tv.y * 0.5 + 0.5) * innerHeight) + 'px';
  hud.lock.classList.add('on');
  hud.cross.classList.add('locked');
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

const wish = new THREE.Vector3();
function step(dt) {
  const p = player;

  // --- desired direction, relative to the camera ---
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (touch.dx || touch.dy) { ix += touch.dx; iz += touch.dy; }
  const mag = Math.hypot(ix, iz);
  if (mag > 1) { ix /= mag; iz /= mag; }

  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // camera forward on the XZ plane
  const rx = -fz, rz = fx;
  wish.set(fx * -iz + rx * ix, 0, fz * -iz + rz * ix);
  const wishLen = wish.length();
  if (wishLen > 0.001) wish.normalize();

  const sprint = keys.ShiftLeft || keys.ShiftRight ? 1.35 : 1;
  const target = RUN_SPEED * sprint * Math.min(1, mag);
  const accel = (p.grounded ? ACCEL : AIR_ACCEL) * dt;

  // accelerate toward the wish velocity
  const tvx = wish.x * target, tvz = wish.z * target;
  p.vel.x += clamp(tvx - p.vel.x, -accel, accel);
  p.vel.z += clamp(tvz - p.vel.z, -accel, accel);

  // friction when idle on the ground
  if (wishLen < 0.01 && p.grounded) {
    const f = Math.max(0, 1 - 12 * dt);
    p.vel.x *= f; p.vel.z *= f;
  }

  // --- jump ---
  p.buffer = Math.max(0, p.buffer - dt);
  p.coyote = Math.max(0, p.coyote - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.attackT = Math.max(0, p.attackT - dt);
  p.cool = Math.max(0, p.cool - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  p.shootCool = Math.max(0, p.shootCool - dt);
  const wantJump = p.buffer > 0 || ((keys.Space) && p.grounded);
  if (wantJump) {
    if (p.grounded || p.coyote > 0) {
      p.vel.y = JUMP_V; p.jumps = 1; p.buffer = 0; p.coyote = 0; p.grounded = false; p.cut = true;
      sfx.jump();
    } else if (p.jumps === 1) {
      p.vel.y = JUMP_V * 0.92; p.jumps = 2; p.buffer = 0; p.spin = 1; p.cut = true;
      burst(new THREE.Vector3(p.pos.x, p.pos.y - 1.2, p.pos.z), C.cream, 8, 4);
      sfx.flip();
    }
  }
  // variable jump height: releasing Space early clips the arc. Only ever applies
  // to a jump the player made - a bounce pad always launches you the full way.
  if (p.vel.y > 0 && p.cut && !keys.Space && !isTouch) p.vel.y -= GRAVITY * 0.9 * dt;

  p.vel.y -= GRAVITY * dt;
  p.vel.y = Math.max(p.vel.y, -70);

  // --- integrate with substeps so we never tunnel through a platform ---
  const moveLen = p.vel.length() * dt;
  const sub = Math.min(6, Math.max(1, Math.ceil(moveLen / 0.4)));
  const sdt = dt / sub;
  const wasGrounded = p.grounded;
  let grounded = false, ground = null;

  for (let i = 0; i < sub; i++) {
    const before = _before.copy(p.pos);
    const preVel = _preVel.copy(p.vel);          // resolveAll eats the velocity we walked in with
    p.pos.addScaledVector(p.vel, sdt);
    const r = resolveAll(p.pos, p.vel);
    if (r.grounded) { grounded = true; ground = r.ground; }

    // Step-up: walked into a stair riser while on the ground? Lift over it.
    if (r.wall && (wasGrounded || grounded) && preVel.y <= 1) {
      const cand = _cand.copy(before).addScaledVector(preVel, sdt);
      cand.y += STEP_UP;
      // it's a step only if the lifted spot is clear AND something solid sits under it
      const probe = _probe.copy(cand);
      probe.y -= STEP_UP * 0.98;
      if (!overlapsAny(cand) && overlapsAny(probe)) {
        p.pos.copy(cand);
        p.vel.x = preVel.x; p.vel.z = preVel.z;  // keep the momentum we came in with
        const r2 = resolveAll(p.pos, p.vel);
        if (r2.grounded) { grounded = true; ground = r2.ground; }
      }
    }
  }

  // --- carried by moving platforms ---
  if (ground && ground.obj.position && ground.prev) {
    p.pos.x += ground.obj.position.x - ground.prev.x;
    p.pos.y += ground.obj.position.y - ground.prev.y;
    p.pos.z += ground.obj.position.z - ground.prev.z;
  }

  if (grounded && !p.grounded && p.vel.y <= 0.1) {
    if (!wasGrounded) { sfx.land(); burst(new THREE.Vector3(p.pos.x, p.pos.y - HY, p.pos.z), C.cream, 6, 3.2); }
  }
  if (grounded) { p.coyote = 0.12; p.jumps = 0; } else if (wasGrounded) { p.coyote = 0.12; }
  p.grounded = grounded;
  p.standingOn = ground;

  // --- bounce pads ---
  if (grounded && ground && ground.tag === 'pad') {
    p.vel.y = JUMP_V * 1.65;
    p.grounded = false; p.jumps = 1; p.cut = false;
    const pad = pads.find(q => Math.abs(q.x - ground.obj.position.x) < 0.1 && Math.abs(q.z - ground.obj.position.z) < 0.1);
    if (pad) pad.t = 1;
    burst(new THREE.Vector3(p.pos.x, p.pos.y - HY, p.pos.z), C.grape, 14, 8);
    sfx.pad();
  }

  // --- safe spot bookkeeping / falling ---
  p.safeT += dt;
  // never checkpoint on a pad or a moving block - it would not be there on return
  if (grounded && p.safeT > 0.35 && ground && ground.tag !== 'pad' && ground.tag !== 'mover') {
    // dropping a long way and hitting something counts as a fall, not a shortcut
    if (p.safe.y - p.pos.y > 9) respawn(false);
    else { p.safe.set(p.pos.x, p.pos.y + 0.2, p.pos.z); p.safeT = 0; }
  }
  if (p.pos.y < -6) respawn(false);

  // --- reaching the crown ---
  if (!won && p.pos.distanceTo(goal.position) < 3.4) winGame();

  // --- avatar transform & animation ---
  avatar.position.copy(p.pos);
  avatar.position.y -= 0.05;

  const hspeed = Math.hypot(p.vel.x, p.vel.z);
  if (hspeed > 0.6) {
    const want = Math.atan2(p.vel.x, p.vel.z);
    let d = want - p.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.facing += d * Math.min(1, 14 * dt);
  }
  avatar.rotation.y = p.facing;

  if (p.spin > 0) {
    p.spin = Math.max(0, p.spin - dt * 2.1);
    avatar.rotation.x = -(1 - p.spin) * Math.PI * 2;
  } else {
    avatar.rotation.x = 0;
  }

  p.animT += dt * (2.2 + hspeed * 0.85);
  if (p.grounded) {
    const sw = Math.sin(p.animT * 2.4) * Math.min(1.0, hspeed / 9);
    pLegL.rotation.x = sw; pLegR.rotation.x = -sw;
    pArmL.rotation.x = -sw * 0.9; pArmR.rotation.x = sw * 0.9;
    pArmL.rotation.z = 0.08; pArmR.rotation.z = -0.08;
    torso.position.y = TORSO_Y + Math.abs(Math.sin(p.animT * 2.4)) * 0.05 * Math.min(1, hspeed / 9);
    thrusters[0].visible = thrusters[1].visible = false;
  } else {
    // repulsor pose: arms swept out and back so the palms point at the ground
    const rising = p.vel.y > 0;
    pArmL.rotation.x = rising ? 0.5 : -0.3;  pArmR.rotation.x = rising ? 0.5 : -0.3;
    pArmL.rotation.z = rising ? 0.40 : 0.85; pArmR.rotation.z = rising ? -0.40 : -0.85;
    pLegL.rotation.x = -0.32; pLegR.rotation.x = 0.16;
    torso.position.y = TORSO_Y;
    const flare = (rising ? 1 : 0.45) * (0.8 + Math.random() * 0.35);
    for (const t of thrusters) {
      t.visible = true;
      const w = 0.85 + flare * 0.25;
      t.scale.set(w, flare * 1.5, w);
      t.position.y = -1.12 - flare * 0.2;
    }
  }

  // firing pose: right arm punched out, palm forward
  if (p.shootT > 0) {
    const s = Math.sin((1 - p.shootT / 0.2) * Math.PI) * 0.35 + 0.65;
    pArmR.rotation.x = -1.55 - s * 0.12;
    pArmR.rotation.z = -0.05;
    pArmL.rotation.x = 0.25;
  }

  // a swing overrides the walk pose
  if (p.attackT > 0) {
    const swing = Math.sin((1 - p.attackT / p.attackDur) * Math.PI);
    if (p.attackType === 'punch') {
      pArmR.rotation.x = -1.75 * swing; pArmR.rotation.z = -0.12 * swing;
      pArmL.rotation.x = 0.5 * swing;
      torso.rotation.y = -0.35 * swing;
    } else {
      pLegR.rotation.x = -1.5 * swing;
      pArmL.rotation.x = -0.9 * swing; pArmL.rotation.z = 0.5 * swing;
      pArmR.rotation.z = -0.7 * swing;
      torso.rotation.y = 0.25 * swing;
    }
  } else {
    torso.rotation.y = 0;
  }

  // blink while the armour is still recovering from a hit
  avatar.visible = p.invuln <= 0 || Math.sin(clock.elapsedTime * 34) > -0.3;
}

function winGame() {
  won = true;
  sfx.win();
  for (let i = 0; i < 5; i++) {
    setTimeout(() => burst(goal.position, [C.red, C.gold, C.mint, C.sky, C.grape][i], 24, 12), i * 130);
  }
  document.getElementById('winTime').textContent = formatTime(time);
  document.getElementById('winGems').textContent = collected + ' / ' + GEM_TOTAL;
  document.getElementById('winFalls').textContent = String(falls);
  document.getElementById('winCard').classList.add('show');
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

document.getElementById('gemTotal').textContent = String(GEM_TOTAL);

// dev handle for tuning / screenshots: open with #dev
if (location.hash.indexOf('dev') >= 0) {
  window.CASTLE = {
    player, camera, scene, gems, solids,
    look(y, p, d) { yaw = y; pitch = p; if (d) camDist = d; },
    warp(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.safe.set(x, y, z); },
    start() { document.getElementById('startBtn').click(); },
    pause(v) { devPause = v !== false; },
    enemies, attack, bolts, shoot: fireRepulsor,
    clearEnemies() { for (const e of enemies) { e.dead = true; e.respawnT = 1e9; e.obj.visible = false; } },
    // live positions, so tests follow the moving platforms rather than their base points
    waypoints() {
      const pts = [{ x: LAND_X, y: LAND_TOP, z: LAND_Z }];
      for (const m of courseMeshes) pts.push({ x: m.position.x, y: m.position.y + 0.5, z: m.position.z });
      const last = courseMeshes[courseMeshes.length - 1].position;
      const edge = (TOWER + 3) / 2 - 1.4;                    // just inside the roof parapet
      const k = Math.max(Math.abs(last.x), Math.abs(last.z)) || 1;
      pts.push({ x: last.x / k * edge, y: TOWER_TOP + 1.2, z: last.z / k * edge });
      return pts;
    },
    // deterministic physics stepping, independent of the render loop
    sim(frames, dt, held) {
      let t = clock.elapsedTime;
      if (held) for (const k of held) keys[k] = true;
      for (let i = 0; i < frames; i++) { t += dt; moveWorld(t); step(dt); }
      if (held) for (const k of held) keys[k] = false;
      const p = player;
      return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
               g: p.grounded, vy: +p.vel.y.toFixed(2),
               speed: +Math.hypot(p.vel.x, p.vel.z).toFixed(2) };
    },
  };
}

tick();
