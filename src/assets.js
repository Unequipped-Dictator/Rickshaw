/**
 * assets.js — model/texture loading, normalization, instancing.
 * Every species is normalized ONCE (centered X/Z, base exactly on y=0);
 * instances then only apply uniform scale + rotation + position, so the
 * base-on-ground guarantee can never break (the old M10 bug class).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const hdriLoader = new RGBELoader();

const gltfCache = new Map();
export function loadModel(path) {
  if (!gltfCache.has(path)) {
    gltfCache.set(path, new Promise((resolve, reject) => {
      gltfLoader.load(path, (g) => resolve(g.scene), undefined, (e) => reject(e));
    }));
  }
  return gltfCache.get(path);
}

export function loadTexture(path) {
  return new Promise((resolve, reject) => texLoader.load(path, resolve, undefined, reject));
}

export function loadHDRI(path) {
  return new Promise((resolve, reject) => hdriLoader.load(path, resolve, undefined, reject));
}

/** Load many models with progress. @param entries: Array<[path, key]> */
export async function loadAllModels(entries, onProgress) {
  const out = {};
  let done = 0;
  await Promise.all(entries.map(async ([path, key]) => {
    try { out[key] = await loadModel(path); }
    catch (e) { console.error('model failed:', path, e); }
    done++;
    onProgress?.(done, entries.length, key);
  }));
  return out;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function rawBounds(obj) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  return { box: _box.clone(), size: _box.getSize(new THREE.Vector3()), center: _box.getCenter(new THREE.Vector3()) };
}

/**
 * Normalize a model into a wrapper Group:
 *  - centered on X/Z, base sitting exactly on y=0
 *  - if `size` given: uniform scale so `axis` ('height' or 'length') matches
 * Scale is applied BEFORE grounding, so the base-on-0 guarantee always holds.
 */
export function fitModel(src, { size = null, axis = 'height', groundY = 0 } = {}) {
  const obj = src.clone(true);
  let { box, size: sz } = rawBounds(obj);

  if (size && sz.y > 1e-6) {
    const current = axis === 'height' ? sz.y : Math.max(sz.x, sz.z);
    obj.scale.setScalar(size / current);
    ({ box, size: sz } = rawBounds(obj));
  }

  const wrap = new THREE.Group();
  obj.position.set(-box.min.x - sz.x / 2, -box.min.y, -box.min.z - sz.z / 2); // centered X/Z, base on 0
  wrap.add(obj);
  wrap.position.y = groundY;
  return wrap;
}

/** World-space footprint (full width, full depth, height) of a wrapper. */
export function measure(wrap) {
  const { size } = rawBounds(wrap);
  return { w: size.x, h: size.y, d: size.z };
}

/** Extract baked primitives from a normalized wrapper for instancing. */
export function extractPrims(wrap) {
  const prims = [];
  wrap.updateMatrixWorld(true);
  wrap.traverse((o) => {
    if (o.isMesh) {
      const geom = o.geometry.clone();
      geom.applyMatrix4(o.matrixWorld);
      prims.push({ geometry: geom, material: o.material });
    }
  });
  return prims;
}

/**
 * One InstancedMesh per primitive for all placements of a species.
 * @param placements: Array<{x, z, ry, s, tint?, tiltZ?, tiltX?}>
 *   tint: hex color multiplier (instance color), tilts in radians.
 */
export function instancedPlacements(prims, placements, { castShadow = true, receiveShadow = true } = {}) {
  const meshes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const needsColor = placements.some((p) => p.tint != null);
  for (const { geometry, material } of prims) {
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach((p, i) => {
      q.setFromAxisAngle(up, p.ry || 0);
      if (p.tiltZ || p.tiltX) {
        qTilt.setFromEuler(new THREE.Euler(p.tiltX || 0, 0, p.tiltZ || 0));
        q.multiply(qTilt);
      }
      pos.set(p.x, p.y || 0, p.z);
      const sc = p.s ?? 1;
      scl.set(sc, sc * (p.sy || 1), sc);
      mesh.setMatrixAt(i, m.compose(pos, q, scl));
      if (needsColor) {
        mesh.setColorAt(i, col.set(p.tint != null ? p.tint : 0xffffff));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    meshes.push(mesh);
  }
  return meshes;
}
