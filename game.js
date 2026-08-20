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
scene.background = new THREE.Color(0x3b3157);
scene.fog = new THREE.Fog(0x453a63, 70, 300);       // haze up the shaft, colours still read

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);

// ---------- lights ----------
// Indoors: a low warm fill, cool daylight leaking from the windows, and the
// torches (point lights placed with the sconces) doing the real work.
scene.add(new THREE.HemisphereLight(0xfff3dc, 0x554a75, 1.5));
const fill = new THREE.DirectionalLight(0xcfe4ff, 0.7);
fill.position.set(-30, 30, 60);
scene.add(fill);
const lamp = new THREE.PointLight(0xffd6a0, 1.9, 40, 2);
scene.add(lamp);
const sun = new THREE.DirectionalLight(0xffeccd, 0.75);
sun.position.set(28, 60, 46);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 260;
const S = 46;
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
//  THE CASTLE - twenty storeys of galleries around an open central shaft
// ============================================================
const spinners = [];       // torch flames and other decorative animators
const movers = [];         // moving platforms
const gems = [];
const pads = [];           // bounce pads
const doors = [];          // swinging doors, opened by walking up to them

const STONE = 0xc3b598, STONE_D = 0x9d9078, STONE_L = 0xded2b6;
const FLOOR_A = 0xcdbfa2, FLOOR_B = 0xb5a68a;
const WOOD = 0x8d5524, WOOD_D = 0x6b4b2a;
const RUG = 0xb3324f, WINDOW_LIT = 0xdff1ff;

const FLOORS = 20;            // walkways stacked around the shaft
const STOREY = 6.0;           // floor to floor
const VOID = 11;              // half-width of the open shaft
const RING = 21;              // half-width of the building
const SLAB_T = 0.7, WALL_T = 0.8, DOOR_W = 4.4, DOOR_H = 5.0;
const PARAPET = 1.3;
const floorY = n => n * STOREY;
// Each gallery gets its own colour so the shaft reads as a stack of bands.
const BANDS = [
  { wall: 0xf2b8c6, trim: 0xef476f, deck: 0xffe3ea },
  { wall: 0xffd9a0, trim: 0xff9f1c, deck: 0xfff0d6 },
  { wall: 0xc9edb4, trim: 0x06d6a0, deck: 0xe8f8dd },
  { wall: 0xbfe3f7, trim: 0x4cc9f0, deck: 0xe4f4fd },
  { wall: 0xd9c8f5, trim: 0x9b5de5, deck: 0xefe7fb },
  { wall: 0xffe9a8, trim: 0xffd166, deck: 0xfff6dc },
];
const band = n => BANDS[n % BANDS.length];
const TOP_Y = floorY(FLOORS - 1);
const GOAL_Y = TOP_Y + 2.6;

