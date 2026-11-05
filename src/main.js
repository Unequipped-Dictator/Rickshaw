/**
 * R0 asset viewer — proves the pipeline end to end:
 * Vite bundle, three r160, GLB loading (joined meshes, WebP textures),
 * plus the model normalization helper every later system will reuse.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const MODELS = [
  ['buildings/com_building_a.glb', 'commercial'],
  ['buildings/com_building_skyscraper_a.glb', 'skyscraper'],
  ['buildings/sub_building_type_a.glb', 'suburban'],
  ['buildings/ind_building_a.glb', 'industrial'],
  ['buildings/ind_shipping_container_a.glb', 'container'],
  ['nature/nat_tree_oak.glb', 'oak'],
  ['nature/nat_tree_palm.glb', 'palm'],
  ['props/road_traffic_light.glb', 'light'],
  ['props/road_electricity_pole.glb', 'pole'],
  ['vehicles/car_taxi.glb', 'taxi'],
  ['vehicles/car_sedan.glb', 'sedan'],
  ['characters/char_character_male_a.glb', 'male'],
  ['characters/char_character_female_a.glb', 'female'],
];

const el = (id) => document.getElementById(id);
const fill = el('loading-fill'), status = el('loading-status');

// --- renderer / scene ---
const canvas = el('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5c9);
scene.fog = new THREE.Fog(0x87b5c9, 40, 140);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
camera.position.set(10, 6, 12);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 1.5, 0);

scene.add(new THREE.HemisphereLight(0xdfeef5, 0x3a4a3f, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
sun.position.set(14, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: 0x8a9a8e })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/**
 * fitModel — normalize any GLB: center on origin, sit on y=0, scale to target
 * height. Every system (world, traffic, player) uses this so raw asset axis
 * quirks (the old M10 problem) can never recur.
 */
function fitModel(object3D, { height = null, groundY = 0 } = {}) {
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  object3D.position.sub(center);                                 // center on origin…
  object3D.position.y = -center.y + size.y / 2;                  // …base sits exactly on y=0
  if (height && size.y > 0) {
    const s = height / size.y;
    object3D.scale.setScalar(s);
  }
  wrap.add(object3D);
  wrap.position.y = groundY;
  return wrap;
}

// --- load & arrange ---
const loader = new GLTFLoader();
let done = 0;
const loaded = [];

fill.style.width = '4%';
const jobs = MODELS.map(([file, label], i) =>
  new Promise((resolve) => {
    loader.load(
      `assets/models/${file}`,
      (gltf) => {
        const wrap = fitModel(gltf.scene, { height: label === 'male' || label === 'female' ? 1.7 : null });
        wrap.position.x = i * 3.2 - (MODELS.length * 3.2) / 2 + 1.6;
        wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        scene.add(wrap);
        loaded.push([label, file]);
        done++;
        fill.style.width = `${8 + (done / MODELS.length) * 92}%`;
        status.textContent = `${done}/${MODELS.length} — ${label}`;
        resolve();
      },
      undefined,
      (err) => { console.error('load failed:', file, err); done++; resolve(); }
    );
  })
);

Promise.all(jobs).then(() => {
  el('loading').classList.add('hidden');
  el('hud').classList.remove('hidden');
  el('hud-bottom').innerHTML =
    `pipeline OK — <b>${loaded.length}/${MODELS.length}</b> models rendered, ` +
    `<b>${loaded.length}</b> assets on disk (8.4 MB). Next: R1 world build.`;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
