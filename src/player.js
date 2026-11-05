/**
 * player.js — the Mama and his machine (R2).
 * Procedural low-poly cycle rickshaw (body, arched canopy, spoked wheels,
 * "মা / HORN PLEASE / ঢাকা" rear art) + bicycle-model physics, battery,
 * collision push-out, water slowdown, depot recharge.
 *
 * Model faces +Z. Everything is merged per-material: whole rickshaw ≈ 7 draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const RICK = {
  accel: 7.5,        // m/s²  (plan 5.1)
  maxSpeed: 12,      // m/s (upgradeable in R5 garage)
  reverseMax: 4,
  brake: 16,         // decel m/s²
  wheelbase: 2.05,   // m
  steerMax: 0.55,    // rad at standstill
  radius: 1.2,       // collision circle
  batteryMax: 100,
  drainBase: 0.24,   // %/s at throttle (plan 0.12, tuned ×2 for session pacing)
  drainSpeed: 0.009, // %/s per m/s
};

// ---------- materials ----------
const M = {
  frame: new THREE.MeshStandardMaterial({ color: 0x1f7a4d, roughness: 0.55, metalness: 0.25 }),
  frameDark: new THREE.MeshStandardMaterial({ color: 0x155c3a, roughness: 0.6, metalness: 0.2 }),
  seat: new THREE.MeshStandardMaterial({ color: 0xc23b22, roughness: 0.85 }),
  seatDark: new THREE.MeshStandardMaterial({ color: 0x8f2417, roughness: 0.85 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.75 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.95 }),
  hood: new THREE.MeshStandardMaterial({ color: 0xffcf3f, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide }),
  canopy: new THREE.MeshStandardMaterial({ color: 0x22633f, roughness: 0.7, side: THREE.DoubleSide }),
  canopyTrim: new THREE.MeshStandardMaterial({ color: 0xf2e6c9, roughness: 0.8, side: THREE.DoubleSide }),
};

function box(w, h, d, mat, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return { geom: g, mat };
}

/** one spoked wheel as merged geometry; axle along X so rotation.x rolls it */
function wheelGeometry(r, w) {
  const parts = [];
  const tire = new THREE.TorusGeometry(r - 0.045, 0.05, 8, 22).rotateY(Math.PI / 2);
  parts.push({ geom: tire, mat: M.tire });
  const hub = new THREE.CylinderGeometry(0.06, 0.06, w, 10).rotateX(Math.PI / 2).rotateY(Math.PI / 2);
  parts.push({ geom: hub, mat: M.chrome });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = new THREE.CylinderGeometry(0.013, 0.013, r * 2 - 0.14, 5).rotateZ(a).rotateY(Math.PI / 2);
    parts.push({ geom: spoke, mat: M.chrome });
  }
  const rim = new THREE.TorusGeometry(r - 0.1, 0.018, 6, 20).rotateY(Math.PI / 2);
  parts.push({ geom: rim, mat: M.chrome });
  return parts;
}

function mergeParts(parts) {
  const byMat = new Map();
  for (const { geom, mat } of parts) {
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geom);
  }
  const group = new THREE.Group();
  for (const [mat, geoms] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geoms), mat);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function rearArtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 150;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2e6c9';
  ctx.fillRect(0, 0, 256, 150);
  ctx.strokeStyle = '#c23b22';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 140);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c23b22';
  ctx.font = '700 64px "Noto Sans Bengali", "Noto Sans", sans-serif';
  ctx.fillText('মা', 128, 62);
  ctx.fillStyle = '#1d4f7a';
  ctx.font = '700 30px "Noto Sans", sans-serif';
  ctx.fillText('HORN PLEASE', 128, 103);
  ctx.fillStyle = '#0f6e4f';
  ctx.font = '700 26px "Noto Sans Bengali", "Noto Sans", sans-serif';
  ctx.fillText('ঢাকা', 128, 137);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the rickshaw. Returns Group with userData.wheels = {rearL, rearR, front, crank} */