// ------------------------------------------------------------
//  Building blocks
// ------------------------------------------------------------
function slabBox(cx, cz, w, d, top, color) {
  box(w, SLAB_T, d, cx, top - SLAB_T / 2, cz, color);
}
function tiles(cx, cz, w, d, top, a, b) {
  const n = Math.floor(w / 3), m = Math.floor(d / 3);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if ((i + j) % 2) continue;
      box(2.7, 0.06, 2.7, cx - w / 2 + 1.5 + i * 3, top + 0.03, cz - d / 2 + 1.5 + j * 3,
          a, { solid: false, shadow: false });
    }
  }
}
/** Straight wall with optional door openings measured along its length. */
function wall(x1, z1, x2, z2, base, h, color, gaps) {
  const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const start = horizontal ? Math.min(x1, x2) : Math.min(z1, z2);
  const segs = [];
  let cursor = 0;
  for (const g of (gaps || []).slice().sort((a, b) => a.at - b.at)) {
    const from = g.at - g.w / 2, to = g.at + g.w / 2;
    if (from - cursor > 0.02) segs.push([cursor, from]);
    cursor = to;
    const lh = h - DOOR_H, mid = start + g.at;
    if (lh > 0.05) {
      if (horizontal) box(g.w, lh, WALL_T, mid, base + DOOR_H + lh / 2, cz, color);
      else box(WALL_T, lh, g.w, cx, base + DOOR_H + lh / 2, mid, color);
    }
  }
  if (len - cursor > 0.02) segs.push([cursor, len]);
  for (const [a, b] of segs) {
    const segLen = b - a, mid = start + (a + b) / 2;
    if (horizontal) box(segLen, h, WALL_T, mid, base + h / 2, cz, color);
    else box(WALL_T, h, segLen, cx, base + h / 2, mid, color);
  }
}
function swingDoor(hx, hz, w, base, closedAngle, swing) {
  const panel = box(w, DOOR_H - 0.25, 0.3, hx, base + (DOOR_H - 0.25) / 2, hz, WOOD, { tag: 'door' });
  const col = solids[solids.length - 1];
  const trim = new THREE.Mesh(boxGeo, mat(WOOD_D));
  trim.scale.set(1.02 / w, 0.12 / (DOOR_H - 0.25), 1.35);
  trim.position.set(0, 0.28, 0);
  panel.add(trim);
  const d = { mesh: panel, col, hx, hz, w, y: base + (DOOR_H - 0.25) / 2,
              closed: closedAngle, open: closedAngle + swing, a: closedAngle };
  doors.push(d);
  placeDoor(d);
  return d;
}
function placeDoor(d) {
  d.mesh.rotation.y = d.a;
  d.mesh.position.set(d.hx + Math.cos(d.a) * d.w / 2, d.y, d.hz - Math.sin(d.a) * d.w / 2);
  d.col.rotY = d.a;
}
function torch(x, y, z) {
  box(0.24, 0.7, 0.24, x, y, z, WOOD_D, { solid: false, shadow: false });
  const flame = box(0.5, 0.7, 0.5, x, y + 0.6, z, 0xffa62b,
                    { solid: false, shadow: false, emissive: 0x8a3b00 });
  spinners.push({ obj: flame, flicker: true, base: flame.position.clone() });
}
function window_(x, y, z, w, h, rotY) {
  box(w, h, 0.3, x, y, z, 0x6a5a44, { solid: false, rotY });
  box(w - 0.5, h - 0.5, 0.2, x, y, z, WINDOW_LIT, { solid: false, shadow: false, rotY, emissive: 0x7fa6c4 });
}
function pillar(x, z, base, h) {
  box(1.7, 0.4, 1.7, x, base + 0.2, z, STONE_D);
  box(1.3, h - 0.8, 1.3, x, base + h / 2, z, STONE);
  box(1.7, 0.4, 1.7, x, base + h - 0.2, z, STONE_D);
}
function crate(x, y, z, s) {
  box(s, s, s, x, y + s / 2, z, WOOD, { rotY: Math.random() * 0.4 - 0.2 });
  box(s * 1.04, s * 0.12, s * 1.04, x, y + s * 0.75, z, WOOD_D, { solid: false });
}
function barrel(x, y, z) {
  const b = cyl(0.55, 0.48, 1.2, 10, x, y + 0.6, z, WOOD_D);
  solids.push({ obj: b, hx: 0.52, hy: 0.6, hz: 0.52, rotY: 0, prev: b.position.clone() });
  cyl(0.58, 0.58, 0.12, 10, x, y + 0.9, z, 0xc0a060);
}
function table(x, y, z, w, d) {
  box(w, 0.25, d, x, y + 1.15, z, WOOD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(0.22, 1.05, 0.22, x + sx * (w / 2 - 0.4), y + 0.52, z + sz * (d / 2 - 0.4), WOOD_D, { solid: false });
  }
}
function shelf(x, y, z, w, rotY) {
  box(w, 3.4, 0.9, x, y + 1.7, z, WOOD_D, { rotY });
  for (let i = 0; i < 3; i++) {
    box(w - 0.4, 0.5, 0.5, x, y + 0.7 + i * 1.1, z, [0xd15c5c, 0x4f8ac4, 0xd6b04a][i], { solid: false, rotY });
  }
}
function platform(x, y, z, w = 4.0, d = 4.0, color = STONE_L, o = {}) {
  const top = box(w, 0.9, d, x, y - 0.45, z, color, o);
  box(w - 0.7, 0.5, d - 0.7, x, y - 1.1, z, STONE_D, { solid: false, rotY: o.rotY || 0 });
  return top;
}
function mover(x, y, z, axis, amp, speed, color) {
  const m = platform(x, y, z, 4.2, 4.2, color, { tag: 'mover' });
  movers.push({ obj: m, base: m.position.clone(), axis, amp, speed, phase: Math.random() * 6.28 });
  return m;
}
function bouncePad(x, y, z) {
  const base = box(3.0, 0.7, 3.0, x, y + 0.35, z, 0x9b5de5, { tag: 'pad' });
  const top = box(2.4, 0.35, 2.4, x, y + 0.85, z, 0x06d6a0, { solid: false, emissive: 0x063b2a });
  pads.push({ x, y: y + 0.35, z, top, t: 0 });
  return base;
}
const gemGeo = new THREE.OctahedronGeometry(0.55);
function gem(x, y, z) {
  const m = new THREE.Mesh(gemGeo, mat(0xffd166, { emissive: 0x6b4400, flat: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  scene.add(m);
  gems.push({ obj: m, taken: false, base: y });
}

// ------------------------------------------------------------
//  Geometry of one gallery: the walkway ring, its parapet and the
//  flight of stairs that carries you to the floor above. Each flight
//  hangs over the shaft on the next side round, so the climb spirals
//  and the middle of the castle stays open all the way to the roof.
// ------------------------------------------------------------
const SIDES = [
  { ax: 'x', fixed: -1, sign: 1 },   // 0: north side, running east
  { ax: 'z', fixed: 1, sign: 1 },    // 1: east side, running south
  { ax: 'x', fixed: 1, sign: -1 },   // 2: south side, running west
  { ax: 'z', fixed: -1, sign: -1 },  // 3: west side, running north
];
const STAIR_R = VOID - 2.2;          // the flights hang inside the shaft
const STAIR_STEPS = 12, STAIR_RUN = 9.8, STAIR_W = 4.2;

function sidePoint(side, along, radius) {
  const s = SIDES[side];
  return s.ax === 'x'
    ? { x: along, z: s.fixed * radius }
    : { x: s.fixed * radius, z: along };
}

const ASCENTS = ['stairs', 'blocks', 'lift', 'ramp'];
const ascentOf = n => ASCENTS[n % ASCENTS.length];

/** Builds the way up from floor n, returning the ends of the route. */
function buildAscent(n) {
  const side = n % 4, s = SIDES[side], b = band(n);
  const y0 = floorY(n), y1 = floorY(n + 1);
  const kind = ascentOf(n);
  const pts = [];
  const reach = kind === 'lift' ? 3.4 : STAIR_RUN / 2 + 1.6;
  const foot = sidePoint(side, -reach * s.sign, STAIR_R);
  const head = sidePoint(side, reach * s.sign, STAIR_R);
  platform(foot.x, y0, foot.z, s.ax === 'x' ? 3.6 : STAIR_W, s.ax === 'x' ? STAIR_W : 3.6, b.deck);
  platform(head.x, y1, head.z, s.ax === 'x' ? 3.6 : STAIR_W, s.ax === 'x' ? STAIR_W : 3.6, band(n + 1).deck);

  if (kind === 'stairs') {
    const rise = (y1 - y0) / STAIR_STEPS, depth = STAIR_RUN / STAIR_STEPS;
    const from = -STAIR_RUN / 2 * s.sign;
    for (let i = 0; i < STAIR_STEPS; i++) {
      const along = from + s.sign * (i + 0.5) * depth;
      const p = sidePoint(side, along, STAIR_R);
      const y = y0 + rise * (i + 1) - rise / 2;
      box(s.ax === 'x' ? depth + 0.06 : STAIR_W, rise + 0.08, s.ax === 'x' ? STAIR_W : depth + 0.06,
          p.x, y, p.z, i % 2 ? b.deck : b.trim);
    }
  } else if (kind === 'blocks') {
    // four chunky blocks stepping up over the shaft, staggered left and right
    const cnt = 4;
    for (let i = 0; i < cnt; i++) {
      const t = (i + 1) / (cnt + 1);
      const along = (-STAIR_RUN / 2 + t * STAIR_RUN) * s.sign;
      const wob = i % 2 ? 1.5 : -1.5;
      const p = sidePoint(side, along, STAIR_R + wob);
      const y = y0 + (y1 - y0) * t;
      platform(p.x, y, p.z, 4.8, 4.8, i % 2 ? b.trim : band(n + 1).trim);
      pts.push({ x: p.x, y, z: p.z, kind: 'block' });
      if (i === 2) gem(p.x, y + 1.6, p.z);
    }
  } else if (kind === 'lift') {
    // a counterweighted lift: wait for the car, ride it, step off at the top
    const mid = sidePoint(side, 0, STAIR_R);
    const car = platform(mid.x, (y0 + y1) / 2, mid.z, 4.6, 4.6, b.trim, { tag: 'mover' });
    movers.push({ obj: car, base: car.position.clone(), axis: 'y',
                  amp: (y1 - y0) / 2 + 0.55, speed: 0.34, phase: 0 });
    // guide rails and a lamp so it reads as a lift
    for (const o of [-1, 1]) {
      const rail = sidePoint(side, o * 2.6, STAIR_R);
      box(0.35, y1 - y0 + 2.4, 0.35, rail.x, (y0 + y1) / 2 + 0.6, rail.z, 0x6b6b7a, { solid: false });
    }
    box(1.2, 0.3, 1.2, mid.x, y1 + 0.4, mid.z, b.trim, { solid: false, emissive: 0x332200 });
    pts.push({ x: mid.x, y: (y0 + y1) / 2, z: mid.z, kind: 'lift', car });
  } else {
    // a ramp: shallow steps you can run straight up
    const steps = 26, rise = (y1 - y0) / steps, depth = STAIR_RUN / steps;
    const from = -STAIR_RUN / 2 * s.sign;
    for (let i = 0; i < steps; i++) {
      const along = from + s.sign * (i + 0.5) * depth;
      const p = sidePoint(side, along, STAIR_R);
      const y = y0 + rise * (i + 1) - rise / 2;
      box(s.ax === 'x' ? depth + 0.08 : STAIR_W + 0.6, rise + 0.1,
          s.ax === 'x' ? STAIR_W + 0.6 : depth + 0.08, p.x, y, p.z,
          i % 6 < 3 ? b.deck : b.trim);
    }
    // rails so the ramp reads as a ramp
    for (const o of [-1, 1]) {
      const r0 = sidePoint(side, from + s.sign * STAIR_RUN * 0.5, STAIR_R + o * (STAIR_W / 2 + 0.5));
      box(s.ax === 'x' ? STAIR_RUN : 0.3, 0.5, s.ax === 'x' ? 0.3 : STAIR_RUN,
          r0.x, (y0 + y1) / 2 + 0.9, r0.z, b.trim, { solid: false });
    }
  }
  return { side, bottom: foot, top: head, y0, y1, kind, pts, reach };
}

/** Parapet along one side of the shaft, left open where a flight meets it. */
function parapet(n, side, open) {
  const s = SIDES[side];
  const r = VOID;
  const half = VOID;
  const y = floorY(n);
  const segs = open ? [[-half, -8.2], [8.2, half]] : [[-half, half]];   // wide enough for the landings
  const bd = band(n);
  for (const [a, b] of segs) {
    const mid = (a + b) / 2, len = b - a;
    const p = sidePoint(side, mid, r);
    if (s.ax === 'x') {
      box(len, PARAPET, 0.55, p.x, y + PARAPET / 2, p.z, bd.wall);
      box(len, 0.22, 0.75, p.x, y + PARAPET, p.z, bd.trim, { solid: false });
    } else {
      box(0.55, PARAPET, len, p.x, y + PARAPET / 2, p.z, bd.wall);
      box(0.75, 0.22, len, p.x, y + PARAPET, p.z, bd.trim, { solid: false });
    }
  }
}

function buildFloor(n) {
  const y = floorY(n);
  const strip = RING - VOID;
  const b = band(n);
  if (n === 0) {
    slabBox(0, 0, RING * 2, RING * 2, y, b.deck);        // the hall at the bottom of the shaft
    tiles(0, 0, RING * 2, RING * 2, y, b.trim);
  } else {
    slabBox(0, -(VOID + strip / 2), RING * 2, strip, y, b.deck);
    slabBox(0, VOID + strip / 2, RING * 2, strip, y, b.deck);
    slabBox(-(VOID + strip / 2), 0, strip, VOID * 2, y, b.deck);
    slabBox(VOID + strip / 2, 0, strip, VOID * 2, y, b.deck);
  }

  // outer wall with window slits
  const h = STOREY;
  for (let side = 0; side < 4; side++) {
    const s = SIDES[side];
    const gaps = [];
    if (n % 5 === 3 && side === (n + 2) % 4) gaps.push({ at: RING, w: DOOR_W });   // door to a side room
    if (s.ax === 'x') {
      wall(-RING, s.fixed * (RING + WALL_T / 2), RING, s.fixed * (RING + WALL_T / 2), y, h, b.wall, gaps);
      box(RING * 2, 0.5, 0.4, 0, y + h - 0.4, s.fixed * RING, b.trim, { solid: false });
      for (const wx of [-13, 13]) window_(wx, y + 3.0, s.fixed * RING, 2.2, 3.0, 0);
    } else {
      wall(s.fixed * (RING + WALL_T / 2), -RING, s.fixed * (RING + WALL_T / 2), RING, y, h, b.wall, gaps);
      box(0.4, 0.5, RING * 2, s.fixed * RING, y + h - 0.4, 0, b.trim, { solid: false });
      for (const wz of [-13, 13]) window_(s.fixed * RING, y + 3.0, wz, 2.2, 3.0, Math.PI / 2);
    }
  }

  // corner pillars carry the gallery above
  for (const px of [-16.5, 16.5]) for (const pz of [-16.5, 16.5]) pillar(px, pz, y, STOREY);

  // torches on the inner corners
  for (const tx of [-VOID - 1.2, VOID + 1.2]) for (const tz of [-VOID - 1.2, VOID + 1.2]) {
    torch(tx, y + 3.2, tz);
  }

  // banners hung from the gallery lip into the shaft
  if (n > 0) {
    for (const side of [0, 2]) {
      const p = sidePoint(side, side === 0 ? -6.5 : 6.5, VOID - 0.4);
      const bn = box(2.0, 3.4, 0.15, p.x, y - 1.9, p.z, b.trim, { solid: false });
      spinners.push({ obj: bn, wave: true, base: bn.position.clone(), phase: n });
    }
  }

  // parapet around the shaft, open where this floor's flight leaves and
  // where the flight from below arrives
  const leaves = n % 4, arrives = (n + 3) % 4;
  if (n > 0) {                       // the ground floor is solid, it needs no railing
    for (let side = 0; side < 4; side++) {
      parapet(n, side, side === leaves || side === arrives);
    }
  }
}

// ---------- raise the tower ----------
const flights = [];
for (let n = 0; n < FLOORS; n++) {
  buildFloor(n);
  if (n < FLOORS - 1) flights.push(buildAscent(n));
}

// roof over the shaft, with a skylight so the top reads from the ground floor
slabBox(0, 0, RING * 2 + 2, RING * 2 + 2, floorY(FLOORS) + 2, STONE_D);
box(14, 0.3, 14, 0, floorY(FLOORS) + 1.6, 0, WINDOW_LIT, { solid: false, shadow: false, emissive: 0x88b6d8 });
for (let side = 0; side < 4; side++) {
  const s = SIDES[side];
  const p = sidePoint(side, 0, RING + WALL_T / 2);
  if (s.ax === 'x') wall(-RING, p.z, RING, p.z, floorY(FLOORS - 1) + STOREY, 2.6, STONE_D);
  else wall(p.x, -RING, p.x, RING, floorY(FLOORS - 1) + STOREY, 2.6, STONE_D);
}

// ---------- ground floor dressing ----------
table(-7, 0, 8, 7, 2.4); table(7, 0, 8, 7, 2.4);
crate(15, 0, -14, 1.6); crate(16.6, 0, -13.4, 1.3); crate(15.4, 0, -12.2, 1.1);
barrel(-15, 0, 14); barrel(-16.3, 0, 14.6); barrel(-15.6, 0, 12.8);
bouncePad(0, 0, -16);
gem(0, 5.4, -16);

// ---------- per-floor dressing, side rooms, hazards, treasure ----------
for (let n = 0; n < FLOORS; n++) {
  const y = floorY(n);
  const strip = RING - VOID, mid = VOID + strip / 2;

  // a couple of crates or barrels on the walkway
  const c = SIDES[(n + 1) % 4];
  const spot = sidePoint((n + 1) % 4, n % 2 ? 6 : -6, mid);
  if (n % 3 === 0) { crate(spot.x, y, spot.z, 1.5); crate(spot.x + 1.7, y, spot.z, 1.2); }
  else if (n % 3 === 1) { barrel(spot.x, y, spot.z); barrel(spot.x + 1.3, y, spot.z + 0.6); }

  // shelves and a table in the side rooms
  if (n % 5 === 3) {
    const side = (n + 2) % 4;
    const room = sidePoint(side, 0, mid);
    shelf(room.x * 1.15, y, room.z * 1.15, 5.0, SIDES[side].ax === 'x' ? 0 : Math.PI / 2);
    table(room.x * 0.72, y, room.z * 0.72, 4.0, 2.2);
    const dp = sidePoint(side, -DOOR_W / 2, RING + WALL_T / 2);
    if (SIDES[side].ax === 'x') swingDoor(dp.x, dp.z, DOOR_W, y, 0, -1.9);
    else swingDoor(dp.x, dp.z, DOOR_W, y, Math.PI / 2, 1.9);
  }

  // every few floors a shortcut across the shaft, worth a gem
  if (n > 0 && n % 4 === 2) {
    const a = sidePoint(n % 4, 0, VOID - 3.5);
    const b = sidePoint((n + 2) % 4, 0, VOID - 3.5);
    platform(a.x, y, a.z, 3.6, 3.6, 0xb08fd6);
    mover((a.x + b.x) / 2, y, (a.z + b.z) / 2, SIDES[n % 4].ax === 'x' ? 'x' : 'z', 3.0, 0.6, 0xb08fd6);
    platform(b.x, y, b.z, 3.6, 3.6, 0xb08fd6);
    gem((a.x + b.x) / 2, y + 1.6, (a.z + b.z) / 2);
  }

  // a blocker across the walkway: vault it, or squeeze round the end
  if (n > 0 && n % 2 === 0) {
    const side = (n + 3) % 4, s = SIDES[side], mid2 = VOID + (RING - VOID) / 2;
    const p = sidePoint(side, 0, mid2);
    const bb = band(n);
    if (s.ax === 'x') {
      box(1.1, 1.7, 6.4, p.x, y + 0.85, p.z, bb.trim);
      box(1.4, 0.3, 6.8, p.x, y + 1.8, p.z, bb.wall, { solid: false });
    } else {
      box(6.4, 1.7, 1.1, p.x, y + 0.85, p.z, bb.trim);
      box(6.8, 0.3, 1.4, p.x, y + 1.8, p.z, bb.wall, { solid: false });
    }
  }

  // a springboard on some galleries, with a gem hanging over it
  if (n > 0 && n % 4 === 1) {
    const side = (n + 1) % 4, mid3 = VOID + (RING - VOID) / 2;
    const p = sidePoint(side, 5.5, mid3);
    bouncePad(p.x, y, p.z);
    gem(p.x, y + 5.4, p.z);
  }

  // gems: one by the stairs, one out on the walkway
  const g1 = sidePoint(n % 4, 0, VOID + 2.2);
  gem(g1.x, y + 1.6, g1.z);
  const g2 = sidePoint((n + 2) % 4, n % 2 ? 7 : -7, mid);
  gem(g2.x, y + 1.6, g2.z);
}

// ---------- the crown, on a bridge out over the shaft at the very top ----------
const topSide = (FLOORS - 1) % 4;
const bridgeFrom = sidePoint(topSide, 0, VOID);
platform(bridgeFrom.x * 0.62, TOP_Y, bridgeFrom.z * 0.62, 5.0, 5.0, STONE_L);
platform(0, TOP_Y, 0, 7.0, 7.0, STONE_L);
box(9, 0.5, 9, 0, TOP_Y - 1.1, 0, 0xffd166, { solid: false });
for (const a of [0, 1, 2, 3]) {
  const p = sidePoint(a, 0, 3.6);
  box(0.6, 2.4, 0.6, p.x, TOP_Y + 1.2, p.z, STONE_D);
}

const goal = new THREE.Group();
goal.position.set(0, GOAL_Y, 0);
goal.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.9, 10),
                        mat(0xffd166, { emissive: 0x6b4400, flat: true })));
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 6),
                               mat(0xffd166, { emissive: 0x6b4400, flat: true }));
  spike.position.set(Math.cos(a) * 1.35, 1.0, Math.sin(a) * 1.35);
  goal.add(spike);
  const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.26),
                               mat(i % 2 ? 0xef476f : 0x4cc9f0, { emissive: 0x330011, flat: true }));
  jewel.position.set(Math.cos(a) * 1.35, 1.85, Math.sin(a) * 1.35);
  goal.add(jewel);
}
goal.traverse(o => { o.castShadow = true; });
scene.add(goal);
const goalLight = new THREE.PointLight(0xffd166, 2.6, 34, 2);
goalLight.position.set(0, GOAL_Y + 1.5, 0);
scene.add(goalLight);
gem(0, TOP_Y + 1.6, 4.5);
const GEM_TOTAL = gems.length;

