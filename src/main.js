/**
 * R2 boot — world + playable rickshaw: bicycle physics, battery, chase cam,
 * keyboard + touch. ?lite / ?cam= QA hooks kept from R1.
 */
import * as THREE from 'three';
import { loadTexture, loadHDRI, loadAllModels } from './assets.js';
import { buildWorld, WORLD_MODELS } from './world.js';
import { createPlayer, RICK } from './player.js';
import { input, bindTouch } from './input.js';
import './style.css';

const el = (id) => document.getElementById(id);
const fill = el('loading-fill'), status = el('loading-status');
const setProgress = (frac, label) => {
  fill.style.width = `${Math.round(frac * 100)}%`;
  if (label) status.textContent = label;
};

const LITE = new URLSearchParams(location.search).has('lite');

// --- renderer / scene ---
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

// --- lighting ---
scene.add(new THREE.HemisphereLight(0xdfeef5, 0x4a5340, 0.55));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
const shadowSpan = 60;
sun.shadow.camera.left = -shadowSpan; sun.shadow.camera.right = shadowSpan;
sun.shadow.camera.top = shadowSpan; sun.shadow.camera.bottom = -shadowSpan;
sun.shadow.camera.far = 300;
scene.add(sun, sun.target);

// --- load & build ---
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
    (done, total, key) => setProgress(0.08 + (done / total) * 0.8, `models ${done}/${total} — ${key}`)
  );

  setProgress(0.92, 'building Dakkar…');
  await new Promise((r) => setTimeout(r, 30));
  const world = buildWorld(scene, assets, { asphaltTex });
  window.__world = world; // QA hook

  setProgress(0.97, 'assembling rickshaw…');
  const player = createPlayer(world, scene);
  window.__rick = player.state;   // QA hook
  window.__player = player;       // QA hook (deterministic physics tests)

  el('loading').classList.add('hidden');
  el('hud').classList.remove('hidden');
  el('hud-top').textContent = 'R2 — RIDEABLE · WASD/arrows drive · SPACE horn · GAS/BRAKE on touch';
  el('hud-bottom').innerHTML = `city: <b>${world.info.instances}</b> instances / ${world.info.instancedMeshes} meshes — find the green beacon to recharge`;

  const speedVal = el('speed-val'), batBar = el('battery-bar'), msg = el('dash-msg');

  // --- chase camera ---
  const camPos = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  function updateCamera(dt, snap = false) {
    fwd.set(Math.sin(player.state.heading), 0, Math.cos(player.state.heading));
    desired.copy(player.state.position).addScaledVector(fwd, -8.2).add(new THREE.Vector3(0, 3.9, 0));
    if (snap) camPos.copy(desired);
    else camPos.lerp(desired, 1 - Math.exp(-4.2 * dt));
    camera.position.copy(camPos);
    camera.lookAt(
      player.state.position.x + fwd.x * 4.5,
      1.35,
      player.state.position.z + fwd.z * 4.5
    );
    const fovKick = 55 + Math.min(6, Math.abs(player.state.v) * 0.4);
    if (Math.abs(camera.fov - fovKick) > 0.1) { camera.fov = fovKick; camera.updateProjectionMatrix(); }
  }
  // player.state.position is a getter-less plain object; wrap it:
  player.state.position = new THREE.Vector3(player.state.x, 0, player.state.z);

  updateCamera(0, true);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const s = player.state;
    player.step(dt, input);
    player.sync(dt);
    s.position.set(s.x, 0, s.z);
    updateCamera(dt);

    // shadow frustum follows the player
    sun.position.set(s.x + 40, 70, s.z + 28);
    sun.target.position.set(s.x, 0, s.z);
    sun.target.updateMatrixWorld();

    // dash
    speedVal.textContent = String(Math.round(Math.abs(s.v) * 3.6));
    const pct = Math.max(0, Math.min(100, (s.battery / RICK.batteryMax) * 100));
    batBar.style.width = pct.toFixed(1) + '%';
    batBar.classList.toggle('low', pct < 25);
    msg.textContent = s.recharging && pct < 99.9 ? 'RECHARGING…' :
      pct <= 0 ? 'BATTERY DEAD — MANUAL MODE (good luck)' :
      pct < 25 ? 'LOW BATTERY' :
      s.inWater ? 'WATER — 5x SLOW' : '';

    renderer.render(scene, camera);
  });
} catch (err) {
  console.error(err);
  status.textContent = `FAILED: ${err.message}`;
}

addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 250));
visualViewport?.addEventListener('resize', onResize);
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

bindTouch();