export function buildRickshaw() {
  const bodyParts = [];
  const wheelParts = { rear: wheelGeometry(0.42, 0.09), front: wheelGeometry(0.30, 0.07) };

  // -- frame / chassis --
  bodyParts.push(box(1.32, 0.07, 2.5, M.frameDark, 0, 0.36, 0.1));          // floor pan
  bodyParts.push(box(0.09, 0.3, 2.3, M.frame, -0.66, 0.53, 0.05));          // side rails
  bodyParts.push(box(0.09, 0.3, 2.3, M.frame, 0.66, 0.53, 0.05));
  bodyParts.push(box(1.3, 0.09, 0.09, M.frame, 0, 0.68, -1.0));             // cross bars
  bodyParts.push(box(1.3, 0.09, 0.09, M.frame, 0, 0.68, 0.9));

  // -- seat --
  bodyParts.push(box(1.06, 0.16, 0.62, M.seat, 0, 0.78, -0.52));            // cushion
  bodyParts.push(box(1.06, 0.5, 0.14, M.seatDark, 0, 1.06, -0.86));         // backrest

  // -- canopy: arched half-pipe over the bench (opening faces down) --
  // half-cylinder with thetaStart=PI/2 gives the top half after rotateX(PI/2)
  const arch = new THREE.CylinderGeometry(0.78, 0.78, 1.5, 14, 1, true, Math.PI / 2, Math.PI);
  arch.rotateX(Math.PI / 2);
  const archTrim = new THREE.CylinderGeometry(0.79, 0.79, 0.18, 14, 1, true, Math.PI / 2, Math.PI);
  archTrim.rotateX(Math.PI / 2);
  arch.translate(0, 1.28, -0.25);
  archTrim.translate(0, 1.28, -0.25);
  bodyParts.push({ geom: arch, mat: M.canopy });
  bodyParts.push({ geom: archTrim, mat: M.canopyTrim });
  bodyParts.push(box(0.1, 0.62, 0.1, M.frame, -0.6, 1.0, -0.95));           // canopy posts
  bodyParts.push(box(0.1, 0.62, 0.1, M.frame, 0.6, 1.0, -0.95));
  bodyParts.push(box(0.1, 0.55, 0.1, M.frame, -0.6, 0.95, 0.5));
  bodyParts.push(box(0.1, 0.55, 0.1, M.frame, 0.6, 0.95, 0.5));

  // -- hood (front cowl over driver legs, open both ends) --
  const hoodArc = new THREE.CylinderGeometry(0.34, 0.38, 1.15, 10, 1, true, Math.PI / 2, Math.PI);
  hoodArc.rotateX(Math.PI / 2);
  hoodArc.translate(0, 0.95, 0.78);
  bodyParts.push({ geom: hoodArc, mat: M.hood });
  bodyParts.push(box(1.15, 0.34, 0.1, M.hood, 0, 0.72, 1.22));              // front apron
  bodyParts.push(box(0.06, 0.26, 0.06, M.chrome, -0.42, 1.16, 1.18));       // headlamp stalks
  bodyParts.push(box(0.06, 0.26, 0.06, M.chrome, 0.42, 1.16, 1.18));
  bodyParts.push(box(0.14, 0.14, 0.06, new THREE.MeshStandardMaterial({ color: 0xfff3c2, emissive: 0x867133, roughness: 0.3 }), -0.42, 1.32, 1.18));
  bodyParts.push(box(0.14, 0.14, 0.06, new THREE.MeshStandardMaterial({ color: 0xfff3c2, emissive: 0x867133, roughness: 0.3 }), 0.42, 1.32, 1.18));

  // -- handlebar --
  const bar = new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 1.18, 1.02);
  bodyParts.push({ geom: bar, mat: M.chrome });

  // -- crank + pedals (spins while moving; the manual-mode joke stays in R4) --
  const crank = new THREE.Group();
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8).rotateX(Math.PI / 2), M.chrome);
  crank.add(axle);
  const armGeom = new THREE.BoxGeometry(0.04, 0.3, 0.04);
  const arm1 = new THREE.Mesh(armGeom, M.frameDark); arm1.position.set(-0.22, 0.1, 0);
  const arm2 = new THREE.Mesh(armGeom, M.frameDark); arm2.position.set(0.22, -0.1, 0);
  const pedal1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.16), M.tire); pedal1.position.set(-0.22, 0.26, 0);
  const pedal2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.16), M.tire); pedal2.position.set(0.22, -0.26, 0);
  crank.add(arm1, arm2, pedal1, pedal2);
  crank.position.set(0, 0.42, 0.35); // driver's feet, in front of the bench

  // -- rear art plate (faces REAR — the whole point of "HORN PLEASE") --
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.48),
    new THREE.MeshStandardMaterial({ map: rearArtTexture(), roughness: 0.9 })
  );
  art.position.set(0, 1.02, -0.97);
  art.rotation.y = Math.PI;   // normal points -z (backward)
  art.rotation.x = 0.06;

  const body = mergeParts(bodyParts);

  // -- wheels --
  const mkWheel = (parts, r) => {
    const w = mergeParts(parts);
    w.userData.radius = r;
    return w;
  };
  const rearL = mkWheel(wheelParts.rear, 0.42);
  const rearR = mkWheel(wheelParts.rear, 0.42);
  const front = mkWheel(wheelParts.front, 0.30);
  rearL.position.set(-0.72, 0.42, -0.78);
  rearR.position.set(0.72, 0.42, -0.78);
  front.position.set(0, 0.30, 1.42);

  const group = new THREE.Group();
  group.add(body, rearL, rearR, front, crank, art);

  // front fork: steer yaw applies to a pivot group
  const fork = new THREE.Group();
  fork.position.set(0, 0.3, 1.42);
  front.position.set(0, 0, 0);
  fork.add(front);
  group.add(fork);

  group.userData.wheels = { rearL, rearR, front, fork, crank };
  return group;
}

// ---------- physics ----------