// ---------- the way up, for the movement tests ----------
const ROUTE = [];
const WALKWAY_R = VOID + (RING - VOID) / 2;
flights.forEach((f, fi) => {
  const s = SIDES[f.side];
  // step off the gallery onto the deck at the foot of the way up
  const onRamp = sidePoint(f.side, -f.reach * s.sign, WALKWAY_R);
  ROUTE.push({ x: onRamp.x, y: f.y0, z: onRamp.z, kind: 'walk',
               note: 'floor ' + (f.y0 / STOREY) + ' approach' });
  ROUTE.push({ x: f.bottom.x, y: f.y0, z: f.bottom.z, kind: 'walk',
               note: 'floor ' + (f.y0 / STOREY) + ' ' + f.kind + ' foot' });
  for (const p of f.pts) {
    ROUTE.push({ x: p.x, y: p.y, z: p.z, kind: p.kind, car: p.car,
                 note: 'floor ' + (f.y0 / STOREY) + ' ' + p.kind });
  }
  ROUTE.push({ x: f.top.x, y: f.y1, z: f.top.z, kind: 'walk',
               note: 'floor ' + (f.y1 / STOREY) + ' landing' });
  // back onto the gallery, then round the corner toward the next way up
  const offRamp = sidePoint(f.side, f.reach * s.sign, WALKWAY_R);
  ROUTE.push({ x: offRamp.x, y: f.y1, z: offRamp.z, kind: 'walk',
               note: 'floor ' + (f.y1 / STOREY) + ' gallery' });
  const bnext = SIDES[(f.side + 1) % 4];
  const corner = s.ax === 'x'
    ? { x: bnext.fixed * WALKWAY_R, z: s.fixed * WALKWAY_R }
    : { x: s.fixed * WALKWAY_R, z: bnext.fixed * WALKWAY_R };
  ROUTE.push({ x: corner.x, y: f.y1, z: corner.z, kind: 'walk',
               note: 'floor ' + (f.y1 / STOREY) + ' corner' });
});
const shaftEdge = sidePoint(topSide, 0, VOID + 2.2);
ROUTE.push({ x: shaftEdge.x, y: TOP_Y, z: shaftEdge.z, kind: 'walk', note: 'shaft edge' });
ROUTE.push({ x: bridgeFrom.x * 0.62, y: TOP_Y, z: bridgeFrom.z * 0.62, kind: 'block', note: 'crown bridge' });
ROUTE.push({ x: 0, y: TOP_Y, z: 0, kind: 'block', note: 'the crown platform' });

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
    const s = solids[i];
    if (s.off) continue;
    const cp = s.obj.position;
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
  let best = null, bestDot = 0.78;                   // roughly a 38 degree cone
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.obj.position.x - ox, dz = e.obj.position.z - oz;
    const dy = e.obj.position.y + e.height * 0.55 - oy;
    const d = Math.hypot(dx, dy, dz);
    if (d > 28) continue;
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

  // Fire level, straight out from the palm. (Following the camera's sight line
  // sent every unlocked shot into the dirt - the camera looks down at you.)
  _aim.set(fx, 0, fz);
  // A locked bolt is aimed from the palm itself, not down the camera's sight
  // line - the two are a shoulder-width apart, which misses at range.
  const locked = findTarget();
  if (locked) {
    const t = locked.e;
    _aim.set(t.obj.position.x - _mz.x,
             t.obj.position.y + t.height * 0.55 - _mz.y,
             t.obj.position.z - _mz.z).normalize();
  }

  const m = new THREE.Mesh(boltGeo, mat(hero.blast.color, { emissive: hero.blast.glow }));
  m.position.copy(_mz);
  m.lookAt(_mz.x + _aim.x, _mz.y + _aim.y, _mz.z + _aim.z);
  scene.add(m);
  bolts.push({ obj: m, vel: _aim.clone().multiplyScalar(BOLT_SPEED), life: BOLT_LIFE,
               target: locked ? locked.e : null, color: hero.blast.color,
               damage: hero.blast.damage || 1 });
  burst(_mz, hero.blast.color, 3, 2.5);
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;

    // a locked bolt keeps tracking, so a walking enemy cannot simply stroll aside
    if (b.target && !b.target.dead) {
      const t = b.target;
      _aim.set(t.obj.position.x - b.obj.position.x,
               t.obj.position.y + t.height * 0.55 - b.obj.position.y,
               t.obj.position.z - b.obj.position.z);
      if (_aim.lengthSq() > 0.01) {
        _aim.normalize().multiplyScalar(BOLT_SPEED);
        b.vel.lerp(_aim, Math.min(1, 7 * dt));
        b.obj.lookAt(b.obj.position.x + b.vel.x, b.obj.position.y + b.vel.y, b.obj.position.z + b.vel.z);
      }
    }

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
          hitEnemy(e, 'blast', dx / d, dz / d, b.damage);
          done = true;
          break;
        }
      }
    }
    if (!done && pointSolid(b.obj.position)) {
      burst(b.obj.position, b.color, 5, 3);
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

function hitEnemy(e, kind, nx, nz, damage) {
  e.hp -= damage || (kind === 'kick' ? 2 : 1);
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
// Two per gallery: one patrolling the walkway near the stairs, one further round.
for (let n = 0; n < FLOORS; n++) {
  const y = floorY(n), strip = RING - VOID, mid = VOID + strip / 2;
  const nearStairs = sidePoint(n % 4, n % 2 ? 5 : -5, mid);
  const across = sidePoint((n + 2) % 4, n % 2 ? -6 : 6, mid);
  spawnEnemy(n % 2 ? 'robot' : 'monster', nearStairs.x, y, nearStairs.z,
             { axis: SIDES[n % 4].ax, amp: 3.4, leash: 4.6, detect: 9 });
  spawnEnemy(n % 3 ? 'monster' : 'robot', across.x, y, across.z,
             { axis: SIDES[(n + 2) % 4].ax, amp: 3.4, leash: 4.6, detect: 9 });
}
// the big one guarding the crown
spawnEnemy('robot', 2.5, TOP_Y, 2.5,
           { scale: 1.45, hpMul: 2, leash: 3.0, detect: 14, amp: 2.0, speedMul: 0.9 });

// ============================================================
//  PLAYER - a brick-built hero, swappable from the start screen
// ============================================================
const HX = 0.55, HY = 1.35, HZ = 0.55;   // collider half-extents
const SPAWN = new THREE.Vector3(0, 1.4, 16);
const TORSO_Y = 0.14;                    // rest height of the chest, bobbed while running

const SKIN = 0xf2c48d, STEEL = 0xc7ced8, SILVER = 0xe8edf3, LEATHER = 0x7a4a24;

/** A single brick. */
function brick(w, h, d, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(boxGeo, mat(color, o));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (o.rotZ) m.rotation.z = o.rotZ;
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotY) m.rotation.y = o.rotY;
  return m;
}
/** A round piece - minifig heads, studs, discs. */
function round(r, h, seg, x, y, z, color, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, o.rBot ?? r, h, seg), mat(color, o));
  m.position.set(x, y, z);
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  return m;
}

