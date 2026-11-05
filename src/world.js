/**
 * world.js v2 — "Dhaka-ified" city (R3.5)
 *
 * Design goals (user brief): chaotic everywhere, nicer in the nice parts,
 * tall buildings all over with few small ones, broken buildings in Old Dhaka,
 * proper landmarks, NO empty spots (only roads are empty — and even the roads
 * have hawkers), tin-shed tea stalls everywhere.
 *
 * Structure: irregular road network (ROAD_X / ROAD_Z line arrays), adaptive
 * block fill (every lot occupied), landmark builds (Hatirjheel bridge, Lalbagh
 * Fort, Shapla, Kamalapur, Gabtoli), procedural species (tea stalls, buses,
 * rail coaches, ruins, construction frames, parked rickshaws), per-instance
 * tint variance so no two buildings read alike.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitModel, measure, extractPrims, instancedPlacements } from './assets.js';
import { buildRickshaw } from './player.js';

// ---------- irregular road network ----------
export const ROAD_X = [-190, -126, -70, -4, 66, 130, 190];
export const ROAD_Z = [-188, -120, -66, 0, 72, 126, 188];
export const ROAD_HALF = 6;

export const lineX = (i) => ROAD_X[i];
export const lineZ = (i) => ROAD_Z[i];
export const blockCX = (i) => (ROAD_X[i] + ROAD_X[i + 1]) / 2;
export const blockCZ = (i) => (ROAD_Z[i] + ROAD_Z[i + 1]) / 2;
export const blockW = (i) => ROAD_X[i + 1] - ROAD_X[i] - ROAD_HALF * 2;
export const blockD = (i) => ROAD_Z[i + 1] - ROAD_Z[i] - ROAD_HALF * 2;

/** distance from v to the nearest road centerline on that axis */
export function distToRoad(v, axis = 'x') {
  const arr = axis === 'x' ? ROAD_X : ROAD_Z;
  let best = Infinity;
  for (const c of arr) best = Math.min(best, Math.abs(v - c));
  return best;
}

// ---------- block types (6x6, bz outer) ----------
const BLOCK_MAP = [
  ['farmgate', 'farmgate', 'banglamotor', 'mixed', 'motijheel', 'motijheel'],
  ['farmgate', 'mixed', 'banglamotor', 'motijheel', 'motijheel', 'motijheel'],
  ['gabtoli', 'tejgaon', 'water', 'water', 'tejgaon', 'motijheel'],
  ['gabtoli', 'tejgaon', 'water', 'park', 'tejgaon', 'mixed'],
  ['old', 'lalbagh', 'shahbagh', 'gulistan', 'dhanmondi', 'dhanmondi'],
  ['depot', 'old', 'karwan', 'karwan', 'dhanmondi', 'kamalapur'],
];

const POOLS = {
  // Dhaka default: mid-rise everywhere, packed
  old:      { models: ['com_a','com_b','com_c','com_e','com_f'], h: [8, 13], cell: 8.5, ruin: 0.35, density: 1, signs: true, bazaar: true },
  lalbagh:  { models: ['com_g','com_h'], h: [8, 12], cell: 9, ruin: 0.25, density: 1, signs: true },
  shahbagh: { models: ['com_k','com_l','com_m','com_i'], h: [13, 22], cell: 10.5, density: 1, signs: true },
  gulistan: { models: ['com_c','com_d','com_n','com_e','com_m'], h: [14, 24], cell: 10.5, density: 1, signs: true },
  karwan:   { models: ['com_a','com_b','com_i','com_j','com_l'], h: [11, 19], cell: 9.5, density: 1, signs: true, market: true },
  farmgate: { models: ['com_f','com_g','com_h','com_k','com_l'], h: [14, 24], cell: 11, density: 1, signs: true },
  motijheel:{ models: ['sky_a','sky_b','sky_c','sky_d','sky_e','com_m','com_n'], h: [24, 46], cell: 12, density: 1, signs: true },
  banglamotor: { models: ['com_h','com_i','com_n','sky_a','com_l'], h: [15, 26], cell: 11, density: 1, signs: true },
  gabtoli:  { models: ['ind_a','ind_b','ind_c','ind_d','ind_e'], h: [10, 16], cell: 11, density: 1, industrial: true },
  tejgaon:  { models: ['ind_g','ind_h','com_l','com_m','ind_i'], h: [12, 20], cell: 11, density: 1, industrial: true },
  dhanmondi:{ models: ['sub_a','sub_b','sub_c','sub_d','com_f'], h: [9, 16], cell: 12, density: 1, suburb: true, signs: true },
  kamalapur:{ models: ['ind_i','ind_j','com_k','sub_g' ], h: [10, 17], cell: 11, density: 1, industrial: true },
  mixed:    { models: ['com_b','com_e','com_j','com_l','sub_h','sub_i'], h: [13, 22], cell: 10.5, density: 1 },
  park:     { models: [], h: [0, 0], cell: 0, density: 0 },
  water:    { models: [], h: [0, 0], cell: 0, density: 0 },
  depot:    { models: ['ind_k','ind_l'], h: [8, 11], cell: 13, density: 0.5 },
};

