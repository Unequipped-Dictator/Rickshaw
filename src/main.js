/**
 * R1 world boot — loads textures + model species, builds Dakkar,
 * sky-lit with follow shadows, inspect camera (orbit + WASD pan).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadTexture, loadHDRI, loadAllModels } from './assets.js';
import { buildWorld, WORLD_MODELS } from './world.js';
import './style.css';

const el = (id) => document.getElementById(id);
const fill = el('loading-fill'), status = el('loading-status');
const setProgress = (frac, label) => {
  fill.style.width = `${Math.round(frac * 100)}%`;
  if (label) status.textContent = label;
};

// --- renderer / scene ---
// ?lite = QA mode for software renderers: no shadows/HDRI, pixelRatio 1
const LITE = new URLSearchParams(location.search).has('lite');
const canvas = el('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE });
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d8de, 90, 260);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
camera.position.set(58, 42, 74);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0, 0);

// --- lighting ---
const hemi = new THREE.HemisphereLight(0xdfeef5, 0x4a5340, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
const shadowSpan = 95;
sun.shadow.camera.left = -shadowSpan; sun.shadow.camera.right = shadowSpan;
sun.shadow.camera.top = shadowSpan; sun.shadow.camera.bottom = -shadowSpan;
sun.shadow.camera.far = 400;
scene.add(sun);
scene.add(sun.target);

// --- load ---
setProgress(0.03, 'textures…');
try {
  const [asphaltTex, hdri] = await Promise.all([
    loadTexture('assets/textures/asphalt_diff_1k.jpg'),
    LITE ? Promise.resolve(null) : loadHDRI('assets/textures/sky_1k.hdr'),
  ]);
  asphaltTex.colorSpace = THREE.SRGBColorSpace;
  asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;

  if (hdri) {
    hdri.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdri).texture;
    scene.background = hdri;
    scene.backgroundIntensity = 0.9;
    pmrem.dispose();
  } else {
    scene.background = new THREE.Color(0xc9d8de);
  }

  setProgress(0.08, `models 0/${WORLD_MODELS.length}`);
  const assets = await loadAllModels(
    WORLD_MODELS.map(([p, k]) => [`assets/models/${p}`, k]),
    (done, total, key) => setProgress(0.08 + (done / total) * 0.82, `models ${done}/${total} — ${key}`)
  );

  setProgress(0.95, 'building Dakkar…');
  await new Promise((r) => setTimeout(r, 30)); // let the bar paint

  const world = buildWorld(scene, assets, { asphaltTex });

  // spawn camera near the depot looking across Old Dhaka
  camera.position.set(world.depot.x + 30, 26, world.depot.z + 34);
  controls.target.set(world.depot.x, 0, world.depot.z);

  // QA override: ?cam=x,y,z&look=x,z
  const qp = new URLSearchParams(location.search);
  if (qp.get('cam')) {
    const [x, y, z] = qp.get('cam').split(',').map(Number);
    camera.position.set(x, y, z);
    const [lx, lz] = (qp.get('look') || '0,0').split(',').map(Number);
    controls.target.set(lx, 0, lz);
  }

  setProgress(1, 'ready');
  el('loading').classList.add('hidden');
  el('hud').classList.remove('hidden');

  const info = world.info;
  el('hud-top').textContent =
    `R1 — DAKKAR BUILT · ${info.instances} instances · ${info.species} species · ` +
    `${info.instancedMeshes} instanced meshes · ${info.colliders} colliders · ${info.signs} signs`;
  el('hud-bottom').innerHTML =
    'drag orbit · scroll zoom · <b>WASD</b> pan · right-drag pan — landmarks: ' +
    `<b>${world.landmarks.length}</b> · water zones: <b>${world.waterZones.length}</b> · next: R2 player`;

  // stats + shadow follow loop
  const hudTick = 0;
  renderer.setAnimationLoop(() => {
    controls.update();
    // keep the shadow frustum around what we look at
    sun.position.copy(controls.target).add(new THREE.Vector3(60, 90, 40));
    sun.target.position.copy(controls.target);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
  });
} catch (err) {
  console.error(err);
  status.textContent = `FAILED: ${err.message}`;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// WASD panning for inspection
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const panSpeed = 40;
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
(function panLoop() {
  requestAnimationFrame(panLoop);
  if (keys.size === 0) return;
  camera.getWorldDirection(_f); _f.y = 0; _f.normalize();
  _r.crossVectors(_f, new THREE.Vector3(0, 1, 0));
  const move = new THREE.Vector3();
  if (keys.has('w')) move.add(_f);
  if (keys.has('s')) move.sub(_f);
  if (keys.has('d')) move.add(_r);
  if (keys.has('a')) move.sub(_r);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(panSpeed * 0.016);
    camera.position.add(move);
    controls.target.add(move);
  }
})();