export function createPlayer(world, scene) {
  const group = buildRickshaw();
  scene.add(group);

  const s = {
    // spawn on the southern road, LEFT-HAND lane for +x travel, facing +x
    x: world.depot.x + 8, z: world.ROAD_Z[world.ROAD_Z.length - 1] + 3.5,
    heading: Math.PI / 2,
    v: 0, steerAngle: 0,
    battery: RICK.batteryMax,
    inWater: false, recharging: false, crashed: 0,
    odo: 0,
  };

  function resolveCollisions() {
    const r = RICK.radius;
    let hit = 0;
    for (const c of world.colliders) {
      if (s.x < c.minX - r || s.x > c.maxX + r || s.z < c.minZ - r || s.z > c.maxZ + r) continue;
      // find closest point on AABB
      const px = Math.max(c.minX, Math.min(s.x, c.maxX));
      const pz = Math.max(c.minZ, Math.min(s.z, c.maxZ));
      let dx = s.x - px, dz = s.z - pz;
      let d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 < 1e-9) {
        // center inside box: push out along smallest penetration axis
        const l = s.x - c.minX, rr = c.maxX - s.x, t = s.z - c.minZ, b = c.maxZ - s.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) s.x = c.minX - r; else if (m === rr) s.x = c.maxX + r;
        else if (m === t) s.z = c.minZ - r; else s.z = c.maxZ + r;
      } else {
        const d = Math.sqrt(d2);
        s.x = px + (dx / d) * r;
        s.z = pz + (dz / d) * r;
      }
      hit = 1;
    }
    // world bounds
    s.x = THREE.MathUtils.clamp(s.x, -236, 236);
    s.z = THREE.MathUtils.clamp(s.z, -236, 236);
    if (hit) {
      if (Math.abs(s.v) > 3) s.crashed = Math.abs(s.v);
      s.v *= -0.22;
    }
  }

  function step(dt, inp) {
    // steering: target angle shrinks with speed for stability
    const speedShrink = 1 / (1 + Math.abs(s.v) * 0.055);
    const target = inp.steer * RICK.steerMax * speedShrink;
    s.steerAngle += (target - s.steerAngle) * Math.min(1, dt * 9);

    // water check
    const water = world.waterZones.some((w) => s.x > w.minX && s.x < w.maxX && s.z > w.minZ && s.z < w.maxZ);
    s.inWater = water;

    const dead = s.battery <= 0;
    const effMax = RICK.maxSpeed * (water ? 0.2 : 1) * (dead ? 0.14 : 1);

    if (inp.throttle > 0) s.v += RICK.accel * inp.throttle * dt * (water ? 0.35 : 1) * (dead ? 0.5 : 1);
    if (inp.brake > 0) {
      if (s.v > 0.05) s.v -= RICK.brake * inp.brake * dt;
      else s.v = Math.max(s.v - RICK.accel * 0.65 * inp.brake * dt, -RICK.reverseMax);
    }

    // drag + clamp (water drag is proportional so you slow to the 5x cap but never get stuck)
    const drag = 0.55 + 0.011 * s.v * s.v + (water ? 0.9 * Math.abs(s.v) : 0);
    s.v -= Math.sign(s.v) * Math.min(Math.abs(s.v), drag * dt);
    s.v = THREE.MathUtils.clamp(s.v, -RICK.reverseMax, effMax);

    // bicycle turn (screen-correct: positive steer = RIGHT = clockwise on screen)
    if (Math.abs(s.v) > 0.04) {
      s.heading -= (s.v / RICK.wheelbase) * Math.tan(s.steerAngle) * dt;
    }

    const px = s.x, pz = s.z;
    s.x += Math.sin(s.heading) * s.v * dt;
    s.z += Math.cos(s.heading) * s.v * dt;
    s.odo += Math.hypot(s.x - px, s.z - pz);

    // battery
    if (inp.throttle > 0 && !dead) s.battery = Math.max(0, s.battery - (RICK.drainBase + RICK.drainSpeed * Math.abs(s.v)) * dt);
    else s.battery = Math.max(0, s.battery - 0.01 * dt);

    // depot recharge
    const dx = s.x - world.depot.x, dz = s.z - world.depot.z;
    s.recharging = dx * dx + dz * dz < 13 * 13;
    if (s.recharging) s.battery = Math.min(RICK.batteryMax, s.battery + 16 * dt);

    resolveCollisions();
    return s;
  }

  /** sync mesh + animate wheels/crank/roll */
  const _roll = new THREE.Group();
  function sync(dt) {
    group.position.set(s.x, 0, s.z);
    group.rotation.y = s.heading;

    const W = group.userData.wheels;
    const spin = (s.v * dt) / 0.42;
    W.rearL.rotation.x -= spin;
    W.rearR.rotation.x -= spin;
    W.front.rotation.x -= (s.v * dt) / 0.30;
    W.fork.rotation.y = -s.steerAngle * 0.9;
    W.crank.rotation.x -= Math.abs(spin) * 0.45;

    // lean into turns
    const lean = THREE.MathUtils.clamp(-s.steerAngle * s.v * 0.014, -0.09, 0.09);
    group.rotation.z += (lean - group.rotation.z) * Math.min(1, dt * 6);
  }

  return { group, state: s, step, sync };
}