// ------------------------------------------------------------
//  Every hero is the same minifig skeleton in different colours:
//  a torso, a head, two arm pivots and two leg pivots. Only the
//  trimmings and hand props change, so one animation rig drives all.
// ------------------------------------------------------------
function makeFigure(s) {
  const parts = { thrusters: [], cape: null, props: [] };
  const g = new THREE.Group();

  const torso = new THREE.Group();
  torso.position.y = TORSO_Y;
  torso.add(brick(1.00, 0.94, 0.58, 0, 0, 0, s.chest));
  torso.add(brick(1.06, 0.22, 0.64, 0, -0.42, 0, s.belt));
  if (s.shoulders) {
    torso.add(brick(0.30, 0.20, 0.30, -0.58, 0.34, 0, s.shoulders));
    torso.add(brick(0.30, 0.20, 0.30, 0.58, 0.34, 0, s.shoulders));
  }
  if (s.chestArt) s.chestArt(torso);
  g.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.98;
  head.add(round(0.40, 0.62, 10, 0, 0, 0, s.headColor));
  if (s.headArt) s.headArt(head);
  g.add(head);

  const pivot = (obj, x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    p.add(obj);
    g.add(p);
    return p;
  };
  const arm = side => {
    const a = new THREE.Group();
    a.add(brick(0.30, 0.60, 0.34, 0, -0.30, 0, s.armUpper));
    a.add(brick(0.34, 0.16, 0.38, 0, -0.66, 0, s.cuff));
    a.add(brick(0.28, 0.24, 0.28, 0, -0.84, 0, s.glove));
    if (s.palm) a.add(round(0.10, 0.05, 10, 0, -0.97, 0, s.palm.color, { emissive: s.palm.glow }));
    if (s.handProp) s.handProp(a, side, parts);
    return a;
  };
  const leg = () => {
    const l = new THREE.Group();
    l.add(brick(0.38, 0.42, 0.42, 0, -0.20, 0, s.thigh));
    if (s.knee) l.add(brick(0.42, 0.10, 0.46, 0, -0.42, 0.02, s.knee));
    l.add(brick(0.44, 0.52, 0.56, 0, -0.60, 0.05, s.boot));
    l.add(brick(0.46, 0.10, 0.60, 0, -0.82, 0.07, s.sole || s.boot));
    return l;
  };

  parts.torso = torso;
  parts.head = head;
  parts.pArmL = pivot(arm(-1), -0.64, 0.50);
  parts.pArmR = pivot(arm(1), 0.64, 0.50);
  parts.pLegL = pivot(leg(), -0.26, -0.50);
  parts.pLegR = pivot(leg(), 0.26, -0.50);

  g.add(brick(0.74, 0.24, 0.46, 0, -0.44, 0, s.belt));      // hips

  if (s.cape) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.5), mat(s.cape, { side: THREE.DoubleSide }));
    c.position.set(0, 0.05, -0.34);
    g.add(c);
    parts.cape = c;
  }
  if (s.jets) {
    parts.thrusters = [parts.pLegL, parts.pLegR].map(legPivot => {
      const t = round(0.15, 0.5, 8, 0, -1.12, 0.05, s.jets.color,
                      { rBot: 0.02, emissive: s.jets.glow });
      t.visible = false;
      legPivot.add(t);
      return t;
    });
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  for (const t of parts.thrusters) t.castShadow = false;
  parts.group = g;
  return parts;
}