// ---------- models ----------
export const WORLD_MODELS = [
  ...['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map((c) => [`buildings/com_building_${c}.glb`, `com_${c}`]),
  ...['a','b','c','d','e'].map((c) => [`buildings/com_building_skyscraper_${c}.glb`, `sky_${c}`]),
  ...['a','b','c','d','e','f','g','h','i','j','k','l'].map((c) => [`buildings/sub_building_type_${c}.glb`, `sub_${c}`]),
  ...['a','b','c','d','e','f','g','h','i','j','k','l'].map((c) => [`buildings/ind_building_${c}.glb`, `ind_${c}`]),
  ['buildings/ind_shipping_container_a.glb', 'cont_a'],
  ['buildings/ind_shipping_container_b.glb', 'cont_b'],
  ['buildings/ind_shipping_container_c.glb', 'cont_c'],
  ['buildings/ind_chimney_basic.glb', 'chimney'],
  ['buildings/ind_water_tower.glb', 'watertower'],
  ['buildings/com_detail_awning.glb', 'awning'],
  ['buildings/com_detail_awning_wide.glb', 'awning_wide'],
  ['buildings/com_detail_parasol_a.glb', 'parasol_a'],
  ['buildings/com_detail_parasol_b.glb', 'parasol_b'],
  ['buildings/sub_fence.glb', 'fence'],
  ['buildings/sub_planter.glb', 'planter'],
  ['nature/nat_tree_oak.glb', 'tree_oak'],
  ['nature/nat_tree_default.glb', 'tree_default'],
  ['nature/nat_tree_palm.glb', 'tree_palm'],
  ['nature/nat_tree_fat.glb', 'tree_fat'],
  ['nature/nat_tree_cone.glb', 'tree_cone'],
  ['nature/nat_tree_simple.glb', 'tree_simple'],
  ['nature/nat_tree_tall.glb', 'tree_tall'],
  ['nature/nat_tree_small.glb', 'tree_small'],
  ['props/road_traffic_light.glb', 'tlight'],
  ['props/road_light_curved.glb', 'streetlight'],
  ['props/road_electricity_pole.glb', 'epole'],
  ['props/road_electricity_wires.glb', 'wires'],
  ['props/road_dumpster.glb', 'dumpster'],
  ['props/road_construction_barrier.glb', 'barrier'],
  ['props/road_construction_cone.glb', 'cone'],
  ['props/road_construction_fence.glb', 'const_fence'],
  ['props/road_road_bridge.glb', 'road_bridge'],
  ['props/road_bridge_pillar.glb', 'bridge_pillar'],
  ['props/road_road_sign_stop.glb', 'sign_stop'],
  ['props/road_road_sign_warning.glb', 'sign_warning'],
  ['vehicles/car_taxi.glb', 'car_taxi'],
  ['vehicles/car_sedan.glb', 'car_sedan'],
  ['vehicles/car_suv.glb', 'car_suv'],
  ['vehicles/car_van.glb', 'car_van'],
  ['vehicles/car_truck.glb', 'car_truck'],
  ['vehicles/car_police.glb', 'car_police'],
  ['characters/char_character_male_a.glb', 'male_a'],
  ['characters/char_character_male_b.glb', 'male_b'],
  ['characters/char_character_male_c.glb', 'male_c'],
  ['characters/char_character_female_a.glb', 'female_a'],
  ['characters/char_character_female_b.glb', 'female_b'],
];

// ---------- landmarks ----------
const LANDMARK_DEFS = [
  { name: 'New Market',        bn: 'নিউ মার্কেট',       x: blockCX(1) - 6, z: lineZ(5) + 10,   color: 0xffd23f },
  { name: 'Lalbagh Fort',      bn: 'লালবাগ কেল্লা',      x: blockCX(1),     z: blockCZ(4),       color: 0xd97b4f },
  { name: 'Farmgate',          bn: 'ফার্মগেট',          x: blockCX(1) + 8, z: lineZ(0) - 10,    color: 0x6fb1d9 },
  { name: 'Karwan Bazar',      bn: 'কারওয়ান বাজার',     x: blockCX(2) + 8, z: lineZ(5) + 10,    color: 0xffd23f },
  { name: 'Dhanmondi School',  bn: 'ধানমন্ডি স্কুল',     x: blockCX(4) - 8, z: lineZ(5) + 10,    color: 0x7bc47f },
  { name: 'Dhanmondi Lake',    bn: 'ধানমন্ডি লেক',       x: lineX(5) - 10,  z: blockCZ(4) + 8,   color: 0x4fa3c7 },
  { name: 'Motijheel Bank',    bn: 'মতিঝিল ব্যাংক',      x: blockCX(4) - 8, z: lineZ(0) - 10,    color: 0x6fb1d9 },
  { name: 'Shapla Chottor',    bn: 'শাপলা চত্বর',        x: blockCX(5) - 4, z: blockCZ(1) - 4,   color: 0xe4709a },
  { name: 'Gabtoli Bus Stand', bn: 'গাবতলী বাস স্ট্যান্ড',  x: blockCX(0) + 4, z: blockCZ(2) - 6, color: 0xc7b34f },
  { name: 'Hatirjheel Park',   bn: 'হাতিরঝিল পার্ক',     x: blockCX(3) + 8, z: blockCZ(3) + 8,   color: 0x7bc47f },
  { name: 'Bangla Motor',      bn: 'বাংলা মোটর',         x: blockCX(3) - 8, z: lineZ(0) - 10,    color: 0xffd23f },
  { name: 'Shahbagh',          bn: 'শাহবাগ',            x: blockCX(2) + 8, z: blockCZ(4) - 8,   color: 0xe4709a },
  { name: 'Kamalapur Rail',    bn: 'কমলাপুর রেল',        x: blockCX(5) - 6, z: lineZ(5) + 10,    color: 0xc7b34f },
  { name: 'Gulistan',          bn: 'গুলিস্তান',          x: blockCX(3) - 8, z: blockCZ(4) + 8,   color: 0xd97b4f },
  { name: 'Mirpur Road',       bn: 'মিরপুর রোড',         x: lineX(1) - 10,  z: blockCZ(3) - 8,   color: 0x9a86d9 },
  { name: 'Tejgaon',           bn: 'তেজগাঁও',            x: blockCX(4) + 8, z: blockCZ(2) - 8,   color: 0x9a86d9 },
];

const SIGN_DEFS = [
  { bn: 'চা ও সিঙ্গারা',    en: 'TEA & SINGARA',    bg: '#0f6e4f' },
  { bn: 'বিসমিল্লাহ স্টোর', en: 'BISMILLAH STORE',  bg: '#7a1f1f' },
  { bn: 'মা টেলিকম',       en: 'MA TELECOM',       bg: '#1d4f7a' },
  { bn: 'ভাই ভাই হোটেল',   en: 'BHAI BHAI HOTEL',  bg: '#8a5a12' },
  { bn: 'নিউ মার্কেট',      en: 'NEW MARKET',       bg: '#5a1d7a' },
  { bn: 'ফার্মেসি',         en: 'PHARMACY',         bg: '#0f6e4f' },
  { bn: 'সেলুন প্লাজা',     en: 'SALON PLAZA',      bg: '#7a1f5a' },
  { bn: 'মিষ্টি মুখ',       en: 'MISTI MUKH',       bg: '#8a5a12' },
  { bn: 'মধুমতি ব্যাংক',    en: 'MADHUMATI BANK',   bg: '#1d4f7a' },
  { bn: 'হানিফ পরিবহন',    en: 'HANIF TRANSPORT',  bg: '#7a1f1f' },
  { bn: 'ধীরে চালান',      en: 'GO SLOW',          bg: '#444a44' },
  { bn: 'হর্ন নিষেধ',       en: 'NO HORN',          bg: '#444a44' },
  { bn: 'রিকশা গ্যারেজ',    en: 'RICKSHAW GARAGE',  bg: '#0f6e4f' },
  { bn: 'মোবাইল রিচার্জ',   en: 'MOBILE RECHARGE',  bg: '#1d4f7a' },
  { bn: 'টেইলার্স',         en: 'TAILORS',          bg: '#5a1d7a' },
  { bn: 'ইলেকট্রনিক্স',     en: 'ELECTRONICS',      bg: '#1d4f7a' },
];

// ---------- deterministic rng ----------
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rnd = mulberry(19710216); // ~ independent Bangladesh era
const rnd = (a, b) => a + _rnd() * (b - a);
const pick = (arr) => arr[Math.floor(_rnd() * arr.length)];
export function reseedWorld(seed) { _rnd = mulberry(seed); }

// ---------- procedural species ----------
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mergedGroup(parts, { castShadow = true } = {}) {
  const byMat = new Map();
  for (const { geom, mat } of parts) {
    // mergeGeometries needs consistent attributes & indexing — normalize to non-indexed
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  }
  const g2 = new THREE.Group();
  for (const [mat, geoms] of byMat) {
    const merged = mergeGeometries(geoms);
    if (!merged) { console.error('merge failed for', mat.type, geoms.length); continue; }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    g2.add(mesh);
  }
  return g2;
}

const TIN = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 });
const BAMBOO = new THREE.MeshStandardMaterial({ color: 0xa38b4f, roughness: 0.95 });
const CONCRETE = new THREE.MeshStandardMaterial({ color: 0xb0aca0, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.9 });
const RUST = new THREE.MeshStandardMaterial({ color: 0x8a4a2e, roughness: 0.85, metalness: 0.3 });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
const SANDSTONE = new THREE.MeshStandardMaterial({ color: 0xa84f3d, roughness: 0.9 });

