/**
 * world.js — Dakkar city builder (R1)
 * 7×7 intersection grid · 7 districts · Hatirjheel water · 16 landmarks
 * · Mama Garage depot · Bangla signage · AABB colliders.
 *
 * Everything is drawn with per-species InstancedMesh, so the whole city
 * stays around ~100 draw calls (mobile budget).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitModel, measure, extractPrims, instancedPlacements } from './assets.js';

// ---------- grid ----------
export const GRID = {
  lines: 7,
  spacing: 64,
  half: 192,          // line coords: i*64-192 -> [-192..192]
  roadHalf: 7,        // road width 14
  blockHalf: 25,      // blocks 50x50
  ground: 520,
};
export const lineCoord = (i) => i * GRID.spacing - GRID.half;
export const blockCenter = (b) => lineCoord(b) + GRID.spacing / 2; // b in 0..5

// ---------- districts ----------
// block types: old | farmgate | dhanmondi | motijheel | gabtoli | karwan
//              | water | park | depot | mixed
const BLOCK_MAP = [
  // bz=0 (north)
  ['farmgate', 'farmgate', 'mixed', 'mixed', 'motijheel', 'motijheel'],
  // bz=1
  ['farmgate', 'farmgate', 'mixed', 'banglamotor', 'motijheel', 'motijheel'],
  // bz=2
  ['gabtoli', 'mixed', 'water', 'water', 'tejgaon', 'mixed'],
  // bz=3
  ['gabtoli', 'mixed', 'water', 'park', 'tejgaon', 'mixed'],
  // bz=4
  ['old', 'lalbagh', 'shahbagh', 'gulistan', 'dhanmondi', 'dhanmondi'],
  // bz=5 (south)
  ['depot', 'old', 'karwan', 'karwan', 'dhanmondi', 'kamalapur'],
];

const POOLS = {
  old:      { models: ['com_a', 'com_b', 'com_c', 'com_d', 'com_e', 'com_f'], h: [7, 12], density: 0.95, signs: true },
  lalbagh:  { models: ['com_g', 'com_h', 'com_i', 'com_j'], h: [6, 10], density: 0.85, signs: true },
  shahbagh: { models: ['com_k', 'com_l', 'com_m', 'sub_a', 'sub_b'], h: [8, 13], density: 0.8, signs: true },
  gulistan: { models: ['com_c', 'com_d', 'com_e', 'com_n', 'sub_c'], h: [8, 14], density: 0.85, signs: true },
  karwan:   { models: ['com_a', 'com_b', 'com_i', 'com_j', 'sub_d'], h: [6, 10], density: 0.8, market: true, signs: true },
  farmgate: { models: ['com_f', 'com_g', 'com_h', 'com_k', 'com_l'], h: [12, 18], density: 0.85 },
  motijheel:{ models: ['sky_a', 'sky_b', 'sky_c', 'sky_d', 'sky_e', 'com_m', 'com_n'], h: [20, 34], density: 0.8 },
  gabtoli:  { models: ['ind_a', 'ind_b', 'ind_c', 'ind_d', 'ind_e', 'ind_f'], h: [9, 14], density: 0.75, industrial: true },
  tejgaon:  { models: ['ind_g', 'ind_h', 'com_l', 'com_m'], h: [9, 15], density: 0.75, industrial: true },
  dhanmondi:{ models: ['sub_a', 'sub_b', 'sub_c', 'sub_d', 'sub_e', 'sub_f'], h: [5.5, 9], density: 0.55, suburb: true },
  kamalapur:{ models: ['ind_i', 'ind_j', 'sub_g', 'com_k'], h: [7, 12], density: 0.7, industrial: true },
  banglamotor: { models: ['com_h', 'com_i', 'com_n', 'sky_a'], h: [12, 20], density: 0.8 },
  mixed:    { models: ['com_b', 'com_e', 'com_j', 'sub_h', 'sub_i'], h: [8, 15], density: 0.7 },
  park:     { models: [], h: [0, 0], density: 0 },
  water:    { models: [], h: [0, 0], density: 0 },
  depot:    { models: ['ind_k', 'ind_l'], h: [7, 10], density: 0.4 },
};

// ---------- models used by the world ----------
export const WORLD_MODELS = [
  // buildings
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
  // nature
  ['nature/nat_tree_oak.glb', 'tree_oak'],
  ['nature/nat_tree_default.glb', 'tree_default'],
  ['nature/nat_tree_palm.glb', 'tree_palm'],
  ['nature/nat_tree_fat.glb', 'tree_fat'],
  ['nature/nat_tree_cone.glb', 'tree_cone'],
  ['nature/nat_tree_simple.glb', 'tree_simple'],
  ['nature/nat_tree_tall.glb', 'tree_tall'],
  ['nature/nat_tree_small.glb', 'tree_small'],
  // props
  ['props/road_traffic_light.glb', 'tlight'],
  ['props/road_light_curved.glb', 'streetlight'],
  ['props/road_electricity_pole.glb', 'epole'],
  ['props/road_dumpster.glb', 'dumpster'],
  ['props/road_construction_barrier.glb', 'barrier'],
  ['props/road_road_sign_stop.glb', 'sign_stop'],
  ['props/road_road_sign_warning.glb', 'sign_warning'],
  // parked vehicles (traffic AI comes in R3)
  ['vehicles/car_taxi.glb', 'car_taxi'],
  ['vehicles/car_sedan.glb', 'car_sedan'],
  ['vehicles/car_suv.glb', 'car_suv'],
  ['vehicles/car_van.glb', 'car_van'],
  ['vehicles/car_truck.glb', 'car_truck'],
  ['vehicles/car_police.glb', 'car_police'],
  // idle people
  ['characters/char_character_male_a.glb', 'male_a'],
  ['characters/char_character_male_b.glb', 'male_b'],
  ['characters/char_character_female_a.glb', 'female_a'],
  ['characters/char_character_female_b.glb', 'female_b'],
];

// ---------- landmarks (16) ----------
const LANDMARK_DEFS = [
  { name: 'New Market',       bn: 'নিউ মার্কেট',      x: blockCenter(1) - 8, z: lineCoord(5) + 9,  color: 0xffd23f },
  { name: 'Lalbagh Gate',     bn: 'লালবাগ কেল্লা',     x: lineCoord(0) + 9,  z: blockCenter(4) - 8, color: 0xd97b4f },
  { name: 'Farmgate Office',  bn: 'ফার্মগেট',         x: blockCenter(1) + 8, z: lineCoord(0) - 9,  color: 0x6fb1d9 },
  { name: 'Karwan Bazar',     bn: 'কারওয়ান বাজার',    x: blockCenter(2) + 8, z: lineCoord(5) + 9,  color: 0xffd23f },
  { name: 'Dhanmondi School', bn: 'ধানমন্ডি স্কুল',    x: blockCenter(4) - 8, z: lineCoord(5) + 9,  color: 0x7bc47f },
  { name: 'Dhanmondi Lake',   bn: 'ধানমন্ডি লেক',      x: lineCoord(5) - 9,  z: blockCenter(4) + 8, color: 0x4fa3c7 },
  { name: 'Motijheel Bank',   bn: 'মতিঝিল ব্যাংক',     x: blockCenter(4) - 8, z: lineCoord(0) - 9,  color: 0x6fb1d9 },
  { name: 'Motijheel Shapla', bn: 'শাপলা চত্বর',       x: lineCoord(5) + 9,  z: blockCenter(1) - 8, color: 0xe4709a },
  { name: 'Gabtoli Bus Stand',bn: 'গাবতলী বাস স্ট্যান্ড', x: lineCoord(0) + 9, z: blockCenter(2) - 8, color: 0xc7b34f },
  { name: 'Hatirjheel Park',  bn: 'হাতিরঝিল পার্ক',    x: blockCenter(3) + 8, z: blockCenter(3) + 8, color: 0x7bc47f },
  { name: 'Bangla Motor',     bn: 'বাংলা মোটর',        x: blockCenter(3) - 8, z: lineCoord(0) - 9,  color: 0xffd23f },
  { name: 'Shahbagh',         bn: 'শাহবাগ',           x: blockCenter(2) + 8, z: blockCenter(4) - 8, color: 0xe4709a },
  { name: 'Kamalapur Rail',   bn: 'কমলাপুর রেল',       x: lineCoord(5) + 9,  z: lineCoord(5) + 9,  color: 0xc7b34f },
  { name: 'Gulistan',         bn: 'গুলিস্তান',         x: blockCenter(3) - 8, z: blockCenter(4) + 8, color: 0xd97b4f },
  { name: 'Mirpur Road',      bn: 'মিরপুর রোড',        x: lineCoord(1) - 9,  z: blockCenter(3) - 8, color: 0x9a86d9 },
  { name: 'Tejgaon',          bn: 'তেজগাঁও',           x: blockCenter(4) + 8, z: blockCenter(2) - 8, color: 0x9a86d9 },
];

// ---------- Bangla shop signs ----------
const SIGN_DEFS = [
  { bn: 'চা ও সিঙ্গারা',      en: 'TEA & SINGARA',    bg: '#0f6e4f' },
  { bn: 'বিসমিল্লাহ স্টোর',   en: 'BISMILLAH STORE',  bg: '#7a1f1f' },
  { bn: 'মা টেলিকম',         en: 'MA TELECOM',       bg: '#1d4f7a' },
  { bn: 'ভাই ভাই হোটেল',     en: 'BHAI BHAI HOTEL',  bg: '#8a5a12' },
  { bn: 'নিউ মার্কেট',        en: 'NEW MARKET',       bg: '#5a1d7a' },
  { bn: 'ফার্মেসি',           en: 'PHARMACY',         bg: '#0f6e4f' },
  { bn: 'সেলুন',             en: 'SALON',            bg: '#7a1f5a' },
  { bn: 'মিষ্টি মুখ',         en: 'MISTI MUKH SWEETS',bg: '#8a5a12' },
  { bn: 'মধুমতি ব্যাংক',      en: 'MADHUMATI BANK',   bg: '#1d4f7a' },
  { bn: 'হানিফ পরিবহন',      en: 'HANIF TRANSPORT',  bg: '#7a1f1f' },
  { bn: 'ধীরে চালান',        en: 'GO SLOW',          bg: '#444a44' },
  { bn: 'হর্ন নিষেধ',         en: 'NO HORN',          bg: '#444a44' },
  { bn: 'রিকশা গ্যারেজ',      en: 'RICKSHAW GARAGE',  bg: '#0f6e4f' },
  { bn: 'মোবাইল রিচার্জ',     en: 'MOBILE RECHARGE',  bg: '#1d4f7a' },
];

// ---------- helpers ----------

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

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
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
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
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
  );
  return mesh;
}

const _rnd = mulberry(20261106);
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = (a, b) => a + _rnd() * (b - a);
const pick = (arr) => arr[Math.floor(_rnd() * arr.length)];

// ---------- world builder ----------

export function buildWorld(scene, assets, { asphaltTex }) {
  const species = {};   // key -> { prims, w, h, d }
  const placements = {}; // key -> [{x,z,ry,s,y}]
  const colliders = []; // {minX,maxX,minZ,maxZ,kind}
  const group = new THREE.Group();

  function prepare(key) {
    if (species[key]) return species[key];
    const src = assets[key];
    if (!src) return null;
    const wrap = fitModel(src, {});
    const m = measure(wrap);
    const prims = extractPrims(wrap);
    species[key] = { prims, w: m.w, h: m.h, d: m.d };
    return species[key];
  }

  function place(key, x, z, { ry = 0, h = null, len = null, s = null, collider = false, kind = 'building' } = {}) {
    const sp = prepare(key);
    if (!sp) return null;
    let scale = s;
    if (!scale) {
      const target = h ?? len;
      if (target == null) scale = 1;
      else if (h != null) scale = h / sp.h;
      else scale = len / Math.max(sp.w, sp.d);
    }
    const rec = { x, z, ry, s: scale };
    (placements[key] ??= []).push(rec);
    if (collider) {
      // conservative AABB: use max horizontal extent scaled (rotations are axis-aligned mostly)
      const hw = (Math.abs(Math.cos(ry)) * sp.w + Math.abs(Math.sin(ry)) * sp.d) * scale / 2;
      const hd = (Math.abs(Math.sin(ry)) * sp.w + Math.abs(Math.cos(ry)) * sp.d) * scale / 2;
      colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, kind });
    }
    return rec;
  }

  // ===== ground =====
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID.ground, GRID.ground),
    new THREE.MeshStandardMaterial({ color: 0x8e9b7c, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ===== roads (2 draw calls) =====
  const roadLen = GRID.half * 2 + GRID.roadHalf * 2;
  const asphalt = asphaltTex.clone();
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(roadLen / 7, GRID.roadHalf * 2 / 7);
  asphalt.needsUpdate = true;

  const buildRoadSet = (vertical) => {
    const geoms = [];
    for (let i = 0; i < GRID.lines; i++) {
      const g = new THREE.PlaneGeometry(vertical ? GRID.roadHalf * 2 : roadLen, vertical ? roadLen : GRID.roadHalf * 2);
      const x = vertical ? lineCoord(i) : 0;
      const z = vertical ? 0 : lineCoord(i);
      g.rotateX(-Math.PI / 2);
      g.translate(x, vertical ? 0.045 : 0.02, z);
      geoms.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
    mesh.receiveShadow = true;
    return mesh;
  };
  group.add(buildRoadSet(false));
  group.add(buildRoadSet(true));

  // ===== center dashes (1 draw call) =====
  {
    const geoms = [];
    const dash = new THREE.PlaneGeometry(0.28, 2.2);
    for (let i = 0; i < GRID.lines; i++) {
      const c = lineCoord(i);
      for (let j = 0; j < GRID.lines - 1; j++) {
        const from = lineCoord(j) + GRID.roadHalf + 1.5;
        const to = lineCoord(j + 1) - GRID.roadHalf - 1.5;
        for (let d = from; d < to; d += 4.2) {
          const h = dash.clone(); h.rotateX(-Math.PI / 2); h.translate(c, 0.07, d + 1.1);
          geoms.push(h);
          const v = dash.clone(); v.rotateX(-Math.PI / 2); v.rotateY(Math.PI / 2); v.translate(d + 1.1, 0.07, c);
          geoms.push(v);
        }
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(geoms), new THREE.MeshBasicMaterial({ color: 0xf4d35e }));
    group.add(mesh);
  }

  // ===== sidewalks (1 draw call) =====
  {
    const geoms = [];
    const rimW = 2.6, hgt = 0.14;
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        if (BLOCK_MAP[bz][bx] === 'water') continue;
        const cx = blockCenter(bx), cz = blockCenter(bz);
        const B = GRID.blockHalf, L = B * 2, inner = B - rimW;
        const strips = [
          [cx, cz - B + rimW / 2, L, rimW],
          [cx, cz + B - rimW / 2, L, rimW],
          [cx - B + rimW / 2, cz, rimW, L - rimW * 2],
          [cx + B - rimW / 2, cz, rimW, L - rimW * 2],
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

  // ===== water (Hatirjheel) =====
  const waterZones = [];
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1 });
    for (let bx = 0; bx < 6; bx++) {
      for (let bz = 0; bz < 6; bz++) {
        if (BLOCK_MAP[bz][bx] !== 'water') continue;
        const cx = blockCenter(bx), cz = blockCenter(bz);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GRID.blockHalf * 2, GRID.blockHalf * 2), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(cx, 0.09, cz);
        group.add(mesh);
        waterZones.push({ minX: cx - 25, maxX: cx + 25, minZ: cz - 25, maxZ: cz + 25 });
      }
    }
  }

  // ===== buildings per block =====
  const signSlots = [];
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const type = BLOCK_MAP[bz][bx];
      const conf = POOLS[type];
      const cx = blockCenter(bx), cz = blockCenter(bz);

      if (type === 'water') continue;

      if (type === 'park') {
        // Hatirjheel Park: grass + trees + planters
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshStandardMaterial({ color: 0x5d8a4a, roughness: 1 }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(cx, 0.1, cz);
        grass.receiveShadow = true;
        group.add(grass);
        for (let i = 0; i < 14; i++) {
          place(pick(['tree_oak', 'tree_fat', 'tree_tall', 'tree_default']), cx + rnd(-19, 19), cz + rnd(-19, 19), { h: rnd(5, 9), collider: true, kind: 'tree' });
        }
        for (let i = 0; i < 6; i++) place('planter', cx + rnd(-16, 16), cz + rnd(-16, 16), { h: 1, collider: true, kind: 'prop' });
        continue;
      }

      if (type === 'depot') {
        // Mama Garage: open pad at SW corner of the block + small structures N/E
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), new THREE.MeshStandardMaterial({ color: 0x3c4043, roughness: 1 }));
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(cx - 12, 0.06, cz + 12);
        group.add(pad);
        place('ind_k', cx + 12, cz - 18, { h: 9, collider: true });
        place('ind_l', cx - 16, cz - 18, { h: 7, collider: true });
        place('cont_a', cx + 2, cz + 2, { h: 2.6, ry: Math.PI / 2, collider: true, kind: 'prop' });
        place('car_van', cx - 8, cz + 14, { len: 5.2, ry: 0.4, collider: true, kind: 'car' });
        signSlots.push({ x: cx - 12, z: cz + 4.2, ry: Math.PI, sign: SIGN_DEFS[12] }); // garage sign facing south road? face north
        continue;
      }

      // generic district block: 8 perimeter slots
      const B = 25, depth = 18.5, widths = [-13.5, 13.5];
      const slots = [];
      for (const w of widths) {
        slots.push({ x: cx + w, z: cz - depth, ry: 0 }, { x: cx + w, z: cz + depth, ry: Math.PI });
      }
      for (const w of widths) {
        slots.push({ x: cx - depth, z: cz + w, ry: Math.PI / 2 }, { x: cx + depth, z: cz + w, ry: -Math.PI / 2 });
      }

      for (const slot of slots) {
        if (_rnd() > conf.density) {
          if (conf.suburb && _rnd() < 0.6) {
            place(pick(['tree_oak', 'tree_default', 'tree_small', 'tree_palm']), slot.x, slot.z, { h: rnd(4, 7), collider: true, kind: 'tree' });
          }
          continue;
        }
        const key = pick(conf.models);
        const height = rnd(conf.h[0], conf.h[1]);
        const rec = place(key, slot.x + rnd(-1, 1), slot.z + rnd(-1, 1), { ry: slot.ry + rnd(-0.08, 0.08), h: height, collider: true });
        if (rec && conf.signs && _rnd() < 0.3) {
          signSlots.push({ ...slot, x: slot.x, z: slot.z, sign: pick(SIGN_DEFS) });
        }
      }

      // market extras: parasols + awning stalls + idle people
      if (conf.market) {
        for (let i = 0; i < 7; i++) {
          place(pick(['parasol_a', 'parasol_b', 'awning', 'awning_wide']), cx + rnd(-17, 17), cz + rnd(-17, 17), { h: rnd(2.2, 3), ry: rnd(0, 6.28) });
        }
        for (let i = 0; i < 5; i++) {
          place(pick(['male_a', 'male_b', 'female_a', 'female_b']), cx + rnd(-15, 15), cz + rnd(-15, 15), { h: 1.7, ry: rnd(0, 6.28), collider: true, kind: 'ped' });
        }
        for (let i = 0; i < 3; i++) place('dumpster', cx + rnd(-18, 18), cz + rnd(-18, 18), { h: 1.2, collider: true, kind: 'prop' });
      }

      // industrial extras: containers, chimney, water tower
      if (conf.industrial) {
        for (let i = 0; i < 4; i++) {
          place(pick(['cont_a', 'cont_b', 'cont_c']), cx + rnd(-17, 17), cz + rnd(-17, 17), { h: 2.6, ry: _rnd() < 0.5 ? 0 : Math.PI / 2, collider: true, kind: 'prop' });
        }
        if (_rnd() < 0.6) place('chimney', cx + rnd(-14, 14), cz + rnd(-14, 14), { h: rnd(15, 19), collider: true });
        if (_rnd() < 0.5) place('watertower', cx + rnd(-14, 14), cz + rnd(-14, 14), { h: rnd(15, 18), collider: true });
      }

      // suburb fences
      if (conf.suburb) {
        for (let i = 0; i < 4; i++) {
          if (_rnd() < 0.5) place('fence', cx + rnd(-18, 18), cz + rnd(-18, 18), { h: 1.1, ry: _rnd() < 0.5 ? 0 : Math.PI / 2 });
        }
      }
    }
  }

  // ===== shop signs =====
  let signIdx = 0;
  for (const slot of signSlots) {
    const mesh = makeSignMesh(slot.sign);
    // put sign on the road-facing side of the slot, 4.5m up
    const face = slot.ry ?? 0;
    const off = 7.5;
    const sx = slot.x + Math.sin(face) * off;
    const sz = slot.z + Math.cos(face) * off;
    mesh.position.set(sx, 4.8 + (signIdx % 3) * 0.8, sz);
    mesh.rotation.y = face;
    group.add(mesh);
    signIdx++;
  }

  // ===== street furniture along roads =====
  // traffic lights at ~2/3 intersections
  for (let ix = 0; ix < GRID.lines; ix++) {
    for (let iz = 0; iz < GRID.lines; iz++) {
      if ((ix * 7 + iz * 13) % 3 !== 0) continue;
      const x = lineCoord(ix), z = lineCoord(iz);
      place('tlight', x + 8.6, z + 8.6, { h: 6.2, collider: true, kind: 'prop' });
    }
  }
  // street lights every other mid-block
  for (let i = 0; i < GRID.lines; i++) {
    for (let j = 0; j < 3; j++) {
      const t = lineCoord(i) + 32;
      if ((i + j) % 2 === 0) place('streetlight', t, lineCoord(j + 1) - 8.4, { h: 8.5, ry: Math.PI, collider: true, kind: 'prop' });
      else place('streetlight', lineCoord(j + 1) + 8.4, t, { h: 8.5, ry: -Math.PI / 2, collider: true, kind: 'prop' });
    }
  }
  // electricity poles
  for (let i = 0; i < GRID.lines; i++) {
    for (let j = 0; j < GRID.lines - 1; j++) {
      if ((i + j) % 2) continue;
      place('epole', lineCoord(i) - 9.5, lineCoord(j) + 32, { h: 8.2, collider: true, kind: 'prop' });
    }
  }
  // a few signs & barriers
  for (let i = 0; i < 10; i++) {
    place(pick(['sign_stop', 'sign_warning']), lineCoord(1 + (i % 5)) + rnd(-4, 4), lineCoord(i % 5 + 1) + rnd(-4, 4), { h: 2.6, collider: true, kind: 'prop' });
  }
  for (let i = 0; i < 6; i++) place('barrier', lineCoord((i * 2) % 6 + 1) + rnd(-5, 5), lineCoord((i * 3) % 6) + rnd(-5, 5), { h: 1, ry: rnd(0, 3.14), collider: true, kind: 'prop' });

  // ===== parked cars along roads =====
  const parkedKeys = ['car_taxi', 'car_sedan', 'car_suv', 'car_truck', 'car_police'];
  for (let i = 0; i < 12; i++) {
    const alongRoad = _rnd() < 0.5;
    const line = 1 + Math.floor(_rnd() * 5);
    const t = rnd(-150, 150);
    const off = 5.1 + rnd(0, 0.6);
    if (alongRoad) place(pick(parkedKeys), t, lineCoord(line) + (i % 2 ? off : -off), { len: rnd(4.2, 4.8), ry: i % 2 ? 0 : Math.PI, collider: true, kind: 'car' });
    else place(pick(parkedKeys), lineCoord(line) + (i % 2 ? off : -off), t, { len: rnd(4.2, 4.8), ry: i % 2 ? Math.PI / 2 : -Math.PI / 2, collider: true, kind: 'car' });
  }

  // ===== landmarks =====
  const landmarks = [];
  for (const lm of LANDMARK_DEFS) {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 7, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: lm.color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    );
    beacon.position.set(lm.x, 3.5, lm.z);
    group.add(beacon);

    const sprite = makeLabelSprite(lm);
    sprite.position.set(lm.x, 9.2, lm.z);
    group.add(sprite);

    landmarks.push({ name: lm.name, bn: lm.bn, x: lm.x, z: lm.z });
  }

  // ===== depot marker =====
  const depot = { x: blockCenter(0) - 12, z: blockCenter(5) + 12 };
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

  // ===== flush placements into InstancedMeshes =====
  let instancedMeshes = 0;
  for (const [key, list] of Object.entries(placements)) {
    const sp = species[key];
    if (!sp) continue;
    for (const mesh of instancedPlacements(sp.prims, list)) group.add(mesh);
    instancedMeshes += sp.prims.length;
  }

  scene.add(group);

  // road graph for traffic (R3) and job routing
  const intersections = [];
  for (let ix = 0; ix < GRID.lines; ix++)
    for (let iz = 0; iz < GRID.lines; iz++)
      intersections.push({ x: lineCoord(ix), z: lineCoord(iz) });

  const counts = {};
  for (const [k, list] of Object.entries(placements)) counts[k] = list.length;

  return {
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
