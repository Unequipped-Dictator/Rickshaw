/**
 * traffic.js — AI cars + pedestrians (R3.5: irregular road network).
 *
 * Cars: 14, left-hand traffic (Dhaka), drive ROAD_X/ROAD_Z lines, turn at
 * intersections, brake for obstacles ahead. Peds: 16, patrol sidewalk rings
 * (rings sized to each block). Honking makes nearby peds jump aside.
 *
 * Emits gameplay events for the R4 tribunal:
 *   { type: 'car'|'ped', impact, x, z, t }
 */
import * as THREE from 'three';
import { fitModel } from './assets.js';

const LANE_OFFSET = 3.1;
const CAR_SPEED = [5.5, 8.5];
const CAR_RADIUS = 1.5;

export function initTraffic(world, scene, assets, player) {
  const RX = world.ROAD_X, RZ = world.ROAD_Z, RH = world.ROAD_HALF;
  const X0 = RX[0], X1 = RX[RX.length - 1];
  const Z0 = RZ[0], Z1 = RZ[RZ.length - 1];
  const nearest = (arr, v) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - v); if (d < bd) { bd = d; bi = i; } }
    return bi;
  };

  /** left-hand lane cross position for travel dir on road line li */
  function laneCross(vertical, li, dir) {
    if (vertical) return RX[li] + (dir.dz > 0 ? -LANE_OFFSET : LANE_OFFSET);
    return RZ[li] + (dir.dx > 0 ? LANE_OFFSET : -LANE_OFFSET);
  }

  // ---------- cars ----------
  const carKeys = ['car_taxi', 'car_sedan', 'car_suv', 'car_van', 'car_truck', 'car_police'];
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const key = carKeys[i % carKeys.length];
    if (!assets[key]) continue;
    const wrap = fitModel(assets[key], { size: 4.6, axis: 'length' });
    wrap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(wrap);

    const vertical = Math.random() < 0.5;
    const line = 1 + Math.floor(Math.random() * (RX.length - 2));
    const dir = vertical
      ? { dx: 0, dz: Math.random() < 0.5 ? 1 : -1 }
      : { dx: Math.random() < 0.5 ? 1 : -1, dz: 0 };
    const cross = laneCross(vertical, line, dir);
    const t = (Math.random() * 2 - 1) * 150;

    cars.push({
      key, wrap, dir, line, vertical,
      x: vertical ? cross : t,
      z: vertical ? t : cross,
      heading: Math.atan2(dir.dx, dir.dz),
      v: CAR_SPEED[0], cruise: Math.random() * (CAR_SPEED[1] - CAR_SPEED[0]) + CAR_SPEED[0],
      stopT: 0,
    });
  }

  function carAheadBlocked(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const px = car.x + fx * 6.2, pz = car.z + fz * 6.2;
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.x - px, dz = o.z - pz;
      if (dx * dx + dz * dz < 3.4 * 3.4) return true;
    }
    const dxp = player.state.x - px, dzp = player.state.z - pz;
    if (dxp * dxp + dzp * dzp < 3.0 * 3.0) return true;
    return false;
  }

  function maybeTurn(car) {
    const ix = nearest(RX, car.x), iz = nearest(RZ, car.z);
    const cx = RX[ix], cz = RZ[iz];
    if (Math.abs(car.x - cx) > 1.2 || Math.abs(car.z - cz) > 1.2) return;

    let ndir = car.dir;
    if (Math.random() < 0.25) {
      const opts = [{ dx: car.dir.dz, dz: car.dir.dx }, { dx: -car.dir.dz, dz: -car.dir.dx }];
      for (const o of opts) {
        const nx = car.x + o.dx * 60, nz = car.z + o.dz * 60;
        if (nx >= X0 - 1 && nx <= X1 + 1 && nz >= Z0 - 1 && nz <= Z1 + 1) { ndir = o; if (Math.random() < 0.55) break; }
      }
    } else {
      const nx = car.x + ndir.dx * 60, nz = car.z + ndir.dz * 60;
      if (nx < X0 - 1 || nx > X1 + 1 || nz < Z0 - 1 || nz > Z1 + 1) {
        ndir = { dx: -car.dir.dx, dz: -car.dir.dz };
      }
    }
    if (ndir !== car.dir) {
      car.dir = ndir;
      car.vertical = ndir.dx === 0;
      car.line = car.vertical ? nearest(RX, car.x) : nearest(RZ, car.z);
      const cross = laneCross(car.vertical, car.line, ndir);
      if (car.vertical) car.x = cross; else car.z = cross;
    }
  }

  // ---------- pedestrians ----------
  const pedKeys = ['male_a', 'male_b', 'female_a', 'female_b'];
  const peds = [];
  for (let i = 0; i < 16; i++) {
    const key = pedKeys[i % pedKeys.length];
    if (!assets[key]) continue;
    const wrap = fitModel(assets[key], { size: 1.7 });
    wrap.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(wrap);

    const bx = Math.floor(Math.random() * 6), bz = Math.floor(Math.random() * 6);
    peds.push({ key, wrap, bx, bz, t: Math.random(), speed: (0.55 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1), jumpT: -1, jumpDirX: 0, jumpDirZ: 0 });
  }

  /** sidewalk ring point for ped p (ring inset 1.3m from road edge, sized per block) */
  function pedPoint(p) {
    const cx = (RX[p.bx] + RX[p.bx + 1]) / 2;
    const cz = (RZ[p.bz] + RZ[p.bz + 1]) / 2;
    const rx = (RX[p.bx + 1] - RX[p.bx]) / 2 - 1.3;
    const rz = (RZ[p.bz + 1] - RZ[p.bz]) / 2 - 1.3;
    const per = 2 * (rx + rz) * 2 / 2 * 2; // 2*(2rx+2rz) simplified below
    const PER = 2 * (2 * rx + 2 * rz);
    let d = (((p.t % 1) + 1) % 1) * PER;
    const segLen = [2 * rx, 2 * rz, 2 * rx, 2 * rz];
    let seg = 0;
    while (d > segLen[seg]) { d -= segLen[seg]; seg = (seg + 1) % 4; }
    let x, z, ang;
    switch (seg) {
      case 0: x = cx - rx + d; z = cz - rz; ang = Math.PI / 2; break;
      case 1: x = cx + rx; z = cz - rz + d; ang = 0; break;
      case 2: x = cx + rx - d; z = cz + rz; ang = -Math.PI / 2; break;
      default: x = cx - rx; z = cz + rz - d; ang = Math.PI; break;
    }
    if (p.speed < 0) ang += Math.PI;
    return { x, z, ang };
  }

  // ---------- events ----------
  const events = [];
  let honkCooldown = 0;

  function emit(e) {
    if (events.length > 24) events.shift();
    events.push({ ...e, t: performance.now() / 1000 });
  }

  // ---------- main update ----------
  function update(dt, honkPressed) {
    const ps = player.state;

    honkCooldown -= dt;
    const honkNow = honkPressed && honkCooldown <= 0;
    if (honkNow) honkCooldown = 0.5;

    // ---- cars ----
    for (const car of cars) {
      car.stopT -= dt;
      const blocked = carAheadBlocked(car) || car.stopT > 0;
      const target = blocked ? 0 : car.cruise;
      car.v += (target - car.v) * Math.min(1, dt * (blocked ? 5 : 1.4));
      if (car.v < 0.02 && blocked) car.v = 0;

      car.x += car.dir.dx * car.v * dt;
      car.z += car.dir.dz * car.v * dt;
      car.heading = Math.atan2(car.dir.dx, car.dir.dz);
      maybeTurn(car);

      car.x = THREE.MathUtils.clamp(car.x, X0 - 4, X1 + 4);
      car.z = THREE.MathUtils.clamp(car.z, Z0 - 4, Z1 + 4);

      car.wrap.position.set(car.x, 0, car.z);
      car.wrap.rotation.y = car.heading;

      // ---- car vs player collision ----
      const dx = ps.x - car.x, dz = ps.z - car.z;
      const rr = CAR_RADIUS + 1.2;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const relSpeed = Math.max(Math.abs(ps.v), car.v);
        ps.x = car.x + nx * rr;
        ps.z = car.z + nz * rr;
        if (relSpeed > 2.5) {
          ps.crashed = relSpeed;
          emit({ type: 'car', impact: relSpeed, x: ps.x, z: ps.z });
        }
        ps.v *= -0.35;
        car.stopT = 1.1;
      }
    }

    // ---- pedestrians ----
    for (const p of peds) {
      p.t += (p.speed * 0.011) * dt;
      const pt = pedPoint(p);

      if (honkNow) {
        const dx = pt.x - ps.x, dz = pt.z - ps.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 14 * 14 && p.jumpT < 0) {
          const d = Math.max(0.5, Math.sqrt(d2));
          p.jumpT = 0;
          p.jumpDirX = dx / d;
          p.jumpDirZ = dz / d;
        }
      }

      let jx = 0, jz = 0, jy = 0;
      if (p.jumpT >= 0) {
        p.jumpT += dt;
        const J = 0.65;
        if (p.jumpT >= J) { p.jumpT = -1; p.hitEmitted = false; }
        else {
          const k = Math.sin((p.jumpT / J) * Math.PI);
          jx = p.jumpDirX * 1.5 * k;
          jz = p.jumpDirZ * 1.5 * k;
          jy = 0.45 * Math.sin((p.jumpT / J) * Math.PI * 2) ** 2;
          if (!p.hitEmitted && p.jumpT > J * 0.5) {
            const ddx = pt.x - ps.x, ddz = pt.z - ps.z;
            if (ddx * ddx + ddz * ddz < 2.2 * 2.2 && Math.abs(ps.v) > 2) {
              emit({ type: 'ped', impact: Math.abs(ps.v), x: pt.x, z: pt.z });
              p.hitEmitted = true;
            }
          }
        }
      }

      p.wrap.position.set(pt.x + jx, jy, pt.z + jz);
      p.wrap.rotation.y = pt.ang;
      if (p.jumpT < 0) p.wrap.position.y = Math.abs(Math.sin(p.t * 34)) * 0.045;
    }

    return events;
  }

  function drainEvents() {
    return events.splice(0, events.length);
  }

  return { cars, peds, update, drainEvents };
}