function teaStall() {
  const p = [];
  const roof = new THREE.BoxGeometry(2.8, 0.06, 2.0);
  roof.rotateZ(0.16);
  roof.translate(0, 2.05, 0);
  p.push({ geom: roof, mat: TIN });
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const post = new THREE.BoxGeometry(0.07, 2.1, 0.07);
    post.translate(x, 1.05, z);
    p.push({ geom: post, mat: BAMBOO });
  }
  const counter = new THREE.BoxGeometry(2.5, 0.95, 0.7);
  counter.translate(0, 0.48, -0.45);
  p.push({ geom: counter, mat: WOOD });
  const kettle = new THREE.CylinderGeometry(0.13, 0.16, 0.3, 10);
  kettle.translate(-0.6, 1.1, -0.45);
  p.push({ geom: kettle, mat: TIN });
  const stove = new THREE.CylinderGeometry(0.22, 0.25, 0.18, 10);
  stove.translate(0.55, 1.04, -0.45);
  p.push({ geom: stove, mat: DARK });
  const bench = new THREE.BoxGeometry(1.8, 0.06, 0.3);
  bench.translate(0, 0.42, 0.85);
  p.push({ geom: bench, mat: BAMBOO });
  const signMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(256, 72, (ctx, w, h) => {
      ctx.fillStyle = '#0f6e4f'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fff8e7'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#fff8e7'; ctx.textAlign = 'center';
      ctx.font = '700 44px "Noto Sans Bengali", sans-serif';
      ctx.fillText('চা এর দোকান', w / 2, 52);
    }),
    side: THREE.DoubleSide, roughness: 0.85,
  });
  const signGeom = new THREE.PlaneGeometry(1.5, 0.45);
  signGeom.translate(0, 1.85, 1.02);
  p.push({ geom: signGeom, mat: signMat });
  return mergedGroup(p);
}

function wallSegment(tin = false) {
  const p = [];
  const H = 2.35, L = 7.6, T = 0.22;
  if (tin) {
    const sheet = new THREE.BoxGeometry(L, H, 0.06);
    sheet.translate(0, H / 2, 0);
    p.push({ geom: sheet, mat: TIN });
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) {
      const post = new THREE.BoxGeometry(0.12, H + 0.25, 0.12);
      post.translate(x, (H + 0.25) / 2, 0);
      p.push({ geom: post, mat: WOOD });
    }
  } else {
    const body = new THREE.BoxGeometry(L, H, T);
    body.translate(0, H / 2, 0);
    p.push({ geom: body, mat: CONCRETE });
    const cap = new THREE.BoxGeometry(L + 0.12, 0.16, T + 0.14);
    cap.translate(0, H + 0.08, 0);
    p.push({ geom: cap, mat: CONCRETE });
  }
  return mergedGroup(p);
}

function rubble() {
  const p = [];
  const n = 6 + Math.floor(_rnd() * 4);
  for (let i = 0; i < n; i++) {
    const s = rnd(0.3, 0.9);
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.rotateX(rnd(0, 3)); g.rotateY(rnd(0, 3));
    g.translate(rnd(-1.4, 1.4), s * 0.4, rnd(-1.4, 1.4));
    p.push({ geom: g, mat: CONCRETE });
  }
  const slab = new THREE.BoxGeometry(rnd(1.5, 2.4), 0.16, rnd(1.2, 2));
  slab.rotateY(rnd(0, 1.5)); slab.translate(rnd(-0.5, 0.5), 0.1, rnd(-0.5, 0.5));
  p.push({ geom: slab, mat: CONCRETE });
  // exposed rebar sticks
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.CylinderGeometry(0.02, 0.02, rnd(0.6, 1.2), 5);
    bar.rotateX(rnd(-0.4, 0.4)); bar.rotateZ(rnd(-0.4, 0.4));
    bar.translate(rnd(-1, 1), 0.5, rnd(-1, 1));
    p.push({ geom: bar, mat: RUST });
  }
  return mergedGroup(p);
}

function constructionFrame() {
  const p = [];
  const W = 8, D = 8, FLOORS = 3, FH = 3.2;
  for (const [x, z] of [[-W/2, -D/2], [W/2, -D/2], [-W/2, D/2], [W/2, D/2]]) {
    const col = new THREE.BoxGeometry(0.42, FLOORS * FH, 0.42);
    col.translate(x, FLOORS * FH / 2, z);
    p.push({ geom: col, mat: CONCRETE });
    // rebar on top
    for (let r = 0; r < 3; r++) {
      const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 5);
      bar.translate(x + rnd(-0.12, 0.12), FLOORS * FH + 0.45, z + rnd(-0.12, 0.12));
      p.push({ geom: bar, mat: RUST });
    }
  }
  for (let f = 1; f <= FLOORS; f++) {
    const slab = new THREE.BoxGeometry(W + 0.5, 0.22, D + 0.5);
    slab.translate(0, f * FH, 0);
    p.push({ geom: slab, mat: CONCRETE });
  }
  // sand + brick piles
  const sand = new THREE.ConeGeometry(1.2, 0.9, 9);
  sand.translate(-W/2 - 1.2, 0.45, D/2);
  p.push({ geom: sand, mat: new THREE.MeshStandardMaterial({ color: 0xc9b58a, roughness: 1 }) });
  const bricks = new THREE.BoxGeometry(1.1, 0.55, 0.8);
  bricks.translate(W/2 + 1.1, 0.28, D/2 + 0.5);
  p.push({ geom: bricks, mat: SANDSTONE });
  return mergedGroup(p);
}

function busTexture(name, bn, bg, fg) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    ctx.font = '700 62px "Noto Sans Bengali", sans-serif';
    ctx.fillText(bn, w / 2, 58);
    ctx.font = '700 30px "Noto Sans", sans-serif';
    ctx.fillText(name, w / 2, 102);
  });
}

const BUS_COLORS = [
  { key: 'bus_hanif',     bn: 'হানিফ',     en: 'HANIF ENTERPRISE',  bg: '#1a6b3c', fg: '#fff8e7' },
  { key: 'bus_madhumati', bn: 'মধুমতি',    en: 'MADHUMATI',         bg: '#1d4f7a', fg: '#fff8e7' },
  { key: 'bus_shohag',    bn: 'শোহাগ',     en: 'SHOHAG',            bg: '#8a1f1f', fg: '#ffe94f' },
  { key: 'bus_bRTC',      bn: 'বিআরটিসি',  en: 'BRTC',              bg: '#e0e0d8', fg: '#1a4f1a' },
];