// ---------- the roster ----------
const HEROES = [
  {
    id: 'ironman', name: 'Iron Man', swatch: ['#d62828', '#f2b134', '#bdf3ff'],
    blast: { color: 0xbdf3ff, glow: 0x2ad4ff, damage: 1 },
    spec: {
      chest: 0xd62828, belt: 0x9d1c22, shoulders: 0xf2b134, headColor: 0xd62828,
      armUpper: 0xd62828, cuff: 0xf2b134, glove: 0x9d1c22,
      thigh: 0xd62828, knee: 0xffd166, boot: 0xf2b134, sole: 0x9d1c22,
      palm: { color: 0xbdf3ff, glow: 0x1f9ad6 },
      jets: { color: 0xbdf3ff, glow: 0x1f9ad6 },
      chestArt(t) {
        t.add(brick(0.56, 0.60, 0.08, 0, 0.10, 0.31, 0xf2b134));
        t.add(brick(0.90, 0.16, 0.10, 0, -0.14, 0.31, 0xf2b134));
        t.add(brick(0.16, 0.70, 0.09, -0.42, 0.02, 0.30, 0xffd166));
        t.add(brick(0.16, 0.70, 0.09, 0.42, 0.02, 0.30, 0xffd166));
        t.add(round(0.24, 0.07, 12, 0, 0.20, 0.34, 0xffd166, { rotX: Math.PI / 2 }));
        t.add(round(0.15, 0.09, 12, 0, 0.20, 0.37, 0xbdf3ff, { rotX: Math.PI / 2, emissive: 0x1f9ad6 }));
        t.add(brick(0.44, 0.30, 0.14, 0, 0.12, -0.32, 0x9d1c22));
      },
      headArt(h) {
        h.add(brick(0.54, 0.46, 0.20, 0, -0.02, 0.30, 0xf2b134));
        h.add(brick(0.50, 0.10, 0.10, 0, 0.22, 0.34, 0xffd166));
        h.add(brick(0.13, 0.08, 0.06, -0.14, 0.06, 0.40, 0xbdf3ff, { emissive: 0x2c7fa8 }));
        h.add(brick(0.13, 0.08, 0.06, 0.14, 0.06, 0.40, 0xbdf3ff, { emissive: 0x2c7fa8 }));
        h.add(brick(0.30, 0.16, 0.12, 0, -0.20, 0.34, 0x9d1c22));
        h.add(round(0.17, 0.13, 10, 0, 0.37, 0, 0xd62828));
      },
    },
  },
  {
    id: 'spiderman', name: 'Spider-Man', swatch: ['#e63946', '#2b5fd9', '#1b1240'],
    blast: { color: 0xffffff, glow: 0x9fb3c8, damage: 1 },
    spec: {
      chest: 0xe63946, belt: 0x2b5fd9, headColor: 0xe63946,
      armUpper: 0x2b5fd9, cuff: 0x2b5fd9, glove: 0xe63946,
      thigh: 0x2b5fd9, knee: 0x2b5fd9, boot: 0xe63946, sole: 0xb4232f,
      chestArt(t) {
        // black spider on the chest plus a few web lines
        t.add(brick(0.22, 0.26, 0.06, 0, 0.18, 0.31, 0x1b1240));
        t.add(brick(0.46, 0.06, 0.05, 0, 0.30, 0.31, 0x1b1240));
        t.add(brick(0.46, 0.06, 0.05, 0, 0.06, 0.31, 0x1b1240));
        t.add(brick(0.05, 0.74, 0.05, -0.24, 0.06, 0.31, 0x1b1240));
        t.add(brick(0.05, 0.74, 0.05, 0.24, 0.06, 0.31, 0x1b1240));
        t.add(brick(0.86, 0.05, 0.05, 0, -0.24, 0.31, 0x1b1240));
      },
      headArt(h) {
        // big white lenses with dark rims
        h.add(brick(0.26, 0.19, 0.06, -0.15, 0.05, 0.39, 0x1b1240));
        h.add(brick(0.26, 0.19, 0.06, 0.15, 0.05, 0.39, 0x1b1240));
        h.add(brick(0.21, 0.14, 0.05, -0.15, 0.05, 0.42, 0xffffff));
        h.add(brick(0.21, 0.14, 0.05, 0.15, 0.05, 0.42, 0xffffff));
        h.add(brick(0.05, 0.50, 0.05, 0, 0.02, 0.40, 0x1b1240));      // web seam
        h.add(brick(0.60, 0.05, 0.05, 0, 0.24, 0.38, 0x1b1240));
        h.add(round(0.17, 0.13, 10, 0, 0.37, 0, 0xe63946));
      },
    },
  },
  {
    id: 'captain', name: 'Captain America', swatch: ['#2b5fd9', '#ffffff', '#e63946'],
    blast: { color: 0xdce9ff, glow: 0x3a6fd8, damage: 1 },
    spec: {
      chest: 0x2b5fd9, belt: 0x8d5524, shoulders: 0x2b5fd9, headColor: 0x2b5fd9,
      armUpper: 0x2b5fd9, cuff: 0x2b5fd9, glove: 0xe63946,
      thigh: 0x2b5fd9, knee: 0x2b5fd9, boot: 0xe63946, sole: 0xb4232f,
      chestArt(t) {
        t.add(round(0.20, 0.06, 5, 0, 0.22, 0.32, 0xffffff, { rotX: Math.PI / 2 }));   // star
        for (let i = 0; i < 3; i++) {                                                  // belly stripes
          t.add(brick(0.92, 0.10, 0.06, 0, -0.06 - i * 0.14, 0.31, i % 2 ? 0xffffff : 0xe63946));
        }
      },
      headArt(h) {
        h.add(brick(0.46, 0.30, 0.14, 0, -0.12, 0.32, SKIN));           // face opening
        h.add(brick(0.11, 0.07, 0.06, -0.12, -0.04, 0.39, 0x1b1240));   // eyes
        h.add(brick(0.11, 0.07, 0.06, 0.12, -0.04, 0.39, 0x1b1240));
        h.add(brick(0.16, 0.20, 0.08, -0.36, 0.14, 0.20, 0xffffff));    // cowl wings
        h.add(brick(0.16, 0.20, 0.08, 0.36, 0.14, 0.20, 0xffffff));
        h.add(brick(0.14, 0.18, 0.05, 0, 0.20, 0.38, 0xffffff));        // the A
        h.add(round(0.17, 0.13, 10, 0, 0.37, 0, 0x2b5fd9));
      },
      handProp(a, side, parts) {
        if (side !== -1) return;                                        // shield on the left arm
        const shield = new THREE.Group();
        shield.position.set(-0.22, -0.80, 0.04);
        shield.rotation.z = 0.25;
        shield.add(round(0.46, 0.09, 16, 0, 0, 0, 0xe63946, { rotX: Math.PI / 2 }));
        shield.add(round(0.34, 0.11, 16, 0, 0, 0.02, 0xffffff, { rotX: Math.PI / 2 }));
        shield.add(round(0.23, 0.12, 16, 0, 0, 0.03, 0xe63946, { rotX: Math.PI / 2 }));
        shield.add(round(0.15, 0.13, 16, 0, 0, 0.04, 0x2b5fd9, { rotX: Math.PI / 2 }));
        shield.add(round(0.09, 0.14, 5, 0, 0, 0.05, 0xffffff, { rotX: Math.PI / 2 }));
        a.add(shield);
        parts.props.push(shield);
      },
    },
  },
  {
    id: 'wondergirl', name: 'Wonder Girl', swatch: ['#e63946', '#ffd166', '#2b5fd9'],
    blast: { color: 0xffd166, glow: 0xc8871a, damage: 1 },
    spec: {
      chest: 0xe63946, belt: 0xffd166, headColor: SKIN,
      armUpper: SKIN, cuff: SILVER, glove: SKIN,
      thigh: 0x2b5fd9, knee: 0x2b5fd9, boot: 0xe63946, sole: 0xb4232f,
      chestArt(t) {
        t.add(brick(0.26, 0.16, 0.07, 0, 0.16, 0.31, 0xffd166));        // eagle body
        t.add(brick(0.62, 0.09, 0.06, 0, 0.24, 0.31, 0xffd166));        // wings
        t.add(brick(0.40, 0.08, 0.06, 0, 0.06, 0.31, 0xffd166));
        t.add(brick(1.02, 0.10, 0.62, 0, -0.30, 0, 0xffd166));          // gold belt line
        for (const x of [-0.32, 0, 0.32]) t.add(brick(0.10, 0.10, 0.06, x, -0.46, 0.33, 0xffffff));  // stars
      },
      headArt(h) {
        h.add(round(0.43, 0.30, 10, 0, 0.18, 0, 0x2b1b1a));             // hair cap
        h.add(brick(0.62, 0.62, 0.30, 0, -0.02, -0.28, 0x2b1b1a));      // hair down the back
        h.add(round(0.42, 0.10, 10, 0, 0.10, 0, 0xffd166));             // tiara band
        h.add(brick(0.13, 0.13, 0.06, 0, 0.10, 0.40, 0xe63946));        // tiara star
        h.add(brick(0.11, 0.08, 0.06, -0.13, -0.04, 0.39, 0x1b1240));   // eyes
        h.add(brick(0.11, 0.08, 0.06, 0.13, -0.04, 0.39, 0x1b1240));
        h.add(brick(0.20, 0.06, 0.05, 0, -0.20, 0.39, 0xb4232f));       // smile
      },
      handProp(a, side, parts) {
        if (side !== 1) return;                                          // lasso coil on the right
        const lasso = round(0.17, 0.07, 12, 0, -0.98, 0.02, 0xffd166, { rotX: Math.PI / 2, emissive: 0x6b4400 });
        a.add(lasso);
        parts.props.push(lasso);
      },
    },
  },
  {
    id: 'thor', name: 'Thor', swatch: ['#c7ced8', '#e63946', '#3b4a63'],
    blast: { color: 0xdff3ff, glow: 0x4aa8ff, damage: 2 },
    spec: {
      chest: 0x3b4a63, belt: LEATHER, shoulders: STEEL, headColor: SKIN, cape: 0xe63946,
      armUpper: 0x3b4a63, cuff: STEEL, glove: 0x2c3547,
      thigh: 0x2c3547, knee: STEEL, boot: LEATHER, sole: 0x53331a,
      chestArt(t) {
        for (const x of [-0.30, 0, 0.30]) {                              // the famous discs
          t.add(round(0.13, 0.07, 10, x, 0.18, 0.32, STEEL, { rotX: Math.PI / 2 }));
          t.add(round(0.13, 0.07, 10, x, -0.10, 0.32, STEEL, { rotX: Math.PI / 2 }));
        }
        t.add(brick(1.04, 0.12, 0.62, 0, 0.40, 0, STEEL));               // collar
      },
      headArt(h) {
        h.add(round(0.42, 0.28, 10, 0, 0.19, 0, STEEL));                 // helmet cap
        h.add(brick(0.16, 0.34, 0.10, -0.36, 0.34, 0.02, SILVER, { rotZ: -0.35 }));   // wings
        h.add(brick(0.16, 0.34, 0.10, 0.36, 0.34, 0.02, SILVER, { rotZ: 0.35 }));
        h.add(brick(0.60, 0.34, 0.30, 0, -0.16, -0.26, 0xf1d27a));       // blond hair
        h.add(brick(0.11, 0.08, 0.06, -0.13, -0.02, 0.39, 0x1b1240));    // eyes
        h.add(brick(0.11, 0.08, 0.06, 0.13, -0.02, 0.39, 0x1b1240));
        h.add(brick(0.30, 0.14, 0.10, 0, -0.24, 0.34, 0xd9b26a));        // beard
      },
      handProp(a, side, parts) {
        if (side !== 1) return;                                          // Mjolnir in the right hand
        const hammer = new THREE.Group();
        hammer.position.set(0, -0.92, 0.06);
        hammer.add(brick(0.13, 0.52, 0.13, 0, -0.22, 0, LEATHER));       // handle
        hammer.add(brick(0.40, 0.34, 0.36, 0, 0.12, 0, STEEL));          // head
        hammer.add(brick(0.44, 0.09, 0.40, 0, 0.12, 0, SILVER));
        a.add(hammer);
        parts.props.push(hammer);
      },
    },
  },
];

// ---------- live rig, rebuilt whenever the hero changes ----------
let hero = HEROES[0];
let rig = null;
let avatar, torso, head, pArmL, pArmR, pLegL, pLegR, thrusters = [], cape = null;

function selectHero(idx) {
  const next = HEROES[(idx + HEROES.length) % HEROES.length];
  const keep = avatar ? avatar.position.clone() : SPAWN.clone();
  const keepRot = avatar ? avatar.rotation.y : Math.PI;
  if (avatar) scene.remove(avatar);

  hero = next;
  rig = makeFigure(next.spec);
  avatar = rig.group;
  torso = rig.torso; head = rig.head;
  pArmL = rig.pArmL; pArmR = rig.pArmR;
  pLegL = rig.pLegL; pLegR = rig.pLegR;
  thrusters = rig.thrusters;
  cape = rig.cape;
  avatar.position.copy(keep);
  avatar.rotation.y = keepRot;
  scene.add(avatar);
  return hero;
}
selectHero(0);

// ------------------------------------------------------------
//  Live hero previews: one extra renderer draws all five figures
//  into the picker row, each in its own scissored viewport, so the
//  chooser shows the real characters running rather than thumbnails.
// ------------------------------------------------------------
const previewCanvas = document.getElementById('heroStage');
const previewGrid = document.getElementById('heroPick');
let pRenderer = null, pScene = null, pCam = null;
const pFigs = [], pSlots = [];
let pW = 0, pH = 0;