function bus(colorDef) {
  const p = [];
  const body = new THREE.BoxGeometry(2.5, 1.9, 10.4);
  body.translate(0, 1.35, 0);
  p.push({ geom: body, mat: new THREE.MeshStandardMaterial({ color: colorDef.bg, roughness: 0.5 }) });
  const strip = new THREE.BoxGeometry(2.54, 0.62, 9.0);
  strip.translate(0, 1.95, 0);
  p.push({ geom: strip, mat: new THREE.MeshStandardMaterial({ color: 0x18262e, roughness: 0.25, metalness: 0.4 }) });
  const boardMat = new THREE.MeshStandardMaterial({
    map: busTexture(colorDef.en, colorDef.bn, '#f5f0e2', colorDef.bg), roughness: 0.8,
  });
  const boardF = new THREE.PlaneGeometry(2.2, 0.55);
  boardF.translate(0, 2.62, 5.21);
  p.push({ geom: boardF, mat: boardMat });
  const boardB = new THREE.PlaneGeometry(2.2, 0.55);
  boardB.rotateY(Math.PI);
  boardB.translate(0, 2.62, -5.21);
  p.push({ geom: boardB, mat: boardMat });
  for (const [x, z] of [[-1.15, 3.4], [1.15, 3.4], [-1.15, -3.4], [1.15, -3.4]]) {
    const wheel = new THREE.CylinderGeometry(0.52, 0.52, 0.34, 12);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(x, 0.52, z);
    p.push({ geom: wheel, mat: DARK });
  }
  return mergedGroup(p);
}

function railCoach() {
  const p = [];
  const body = new THREE.BoxGeometry(3.1, 3.0, 15.5);
  body.translate(0, 1.9, 0);
  p.push({ geom: body, mat: new THREE.MeshStandardMaterial({ color: 0x7d3b2a, roughness: 0.8, metalness: 0.2 }) });
  const roof = new THREE.BoxGeometry(3.2, 0.18, 15.6);
  roof.translate(0, 3.45, 0);
  p.push({ geom: roof, mat: TIN });
  const strip = new THREE.BoxGeometry(3.16, 0.7, 13.8);
  strip.translate(0, 2.5, 0);
  p.push({ geom: strip, mat: new THREE.MeshStandardMaterial({ color: 0x141c22, roughness: 0.3 }) });
  const skirt = new THREE.BoxGeometry(3.0, 0.5, 15.0);
  skirt.translate(0, 0.6, 0);
  p.push({ geom: skirt, mat: DARK });
  return mergedGroup(p);
}

function shapla() {
  const p = [];
  const plaza = new THREE.CylinderGeometry(9, 9.4, 0.5, 22);
  plaza.translate(0, 0.25, 0);
  p.push({ geom: plaza, mat: new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.9 }) });
  const pool = new THREE.CylinderGeometry(6.4, 6.4, 0.42, 22);
  pool.translate(0, 0.36, 0);
  p.push({ geom: pool, mat: new THREE.MeshStandardMaterial({ color: 0x2e7f9e, roughness: 0.2, metalness: 0.2 }) });
  const pedestal = new THREE.CylinderGeometry(0.9, 1.4, 3.4, 12);
  pedestal.translate(0, 2.1, 0);
  p.push({ geom: pedestal, mat: WHITE });
  // petals
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const petal = new THREE.ConeGeometry(0.85, 3.4, 6);
    petal.rotateX(0.85);
    petal.rotateY(-a);
    petal.translate(Math.sin(a) * 1.15, 5.0, Math.cos(a) * 1.15);
    p.push({ geom: petal, mat: WHITE });
  }
  const core = new THREE.SphereGeometry(0.62, 10, 8);
  core.translate(0, 5.6, 0);
  p.push({ geom: core, mat: new THREE.MeshStandardMaterial({ color: 0xf0c93f, roughness: 0.5 }) });
  return mergedGroup(p);
}

function fortPavilion() {
  const p = [];
  const drum = new THREE.CylinderGeometry(2.3, 2.5, 2.6, 12);
  drum.translate(0, 1.3, 0);
  p.push({ geom: drum, mat: SANDSTONE });
  const dome = new THREE.SphereGeometry(2.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, 2.55, 0);
  p.push({ geom: dome, mat: WHITE });
  const tip = new THREE.ConeGeometry(0.16, 0.9, 6);
  tip.translate(0, 5.35, 0);
  p.push({ geom: tip, mat: new THREE.MeshStandardMaterial({ color: 0xd9b23f, metalness: 0.6, roughness: 0.3 }) });
  return mergedGroup(p);
}

// registry
const PROC = {
  tea_stall: teaStall,
  rubble,
  const_frame: constructionFrame,
  wall_conc: () => wallSegment(false),
  wall_tin: () => wallSegment(true),
  shapla,
  fort_pavilion: fortPavilion,
  coach: railCoach,
  bus_hanif: () => bus(BUS_COLORS[0]),
  bus_madhumati: () => bus(BUS_COLORS[1]),
  bus_shohag: () => bus(BUS_COLORS[2]),
  bus_brtc: () => bus(BUS_COLORS[3]),
};
function makeParkedRickshaw() {
  const r = buildRickshaw();
  return r; // Group with ~7 merged material meshes
}