function initHeroPreviews() {
  if (!previewCanvas || pRenderer) return;
  pRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
  pRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  pRenderer.outputColorSpace = THREE.SRGBColorSpace;
  pRenderer.setClearColor(0x000000, 0);
  pRenderer.autoClear = false;

  pScene = new THREE.Scene();
  pScene.add(new THREE.HemisphereLight(0xffffff, 0x7a6aa0, 1.55));
  const key = new THREE.DirectionalLight(0xfff3dc, 1.5);
  key.position.set(3, 5, 6);
  pScene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd7ff, 0.8);
  rim.position.set(-5, 3, -4);
  pScene.add(rim);

  pCam = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

  HEROES.forEach((h, i) => {
    const parts = makeFigure(h.spec);
    parts.group.position.set(i * 14, 0, 0);
    parts.group.traverse(o => { if (o.isMesh) o.castShadow = false; });
    pScene.add(parts.group);
    pFigs.push(parts);
    pSlots.push(document.querySelectorAll('#heroPick .hero')[i].querySelector('.figure'));
  });
}

function animatePreviewFigure(f, i, t) {
  const selected = HEROES[i].id === hero.id;
  const gait = 6.2, phase = t * gait + i * 1.7;
  const sw = Math.sin(phase) * 0.85;

  f.pLegL.rotation.x = sw;        f.pLegR.rotation.x = -sw;
  f.pArmL.rotation.x = -sw * 0.9; f.pArmR.rotation.x = sw * 0.9;
  f.pArmL.rotation.z = 0.08;      f.pArmR.rotation.z = -0.08;
  f.torso.position.y = TORSO_Y + Math.abs(Math.sin(phase)) * 0.05;
  f.torso.rotation.y = 0;
  f.group.rotation.y = Math.sin(t * 0.7 + i) * 0.55;
  f.group.scale.setScalar(selected ? 1.0 : 0.84);
  f.group.position.y = selected ? Math.abs(Math.sin(phase)) * 0.04 : -0.1;
  if (f.cape) f.cape.rotation.x = -0.3 + Math.sin(t * 6 + i) * 0.08;
  for (const th of f.thrusters) th.visible = false;

  if (selected) {
    // the chosen hero shows off: a punch, then a jump with the jets lit
    const beat = t % 3.2;
    if (beat < 0.5) {
      const s = Math.sin((beat / 0.5) * Math.PI);
      f.pArmR.rotation.x = -1.75 * s;
      f.torso.rotation.y = -0.3 * s;
    } else if (beat > 1.6 && beat < 2.5) {
      const s = Math.sin(((beat - 1.6) / 0.9) * Math.PI);
      f.group.position.y = s * 0.55;
      f.pLegL.rotation.x = -0.35; f.pLegR.rotation.x = 0.18;
      f.pArmL.rotation.x = 0.5;   f.pArmR.rotation.x = 0.5;
      f.pArmL.rotation.z = 0.4;   f.pArmR.rotation.z = -0.4;
      for (const th of f.thrusters) {
        th.visible = true;
        th.scale.set(1, 0.8 + s * 0.9, 1);
      }
    }
  }
}

function renderHeroPreviews(t) {
  if (!pRenderer) return;
  const gr = previewGrid.getBoundingClientRect();
  if (gr.width < 8 || gr.height < 8) return;

  const w = Math.round(gr.width), h = Math.round(gr.height);
  if (w !== pW || h !== pH) {
    pW = w; pH = h;
    pRenderer.setSize(w, h, false);
  }

  pRenderer.setScissorTest(false);
  pRenderer.clear(true, true, true);
  pRenderer.setScissorTest(true);

  for (let i = 0; i < pFigs.length; i++) {
    const r = pSlots[i].getBoundingClientRect();
    const vw = r.width, vh = r.height;
    if (vw < 2 || vh < 2) continue;
    const vx = r.left - gr.left;
    const vy = gr.bottom - r.bottom;

    animatePreviewFigure(pFigs[i], i, t);

    pRenderer.setViewport(vx, vy, vw, vh);
    pRenderer.setScissor(vx, vy, vw, vh);
    pCam.aspect = vw / vh;
    pCam.updateProjectionMatrix();
    const fx = pFigs[i].group.position.x;
    pCam.position.set(fx, 0.12, 4.35);
    pCam.lookAt(fx, -0.05, 0);
    pRenderer.render(pScene, pCam);
  }
  pRenderer.setScissorTest(false);
}
initHeroPreviews();

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
  if (e.code === 'KeyC') {
    pickHero(HEROES.indexOf(hero) + 1);
    toast('Suited up: ' + hero.name);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// yaw 0 puts the camera south of the player, looking north at the tower
let yaw = 0, pitch = 0.16, camDist = 8;
const SHOULDER = 1.15;   // sideways camera offset, in world units
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
addEventListener('wheel', e => { camDist = clamp(camDist + Math.sign(e.deltaY) * 0.9, 4, 15); }, { passive: true });

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
  if (s.off) return false;
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
      const s = solids[i];
      if (s.off) continue;
      const cp = s.obj.position;
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
let simT = null;   // the stepped-simulation clock used by the dev harness
const hud = {
  gems: document.getElementById('gemCount'),
  time: document.getElementById('timeVal'),
  height: document.getElementById('heightVal'),
  fill: document.getElementById('gaugeFill'),
  pip: document.getElementById('gaugePip'),
  toast: document.getElementById('toast'),
  ko: document.getElementById('koCount'),
  lock: document.getElementById('lockon'),
  hearts: Array.from(document.querySelectorAll('#hearts .heart')),
};
const overlayEl = document.getElementById('overlay');

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
  toast('Climb all twenty floors - the crown is at the top');
});
// ---------- hero picker ----------
const heroButtons = Array.from(document.querySelectorAll('#heroPick .hero'));
function paintHeroPick() {
  for (const b of heroButtons) b.classList.toggle('on', b.dataset.hero === hero.id);
  document.getElementById('heroName').textContent = hero.name;
}
function pickHero(idx) {
  selectHero(idx);
  paintHeroPick();
  try { localStorage.setItem('castle-climber-hero', hero.id); } catch (err) {}
}
heroButtons.forEach((b, i) => {
  b.addEventListener('click', () => { pickHero(i); if (started) toast('Suited up: ' + hero.name); });
});
try {
  const saved = localStorage.getItem('castle-climber-hero');
  const at = HEROES.findIndex(h => h.id === saved);
  if (at >= 0) selectHero(at);
} catch (err) {}
paintHeroPick();