// ---------- main builder ----------
export function buildWorld(scene, assets, { asphaltTex }) {
  reseedWorld(19710216);
  const species = {};    // key -> {prims,w,h,d}
  const placements = {}; // key -> recs
  const colliders = [];
  const group = new THREE.Group();

  function prepare(key) {
    if (species[key]) return species[key];
    let wrap = null;
    if (PROC[key]) wrap = fitModel(PROC[key](), {});
    else if (key === 'rickshaw') wrap = fitModel(makeParkedRickshaw(), {});
    else if (assets[key]) wrap = fitModel(assets[key], {});
    if (!wrap) return null;
    const m = measure(wrap);
    species[key] = { prims: extractPrims(wrap), w: m.w, h: m.h, d: m.d };
    return species[key];
  }

  /**
   * place(key, x, z, opts)
   * opts: ry, h (fit height), len (fit length), s (raw scale), tint (hex),
   *       tiltZ, tiltX, collider, kind
   */
  function place(key, x, z, o = {}) {
    const sp = prepare(key);
    if (!sp) return null;
    let scale = o.s;
    if (scale == null) {
      if (o.h != null) scale = o.h / sp.h;
      else if (o.len != null) scale = o.len / Math.max(sp.w, sp.d);
      else scale = 1;
    }
    const rec = { x, z, ry: o.ry || 0, s: scale, sy: o.sy || 1, tint: o.tint, tiltZ: o.tiltZ || 0, tiltX: o.tiltX || 0 };
    (placements[key] ??= []).push(rec);
    if (o.collider) {
      const cy = Math.abs(Math.cos(o.ry || 0)), sy = Math.abs(Math.sin(o.ry || 0));
      const hw = (cy * sp.w + sy * sp.d) * scale / 2;
      const hd = (sy * sp.w + cy * sp.d) * scale / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, kind: o.kind || 'building' });
    }
    return rec;
  }

  // ===== ground =====
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshStandardMaterial({ color: 0x8e9b7c, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ===== roads (follow the irregular lines) =====
  const roadLenX = ROAD_X[ROAD_X.length - 1] - ROAD_X[0] + ROAD_HALF * 2;
  const roadLenZ = ROAD_Z[ROAD_Z.length - 1] - ROAD_Z[0] + ROAD_HALF * 2;
  const asphalt = asphaltTex.clone();
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.needsUpdate = true;
  {
    const hGeoms = [], vGeoms = [];
    for (let i = 0; i < ROAD_Z.length; i++) {
      const g = new THREE.PlaneGeometry(roadLenX, ROAD_HALF * 2);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.02, ROAD_Z[i]);
      hGeoms.push(g);
    }
    for (let i = 0; i < ROAD_X.length; i++) {
      const g = new THREE.PlaneGeometry(ROAD_HALF * 2, roadLenZ);
      g.rotateX(-Math.PI / 2);
      g.translate(ROAD_X[i], 0.045, 0);
      vGeoms.push(g);
    }
    const mkMat = (repX, repZ) => {
      const t = asphalt.clone();
      t.repeat.set(repX, repZ);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    };
    const hMesh = new THREE.Mesh(mergeGeometries(hGeoms), mkMat(roadLenX / 7, 2));
    const vMesh = new THREE.Mesh(mergeGeometries(vGeoms), mkMat(2, roadLenZ / 7));
    hMesh.receiveShadow = vMesh.receiveShadow = true;
    group.add(hMesh, vMesh);
  }

  // ===== center dashes =====
  {
    const geoms = [];
    const dash = new THREE.PlaneGeometry(0.28, 2.2);
    for (let i = 0; i < ROAD_Z.length; i++) {
      for (let j = 0; j < ROAD_X.length - 1; j++) {
        const from = ROAD_X[j] + ROAD_HALF + 1.5, to = ROAD_X[j + 1] - ROAD_HALF - 1.5;
        for (let d = from; d < to; d += 4.2) {
          const g = dash.clone(); g.rotateX(-Math.PI / 2); g.translate(d + 1.1, 0.07, ROAD_Z[i]);
          geoms.push(g);
        }
      }
    }
    for (let i = 0; i < ROAD_X.length; i++) {
      for (let j = 0; j < ROAD_Z.length - 1; j++) {
        const from = ROAD_Z[j] + ROAD_HALF + 1.5, to = ROAD_Z[j + 1] - ROAD_HALF - 1.5;
        for (let d = from; d < to; d += 4.2) {
          const g = dash.clone(); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(ROAD_X[i], 0.07, d + 1.1);
          geoms.push(g);
        }
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshBasicMaterial({ color: 0xf4d35e })));
  }

  // ===== sidewalks (per block, sized to block) =====
  {
    const geoms = [];
    const rimW = 2.6, hgt = 0.14;
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        if (BLOCK_MAP[bz][bx] === 'water') continue;
        const cx = blockCX(bx), cz = blockCZ(bz);
        const W = blockW(bx) + ROAD_HALF * 2 - rimW;   // to block edge incl. half road? no: block edge = road edge
        const D = blockD(bz) + ROAD_HALF * 2 - rimW;
        const SW = W / 2, SD = D / 2, innerW = W - rimW * 2, innerD = D - rimW * 2;
        const strips = [
          [cx, cz - SD + rimW / 2, W, rimW],
          [cx, cz + SD - rimW / 2, W, rimW],
          [cx - SW + rimW / 2, cz, rimW, innerD],
          [cx + SW - rimW / 2, cz, rimW, innerD],
        ];
        for (const [x, z, w, d] of strips) {
          const g = new THREE.BoxGeometry(w, hgt, d);
          g.translate(x, hgt / 2, z);
          geoms.push(g);
        }
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 1 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ===== water + Hatirjheel bridge =====
  const waterZones = [];
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.88, roughness: 0.22, metalness: 0.15 });
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        if (BLOCK_MAP[bz][bx] !== 'water') continue;
        const cx = blockCX(bx), cz = blockCZ(bz);
        const W = blockW(bx) + ROAD_HALF * 2, D = blockD(bz) + ROAD_HALF * 2;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cx, 0.09, cz);
        group.add(mesh);
        waterZones.push({ minX: cx - W / 2, maxX: cx + W / 2, minZ: cz - D / 2, maxZ: cz + D / 2 });
      }
    }

    // THE BRIDGE: vertical road x = ROAD_X[3] crosses both water blocks
    const bxLine = ROAD_X[3];
    const zFrom = ROAD_Z[2] + ROAD_HALF, zTo = ROAD_Z[4] - ROAD_HALF;
    const span = zTo - zFrom;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 - 0.4, 0.5, span), CONCRETE);
    deck.position.set(bxLine, 0.2, (zFrom + zTo) / 2);
    deck.receiveShadow = true;
    group.add(deck);
    // railings
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.4, metalness: 0.5 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, span), railMat);
      rail.position.set(bxLine + side * (ROAD_HALF - 0.4), 0.95, (zFrom + zTo) / 2);
      rail.castShadow = true;
      group.add(rail);
    }
    // pillars into the water
    const pGeom = new THREE.CylinderGeometry(0.8, 1.0, 3.2, 10);
    for (let z = zFrom + 6; z < zTo; z += 11) {
      const pil = new THREE.InstancedMesh(pGeom, CONCRETE, 2);
      const m = new THREE.Matrix4();
      pil.setMatrixAt(0, m.makeTranslation(bxLine - 4.6, -1.2, z));
      pil.setMatrixAt(1, m.makeTranslation(bxLine + 4.6, -1.2, z));
      group.add(pil);
    }
  }

  // ===== block fill =====
  const signSlots = [];
  const hawkerRoads = []; // remember road-adjacent spots for stalls

  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const type = BLOCK_MAP[bz][bx];
      const conf = POOLS[type];
      const cx = blockCX(bx), cz = blockCZ(bz);
      const W = blockW(bx), D = blockD(bz); // usable (between road edges)

      if (type === 'water') continue;

      if (type === 'park') {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x5d8a4a, roughness: 1 }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.1, cz);
        grass.receiveShadow = true;
        group.add(grass);
        const n = Math.floor((W * D) / 55);
        for (let i = 0; i < n; i++) {
          place(pick(['tree_oak', 'tree_fat', 'tree_tall', 'tree_default']), cx + rnd(-W/2 + 4, W/2 - 4), cz + rnd(-D/2 + 4, D/2 - 4), { h: rnd(5, 9), collider: true, kind: 'tree' });
        }
        for (let i = 0; i < 8; i++) place('tea_stall', cx + rnd(-W/2 + 5, W/2 - 5), cz + rnd(-D/2 + 5, D/2 - 5), { ry: rnd(0, 6.28), collider: true, kind: 'prop' });
        continue;
      }

      if (type === 'depot') {
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(24, 18), new THREE.MeshStandardMaterial({ color: 0x3c4043, roughness: 1 }));
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(cx - 6, 0.06, cz + 8);
        group.add(pad);
        place('ind_k', cx + W/2 - 8, cz - D/2 + 8, { h: 10, collider: true });
        place('ind_l', cx - W/2 + 8, cz - D/2 + 8, { h: 8, collider: true });
        place('cont_a', cx + 4, cz - 6, { h: 2.6, ry: 0.5, collider: true, kind: 'prop' });
        place('cont_b', cx - 10, cz + 14, { h: 2.6, collider: true, kind: 'prop' });
        for (let i = 0; i < 4; i++) place('rickshaw', cx - 14 + i * 2.2, cz + 16, { ry: Math.PI / 2 + rnd(-0.1, 0.1) });
        for (let i = 0; i < 3; i++) place('tea_stall', cx + rnd(-16, 16), cz + rnd(-2, 16), { ry: rnd(0, 6.28), collider: true, kind: 'prop' });
        continue;
      }

      if (type === 'lalbagh') {
        // Lalbagh Fort: red wall enclosure, gate south, 3 pavilions, lawn
        const fort = Math.min(W, D) * 0.78;
        const wallH = 5.5, th = 0.9;
        const wx = cx, wz = cz;
        const wallSegs = [
          [wx, wz - fort / 2, fort, th], [wx, wz + fort / 2, fort, th],
          [wx - fort / 2, wz, th, fort - th * 2], [wx + fort / 2 + th, wz, th, fort - th * 2],
        ];
        const gateW = 7;
        for (const [x, z, w, d] of wallSegs) {
          const g = new THREE.BoxGeometry(w, wallH, d);
          g.translate(x, wallH / 2, z);
          const mesh = new THREE.Mesh(g, SANDSTONE);
          mesh.castShadow = mesh.receiveShadow = true;
          group.add(mesh);
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, kind: 'wall' });
        }
        // gate gap in south wall: carve visually with two short wall stubs already handled by segments; add gate posts
        for (const s of [-1, 1]) {
          const post = new THREE.BoxGeometry(1.4, wallH + 1.2, 1.4);
          post.translate(wx + s * (gateW / 2 + 0.7), (wallH + 1.2) / 2, wz + fort / 2);
          const mesh = new THREE.Mesh(post, SANDSTONE);
          mesh.castShadow = true;
          group.add(mesh);
        }
        // lawn + pavilions
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(fort - 3, fort - 3), new THREE.MeshStandardMaterial({ color: 0x63924c, roughness: 1 }));
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(wx, 0.1, wz);
        group.add(lawn);
        for (const dx of [-fort / 3.2, 0, fort / 3.2]) {
          place('fort_pavilion', wx + dx, wz - fort / 5, { h: 8.5, collider: true });
        }
        // gardens
        for (let i = 0; i < 8; i++) place(pick(['tree_palm', 'tree_tall']), wx + rnd(-fort/2 + 3, fort/2 - 3), wz + rnd(-fort/2 + 3, fort/2 - 3), { h: rnd(5, 8), collider: true, kind: 'tree' });
        // periphery remains dense old-town
        const confOld = POOLS.old;
        fillPerimeter(wx, wz, W, D, fort + 4, confOld);
        continue;
      }

      if (type === 'gabtoli' && bx === 0 && bz === 2) {
        // Gabtoli Bus Stand: apron + named buses + tin waiting sheds
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(W, D * 0.6), new THREE.MeshStandardMaterial({ color: 0x4a4e50, roughness: 1 }));
        apron.rotation.x = -Math.PI / 2;
        apron.position.set(cx, 0.06, cz - D * 0.14);
        group.add(apron);
        const busKeys = ['bus_hanif', 'bus_madhumati', 'bus_shohag', 'bus_brtc'];
        for (let i = 0; i < 7; i++) {
          place(busKeys[i % busKeys.length], cx - W/2 + 10 + (i % 4) * 9, cz - D/2 + 8 + Math.floor(i / 4) * 8, { ry: Math.PI + rnd(-0.08, 0.08), collider: true, kind: 'car' });
        }
        for (let i = 0; i < 3; i++) place('tea_stall', cx - W/2 + 6 + i * 12, cz + D/2 - 6, { ry: 0, collider: true, kind: 'prop' });
        place('ind_a', cx + W/2 - 8, cz + D/2 - 8, { h: 12, collider: true });
        place('ind_b', cx - W/2 + 7, cz + D/2 - 7, { h: 10, collider: true });
        continue;
      }

      if (type === 'kamalapur' && bz === 5 && bx === 5) {
        // Kamalapur: platform + rusty coaches + station canopy + dense surroundings
        const platY = 0.9;
        const plat = new THREE.Mesh(new THREE.BoxGeometry(10, 0.9, D - 8), CONCRETE);
        plat.position.set(cx + W/2 - 7, platY / 2, cz);
        plat.receiveShadow = true;
        group.add(plat);
        // rails + coaches on west side of platform
        for (const off of [-3.2, -6.8]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, D - 6), DARK);
          rail.position.set(cx + W/2 - 12 + off, 0.12, cz);
          group.add(rail);
        }
        place('coach', cx + W/2 - 10, cz + 10, { len: 15, collider: true, kind: 'prop' });
        place('coach', cx + W/2 - 10, cz - 8, { len: 15, ry: 0.02, collider: true, kind: 'prop' });
        // canopy columns
        for (let i = 0; i < 4; i++) {
          place('const_frame', cx - W/2 + 10, cz - D/2 + 6 + i * ((D - 12) / 3), { h: 9, collider: true });
        }
        // rest of the block: dense
        fillLots(cx - 6, cz, W - 18, D, POOLS.kamalapur);
        continue;
      }

      if (type === 'motijheel' && bz === 1 && bx === 5) {
        // Shapla Chottor: roundabout plaza in the middle, towers around
        place('shapla', cx, cz, { h: 11 });
        // keepout circle r=13
        fillLotsAround(cx, cz, 14, W, D, conf);
        continue;
      }

      // generic: FULL adaptive lot fill — no empty space
      fillLots(cx, cz, W, D, conf, { bx, bz });

      // old dhaka bazaar: stalls spilling onto sidewalk edges
      if (conf.bazaar || conf.market) {
        for (let i = 0; i < 6; i++) {
          hawkerRoads.push({ x: cx + rnd(-W/2, W/2), z: cz + (i % 2 ? 1 : -1) * (D/2 + 1.2), ry: rnd(0, 6.28) });
        }
      }
    }
  }

  /** perimeter fill around a central square feature (fort): 4 strips outside hx,hz,half */
  function fillPerimeter(cx, cz, W, D, holeHalf, conf) {
    const inner = holeHalf + 2;
    const rects = [];
    // north & south bands
    const bandH = Math.max(0, D / 2 - inner);
    if (bandH > 3) {
      rects.push([cx, cz - inner - bandH / 2, W - 4, bandH]);
      rects.push([cx, cz + inner + bandH / 2, W - 4, bandH]);
    }
    // west & east bands
    const bandW = W / 2 - inner;
    if (bandW > 3) {
      rects.push([cx - inner - bandW / 2, cz, bandW, inner * 2]);
      rects.push([cx + inner + bandW / 2, cz, bandW, inner * 2]);
    }
    for (const [sx, sz, sw, sd] of rects) fillLots(sx, sz, sw, sd, conf);
  }

  /** adaptive lot fill: jittered grid, every lot occupied, buildings FIT their lot (alleys preserved) */
  function fillLots(cx, cz, W, D, conf, opt = {}) {
    if (W <= 2 || D <= 2) return;
    const cell = conf.cell || 10.5;
    const cols = Math.max(1, Math.round(W / cell));
    const rows = Math.max(1, Math.round(D / cell));
    const cw = W / cols, cd = D / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (opt.skipCenter && Math.abs(i - cols/2) < 1 && Math.abs(j - rows/2) < 1) continue;
        const lx = cx - W/2 + cw * (i + 0.5) + rnd(-0.6, 0.6);
        const lz = cz - D/2 + cd * (j + 0.5) + rnd(-0.6, 0.6);
        const key = pick(conf.models);
        const isRuin = conf.ruin && _rnd() < conf.ruin;

        // footprint fit: fill the lot aggressively, leave only alley slivers
        const sp = prepare(key);
        const baseW = sp ? sp.w : 3, baseD = sp ? sp.d : 3;
        const margin = conf.market || conf.bazaar ? 0.9 : 1.25;
        const fitScale = Math.min((cw - margin * 2) / Math.max(baseW, 0.6), (cd - margin * 2) / Math.max(baseD, 0.6), 7.0);
        // height target achieved by Y stretch (buildings loom, footprints stay max)
        const targetH = rnd(conf.h[0], conf.h[1]) * 1.35;
        const sy = sp && sp.h > 0.3 ? THREE.MathUtils.clamp(targetH / (sp.h * fitScale), 0.75, 3.6) : 1;

        if (isRuin) {
          if (_rnd() < 0.35) {
            const spF = prepare('const_frame');
            const fs = Math.min((cw - 3) / Math.max(spF ? spF.w : 8, 1), (cd - 3) / Math.max(spF ? spF.d : 8, 1), 1.2);
            place('const_frame', lx, lz, { s: fs, ry: rnd(-0.15, 0.15), collider: true });
            place('rubble', lx + rnd(-2, 2), lz + rnd(-2, 2), { s: rnd(0.8, 1.3), ry: rnd(0, 3.14), collider: true, kind: 'prop' });
          } else {
            const rec = place(key, lx, lz, { s: fitScale, sy, ry: rnd(-0.15, 0.15), tint: pick([0x6a6a66, 0x7d746a, 0x5c5a58]), tiltZ: rnd(0.03, 0.09) * (_rnd() < 0.5 ? -1 : 1), collider: true });
            if (rec && _rnd() < 0.5) place('rubble', lx + rnd(-3, 3), lz + rnd(-3, 3), { s: rnd(0.7, 1.2), ry: rnd(0, 3.14), collider: true, kind: 'prop' });
          }
          continue;
        }

        const tintShade = _rnd() < 0.75 ? new THREE.Color(1, 1, 1).offsetHSL(0, 0, rnd(-0.075, 0.04)) : null;
        const rec = place(key, lx, lz, { s: fitScale, sy, ry: rnd(-0.12, 0.12), tint: tintShade ? tintShade.getHex() : null, collider: true });
        if (rec && conf.signs && _rnd() < 0.4) {
          signSlots.push({ x: lx, z: lz, ry: rnd(0, 6.28), sign: pick(SIGN_DEFS) });
        }
        if (conf.suburb && _rnd() < 0.8) {
          place(pick(['tree_oak', 'tree_default', 'tree_small', 'tree_palm']), lx + rnd(-cw/2, cw/2), lz + cd/2 + 0.8, { h: rnd(4.5, 7.5), collider: true, kind: 'tree' });
        }
      }
    }
  }

  /** fill lots but keep a clear circle (Shapla plaza) */
  function fillLotsAround(cx, cz, rClear, W, D, conf) {
    const cell = conf.cell || 12;
    const cols = Math.max(1, Math.round(W / cell));
    const rows = Math.max(1, Math.round(D / cell));
    const cw = W / cols, cd = D / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lx = cx - W/2 + cw * (i + 0.5), lz = cz - D/2 + cd * (j + 0.5);
        if (Math.hypot(lx - cx, lz - cz) < rClear + Math.max(cw, cd) / 2) continue;
        const key = pick(conf.models);
        const sp = prepare(key);
        const fitScale = Math.min((cw - 3) / Math.max(sp ? sp.w : 3, 0.6), (cd - 3) / Math.max(sp ? sp.d : 3, 0.6), 6);
        const sy = sp && sp.h > 0.3 ? THREE.MathUtils.clamp(rnd(conf.h[0], conf.h[1]) * 1.3 / (sp.h * fitScale), 0.75, 3.4) : 1;
        place(key, lx, lz, { s: fitScale, sy, ry: rnd(-0.12, 0.12), tint: new THREE.Color(1, 1, 1).offsetHSL(0, 0, rnd(-0.06, 0.03)).getHex(), collider: true });
      }
    }
  }

  // ===== compound walls: the Dhaka street canyon =====
  {
    const washes = [0xd9d3c2, 0x9db8c9, 0xd9a9a0, 0xbfd0a8, 0xd8c48e, 0xc9c9c9];
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        const type = BLOCK_MAP[bz][bx];
        if (type === 'water' || type === 'park') continue;
        if (type === 'lalbagh' || type === 'depot' || type === 'kamalapur') continue; // have their own structures
        const cx = blockCX(bx), cz = blockCZ(bz);
        const W = blockW(bx), D = blockD(bz);
        const conf = POOLS[type];
        const wallH = conf.motijheel ? 2.8 : 2.35;
        const inset = 0.55;
        const key = _rnd() < 0.22 ? 'wall_tin' : 'wall_conc';
        // horizontal runs (north & south edges)
        for (const side of [-1, 1]) {
          const z = cz + side * (D / 2 - inset);
          const n = Math.floor((W - 3) / 7.8);
          for (let k = 0; k < n; k++) {
            if (_rnd() < 0.18) continue; // gate / alley gap
            const x = cx - W/2 + 4 + k * 7.8;
            place(key, x, z, { ry: side > 0 ? 0 : Math.PI, h: wallH, tint: pick(washes), collider: true, kind: 'wall' });
          }
        }
        // vertical runs (east & west edges)
        for (const side of [-1, 1]) {
          const x = cx + side * (W / 2 - inset);
          const n = Math.floor((D - 3) / 7.8);
          for (let k = 0; k < n; k++) {
            if (_rnd() < 0.18) continue;
            const z = cz - D/2 + 4 + k * 7.8;
            place(key, x, z, { ry: side > 0 ? Math.PI / 2 : -Math.PI / 2, h: wallH, tint: pick(washes), collider: true, kind: 'wall' });
          }
        }
      }
    }
  }

  // ===== street level chaos =====
  // hawkers on road edges (collected during block fill) + extra everywhere
  for (const h of hawkerRoads) {
    place(pick(['parasol_a', 'parasol_b', 'tea_stall', 'awning']), h.x, h.z, { h: rnd(2.2, 2.8), ry: h.ry, collider: true, kind: 'prop' });
    if (_rnd() < 0.5) place('dumpster', h.x + rnd(-2.5, 2.5), h.z + rnd(-2.5, 2.5), { h: 1.2, collider: true, kind: 'prop' });
  }
  // tea stalls at many intersection corners (the Dhaka constant)
  for (let ix = 0; ix < ROAD_X.length; ix++) {
    for (let iz = 0; iz < ROAD_Z.length; iz++) {
      if ((ix * 5 + iz * 3) % 4 !== 0) continue;
      const s1 = _rnd() < 0.5 ? 1 : -1, s2 = _rnd() < 0.5 ? 1 : -1;
      place('tea_stall', ROAD_X[ix] + s1 * 8.4, ROAD_Z[iz] + s2 * 8.4, { ry: rnd(0, 6.28), collider: true, kind: 'prop' });
      if (_rnd() < 0.4) place('rickshaw', ROAD_X[ix] - s1 * 6.4, ROAD_Z[iz] + s2 * 11.5, { ry: rnd(0, 6.28) });
    }
  }
  // parked rickshaw stands along roads
  for (let i = 0; i < 26; i++) {
    const vertical = _rnd() < 0.5;
    const li = 1 + Math.floor(_rnd() * 5);
    const t = rnd(-160, 160);
    const off = (i % 2 ? 4.6 : -4.6);
    const n = 2 + Math.floor(_rnd() * 3);
    for (let k = 0; k < n; k++) {
      const x = vertical ? lineX(li) + off : t + k * 1.75;
      const z = vertical ? t + k * 1.75 : lineZ(li) + off;
      place('rickshaw', x, z, { ry: vertical ? (off > 0 ? -Math.PI / 2 : Math.PI / 2) : (off > 0 ? Math.PI : 0) + rnd(-0.06, 0.06) });
    }
  }
  // NOTE: overhead 'wires' GLB reads as thick pipes at street scale — left out;
  // pole lines carry the look instead. (Procedural catenary wires: later polish.)
  // traffic lights, street lights, poles, signs
  for (let ix = 0; ix < ROAD_X.length; ix++) {
    for (let iz = 0; iz < ROAD_Z.length; iz++) {
      if ((ix * 7 + iz * 13) % 3 !== 0) continue;
      place('tlight', ROAD_X[ix] + 7.8, ROAD_Z[iz] + 7.8, { h: 6.2, collider: true, kind: 'prop' });
    }
  }
  for (let i = 0; i < ROAD_Z.length; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 0) place('streetlight', (ROAD_X[j] + ROAD_X[j + 1]) / 2, ROAD_Z[i] - 8.4, { h: 8.5, ry: Math.PI, collider: true, kind: 'prop' });
    }
  }
  for (let i = 0; i < 10; i++) {
    place(pick(['sign_stop', 'sign_warning']), ROAD_X[1 + (i % 5)] + rnd(-4, 4), ROAD_Z[1 + (i % 5)] + rnd(-4, 4), { h: 2.6, collider: true, kind: 'prop' });
  }
  // parked cars in chaos spots
  const parkedKeys = ['car_taxi', 'car_sedan', 'car_suv', 'car_truck', 'car_police'];
  for (let i = 0; i < 16; i++) {
    const vertical = _rnd() < 0.5;
    const li = 1 + Math.floor(_rnd() * 5);
    const t = rnd(-150, 150);
    const off = 4.5 + rnd(0, 0.3);
    if (vertical) place(pick(parkedKeys), lineX(li) + (i % 2 ? off : -off), t, { len: rnd(4.2, 4.9), ry: i % 2 ? -Math.PI / 2 : Math.PI / 2, collider: true, kind: 'car' });
    else place(pick(parkedKeys), t, lineZ(li) + (i % 2 ? off : -off), { len: rnd(4.2, 4.9), ry: i % 2 ? 0 : Math.PI, collider: true, kind: 'car' });
  }

  // ===== shop signs =====
  let signIdx = 0;
  for (const slot of signSlots) {
    const mesh = makeSignMesh(slot.sign);
    const off = 8.2;
    const sx = slot.x + Math.sin(slot.ry) * off;
    const sz = slot.z + Math.cos(slot.ry) * off;
    mesh.position.set(sx, rnd(4.5, 7.5), sz);
    mesh.rotation.y = slot.ry;
    group.add(mesh);
    signIdx++;
  }

  // ===== landmarks (beacons + labels) =====
  const landmarks = [];
  for (const lm of LANDMARK_DEFS) {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 7, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: lm.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.set(lm.x, 3.5, lm.z);
    group.add(beacon);
    const sprite = makeLabelSprite(lm);
    sprite.position.set(lm.x, 9.4, lm.z);
    group.add(sprite);
    landmarks.push({ name: lm.name, bn: lm.bn, x: lm.x, z: lm.z });
  }

  const depot = { x: blockCX(0) - 6, z: blockCZ(5) + 8 };
  {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 5, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x35d07f, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.set(depot.x, 2.5, depot.z);
    group.add(beacon);
    const sprite = makeLabelSprite({ bn: 'মামা গ্যারেজ', name: 'MAMA GARAGE' });
    sprite.position.set(depot.x, 7.4, depot.z);
    group.add(sprite);
  }

  // ===== flush to instanced meshes =====
  let instancedMeshes = 0;
  for (const [key, list] of Object.entries(placements)) {
    const sp = species[key];
    if (!sp) continue;
    for (const mesh of instancedPlacements(sp.prims, list)) group.add(mesh);
    instancedMeshes += sp.prims.length;
  }
  scene.add(group);

  const intersections = [];
  for (const x of ROAD_X) for (const z of ROAD_Z) intersections.push({ x, z });

  const counts = {};
  for (const [k, list] of Object.entries(placements)) counts[k] = list.length;

  return {
    ROAD_X, ROAD_Z, ROAD_HALF,
    colliders, waterZones, landmarks, depot, intersections,
    info: {
      instances: Object.values(counts).reduce((a, b) => a + b, 0),
      species: Object.keys(counts).length,
      instancedMeshes,
      colliders: colliders.length,
      signs: signIdx,
      counts,
    },
  };
}

// ---------- signage helpers ----------
function makeLabelSprite(lm) {
  const tex = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(8, 12, 10, 0.78)';
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 248, 231, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 58px "Noto Sans Bengali", "Noto Sans", sans-serif';
    ctx.fillText(lm.bn, w / 2, 72);
    ctx.fillStyle = 'rgba(255, 248, 231, 0.92)';
    ctx.font = '600 30px "Noto Sans", sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText(lm.name.toUpperCase(), w / 2, 122);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(11, 3.44, 1);
  return sprite;
}

function makeSignMesh(def) {
  const tex = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = def.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff8e7';
    ctx.font = '700 56px "Noto Sans Bengali", "Noto Sans", sans-serif';
    ctx.fillText(def.bn, w / 2, 58);
    ctx.font = '600 26px "Noto Sans", sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText(def.en, w / 2, 100);
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
  );
}