document.getElementById('heroBtn').addEventListener('click', () => {
  document.getElementById('winCard').classList.remove('show');
  document.getElementById('overlay').classList.remove('hidden');
  resetRun();
});

function resetRun() {
  won = false; time = 0; collected = 0; falls = 0; defeated = 0;
  hud.ko.textContent = '0';
  player.hp = 3; player.invuln = 0; updateHearts();
  for (const e of enemies) reviveEnemy(e);
  gems.forEach(g => { if (g.taken) { g.taken = false; g.obj.visible = true; } });
  hud.gems.textContent = '0';
  player.safe.copy(SPAWN);
  respawn(true);
}
document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('winCard').classList.remove('show');
  resetRun();
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
  goal.position.y = GOAL_Y + Math.sin(t * 1.6) * 0.22;
  goalLight.intensity = 2.0 + Math.sin(t * 3) * 0.5;

  moveWorld(dt, t);

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
  // Over-the-shoulder framing: the whole view slides sideways, so the hero sits
  // left of centre and the reticle looks down open ground instead of their helmet.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);          // camera right vector
  camTarget.set(
    player.pos.x + rx * SHOULDER,
    player.pos.y + 1.3,
    player.pos.z + rz * SHOULDER
  );
  const cd = Math.cos(pitch) * camDist;
  desired.set(
    camTarget.x + Math.sin(yaw) * cd,
    camTarget.y + Math.sin(pitch) * camDist + 0.9,
    camTarget.z + Math.cos(yaw) * cd
  );
  // pull in if a wall is between the camera and the player
  const dir = desired.clone().sub(camTarget);
  const dist = dir.length();
  ray.set(camTarget, dir.normalize());
  ray.far = dist;
  const hits = ray.intersectObjects(solidMeshes, false);
  const useDist = hits.length ? Math.max(1.1, hits[0].distance - 0.45) : dist;   // indoors the camera must stay inside the room
  camPos.copy(camTarget).addScaledVector(dir, useDist);
  camera.position.lerp(camPos, 1 - Math.pow(0.0005, dt));
  camera.lookAt(camTarget);

  sun.position.set(player.pos.x + 28, player.pos.y + 60, player.pos.z + 46);
  lamp.position.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
  sun.target.position.copy(player.pos);

  // ----- the hero picker's live figures, only while it is on screen -----
  if (!overlayEl.classList.contains('hidden')) renderHeroPreviews(t);

  // ----- aim reticle and lock-on marker -----
  updateReticle();

  // ----- HUD -----
  const h = Math.max(0, player.pos.y);
  hud.height.textContent = h.toFixed(0);
  hud.time.textContent = formatTime(time);
  const pct = clamp(h / (GOAL_Y + 1), 0, 1) * 100;
  hud.fill.style.height = pct + '%';
  hud.pip.style.bottom = pct + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.classList.remove('show'); }

  renderer.render(scene, camera);
}

/** Advances every solid that moves. Kept separate from rendering so the
    physics can be stepped on its own. */
function moveWorld(dt, t) {
  for (const s of solids) s.prev.copy(s.obj.position);
  for (const m of movers) {
    m.obj.position[m.axis] = m.base[m.axis] + Math.sin(t * m.speed * 1.6 + m.phase) * m.amp;
  }
  // doors stand open while somebody is close enough to push through
  for (const d of doors) {
    const near = Math.hypot(player.pos.x - d.hx, player.pos.z - d.hz) < 5.5 &&
                 Math.abs(player.pos.y - d.y) < 5;
    const want = near ? d.open : d.closed;
    if (Math.abs(want - d.a) > 0.001) {
      d.a += (want - d.a) * Math.min(1, 5 * dt);
      placeDoor(d);
    }
    // solid only while shut - a swinging panel must never push the player around
    d.col.off = Math.abs(d.a - d.closed) > 0.12;
  }
}

const _tv = new THREE.Vector3();
function updateReticle() {
  if (!started || won) {
    hud.lock.classList.remove('on');
    return;
  }
  const t = findTarget();
  if (!t) {
    hud.lock.classList.remove('on');
    return;
  }
  _tv.set(t.e.obj.position.x, t.e.obj.position.y + t.e.height * 0.55, t.e.obj.position.z);
  _tv.project(camera);
  if (_tv.z > 1) {                       // behind the camera
    hud.lock.classList.remove('on');
    return;
  }
  const size = clamp(760 / Math.max(4, t.d), 30, 110);
  hud.lock.style.width = size + 'px';
  hud.lock.style.height = size + 'px';
  hud.lock.style.left = ((_tv.x * 0.5 + 0.5) * innerWidth) + 'px';
  hud.lock.style.top = ((-_tv.y * 0.5 + 0.5) * innerHeight) + 'px';
  hud.lock.classList.add('on');
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
    for (const t of thrusters) t.visible = false;
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

  if (cape) {
    cape.rotation.x = -0.22 - clamp(hspeed / 26, 0, 0.5) + Math.sin(clock.elapsedTime * 6) * 0.06;
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
    heroes: HEROES, pickHero, currentHero: () => hero.id,
    previewLeg: i => pFigs[i].pLegL.rotation.x,
    standing() {
      const s = player.standingOn;
      if (!s) return null;
      return { x: +s.obj.position.x.toFixed(2), y: +s.obj.position.y.toFixed(2), z: +s.obj.position.z.toFixed(2),
               hx: s.hx, hy: s.hy, hz: s.hz, tag: s.tag, top: +(s.obj.position.y + s.hy).toFixed(2) };
    },
    doors,
    probe(x, y, z, pad) {
      pad = pad || 0.6;
      const hits = [];
      for (const s of solids) {
        const cp = s.obj.position;
        const l = toLocal(x - cp.x, z - cp.z, s.rotY);
        if (Math.abs(l.x) < s.hx + pad && Math.abs(y - cp.y) < s.hy + pad && Math.abs(l.z) < s.hz + pad) {
          hits.push({ x: +cp.x.toFixed(2), y: +cp.y.toFixed(2), z: +cp.z.toFixed(2),
                      w: +(s.hx * 2).toFixed(2), h: +(s.hy * 2).toFixed(2), d: +(s.hz * 2).toFixed(2),
                      rotY: +s.rotY.toFixed(2), tag: s.tag });
        }
      }
      return hits;
    },
    clearEnemies() { for (const e of enemies) { e.dead = true; e.respawnT = 1e9; e.obj.visible = false; } },
    waypoints: () => ROUTE.map(p => ({
      x: p.car ? p.car.position.x : p.x,
      y: p.car ? p.car.position.y + 0.45 : p.y,
      z: p.car ? p.car.position.z : p.z,
      kind: p.kind || 'walk', note: p.note,
    })),
    // deterministic physics stepping, independent of the render loop
    sim(frames, dt, held) {
      if (simT === null) simT = clock.elapsedTime;
      if (held) for (const k of held) keys[k] = true;
      for (let i = 0; i < frames; i++) { simT += dt; moveWorld(dt, simT); step(dt); }
      if (held) for (const k of held) keys[k] = false;
      const p = player;
      return { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
               g: p.grounded, vy: +p.vel.y.toFixed(2),
               speed: +Math.hypot(p.vel.x, p.vel.z).toFixed(2) };
    },
  };
}

tick();
