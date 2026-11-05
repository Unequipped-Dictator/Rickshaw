/**
 * traffic.js — AI cars + pedestrians (R3).
 *
 * Cars: 14, left-hand traffic (Dhaka), drive the road grid, turn at
 * intersections, brake for cars/player ahead. ~2 draw calls per car.
 * Peds: 16, patrol sidewalk rings around blocks; honking makes nearby
 * ones jump aside (the core joke mechanic — feed it, it's funny).
 *
 * Emits gameplay events for the R4 tribunal:
 *   { type: 'car'|'ped', impact, x, z, t }
 */
import * as THREE from 'three';
import { fitModel } from './assets.js';

const LANE_OFFSET = 3.5;      // left-lane center offset from road centerline
const CAR_SPEED = [5.5, 8.5]; // m/s cruise range
const CAR_RADIUS = 1.5;

// ---------- helpers ----------
const lineAt = (i, spacing, half) => i * spacing - half;

/** left-hand-side lane position for a travel direction */
function laneTarget(ix, iz, dir, grid) {
  // dir: {dx, dz} unit axis; travel along vertical road (dx=0) or horizontal (dz=0)
  const L = grid.lines, S = grid.spacing, H = grid.half;
  let x, z;
  if (dir.dx !== 0) {
    // horizontal road at z = lineAt(iz)
    z = lineAt(iz, S, H) + (dir.dx > 0 ? LANE_OFFSET : -LANE_OFFSET); // left of travel
    x = null; // free along x
  } else {
    x = lineAt(ix, S, H) + (dir.dz > 0 ? -LANE_OFFSET : LANE_OFFSET);
    z = null;
  }
  return { x, z };
}

export function initTraffic(world, scene, assets, player) {
  const grid = { lines: 7, spacing: 64, half: 192 };
  const rng = Math.random;

  // ---------- cars ----------
  const carKeys = ['car_taxi', 'car_sedan', 'car_suv', 'car_van', 'car_truck', 'car_police'];
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const key = carKeys[i % carKeys.length];
    if (!assets[key]) continue;
    const wrap = fitModel(assets[key], { size: 4.6, axis: 'length' });
    // Kenney cars face +z after fit? verify by bounds; rotate to face +z forward
    wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(wrap);

    const vertical = rng() < 0.5;
    const line = 1 + Math.floor(rng() * (grid.lines - 2)); // inner lines mostly
    const dir = vertical
      ? { dx: 0, dz: rng() < 0.5 ? 1 : -1 }
      : { dx: rng() < 0.5 ? 1 : -1, dz: 0 };
    const lane = laneTarget(vertical ? line : 0, vertical ? 0 : line, dir, grid);

    const t = (rng() * 2 - 1) * grid.half;
    cars.push({
      key, wrap,
      dir, line, vertical,
      x: vertical ? lane.x : t,
      z: vertical ? t : lane.z,
      heading: Math.atan2(dir.dx, dir.dz),
      v: CAR_SPEED[0], cruise: rng() * (CAR_SPEED[1] - CAR_SPEED[0]) + CAR_SPEED[0],
      stopT: 0,
    });
  }

  function carAheadBlocked(car) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const px = car.x + fx * 6.2, pz = car.z + fz * 6.2; // point 6m ahead
    // other cars
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.x - px, dz = o.z - pz;
      if (dx * dx + dz * dz < 3.4 * 3.4) return true;
    }
    // player
    const dxp = player.state.x - px, dzp = player.state.z - pz;
    if (dxp * dxp + dzp * dzp < 3.0 * 3.0) return true;
    return false;
  }

  /** at intersection center: maybe turn */
  function maybeTurn(car) {
    const H = grid.half, S = grid.spacing;
    const nearestIx = Math.round((car.x + H) / S);
    const nearestIz = Math.round((car.z + H) / S);
    const ix = Math.max(0, Math.min(grid.lines - 1, nearestIx));
    const iz = Math.max(0, Math.min(grid.lines - 1, nearestIz));
    const cx = lineAt(ix, S, H), cz = lineAt(iz, S, H);

    const distToNode = car.vertical ? Math.abs(car.z - cz) : Math.abs(car.x - cx);
    if (distToNode > 1.2) return;
    // only decide once per node: check we are basically at the crossing center
    if (Math.abs(car.x - cx) > 1.2 && Math.abs(car.z - cz) > 1.2) return;

    const roll = rng();
    let ndir = car.dir;
    if (roll < 0.25) {
      // turn: perpendicular, keep inside grid
      const opts = [{ dx: car.dir.dz, dz: car.dir.dx }, { dx: -car.dir.dz, dz: -car.dir.dx }];
      for (const o of opts) {
        const nx = car.x + o.dx * S, nz = car.z + o.dz * S;
        if (nx >= -H - 1 && nx <= H + 1 && nz >= -H - 1 && nz <= H + 1) { ndir = o; if (rng() < 0.55) break; }
      }
    } else {
      // straight: bail at grid edge
      const nx = car.x + ndir.dx * S, nz = car.z + ndir.dz * S;
      if (nx < -H - 1 || nx > H + 1 || nz < -H - 1 || nz > H + 1) {
        ndir = { dx: -car.dir.dx, dz: -car.dir.dz };
      }
    }
    if (ndir !== car.dir) {
      car.dir = ndir;
      const vertical = ndir.dx === 0;
      // find the line we're on for the new axis
      const lineIdx = vertical
        ? Math.max(0, Math.min(grid.lines - 1, Math.round((car.x + H) / S)))
        : Math.max(0, Math.min(grid.lines - 1, Math.round((car.z + H) / S)));
      car.vertical = vertical;
      car.line = lineIdx;
      const lane = laneTarget(vertical ? lineIdx : 0, vertical ? 0 : lineIdx, ndir, grid);
      // snap onto the new lane smoothly: set the cross-axis target via hard set (roads are wide)
      if (vertical) car.x = lane.x; else car.z = lane.z;
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

    const bx = Math.floor(rng() * 6), bz = Math.floor(rng() * 6);
    peds.push({
      key, wrap, bx, bz,
      t: rng(),                       // perimeter param 0..1
      speed: (0.55 + rng() * 0.5) * (rng() < 0.5 ? 1 : -1), // walk either way
      jumpT: -1, jumpDirX: 0, jumpDirZ: 0,
    });
  }

  const RING = 23.7; // sidewalk centerline distance from block center
  function pedPoint(p) {
    const cx = lineAt(p.bx, 64, 192) + 32;
    const cz = lineAt(p.bz, 64, 192) + 32;
    const per = RING * 8;
    let d = ((p.t % 1) + 1) % 1 * per; // distance along ring
    const side = Math.floor(d / (RING * 2));
    const f = (d - side * RING * 2) - RING;
    let x, z, ang;
    switch (side) {
      case 0: x = cx + f; z = cz - RING; ang = Math.PI / 2; break;
      case 1: x = cx + RING; z = cz + f; ang = 0; break;
      case 2: x = cx - f; z = cz + RING; ang = -Math.PI / 2; break;
      default: x = cx - RING; z = cz - f; ang = Math.PI; break;
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

    // honk edge with cooldown
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

      // keep on grid
      car.x = THREE.MathUtils.clamp(car.x, -196, 196);
      car.z = THREE.MathUtils.clamp(car.z, -196, 196);

      // wheel-ish bob (no wheel refs on clones; tiny body roll by speed)
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
        // separate: push player out
        ps.x = car.x + nx * rr;
        ps.z = car.z + nz * rr;
        if (relSpeed > 2.5) {
          ps.crashed = relSpeed;
          emit({ type: 'car', impact: relSpeed, x: ps.x, z: ps.z });
        }
        ps.v *= -0.35;
        car.stopT = 1.1; // the AI driver stops in disbelief
      }
    }

    // ---- pedestrians ----
    for (const p of peds) {
      p.t += (p.speed * 0.011) * dt;
      const pt = pedPoint(p);

      // honk reaction
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
        if (p.jumpT >= J) { p.jumpT = -1; }
        else {
          const k = Math.sin((p.jumpT / J) * Math.PI); // out-and-back
          jx = p.jumpDirX * 1.5 * k;
          jz = p.jumpDirZ * 1.5 * k;
          jy = 0.45 * Math.sin((p.jumpT / J) * Math.PI * 2) ** 2;
          // landing: emit ped event once, at the apex-ish
          if (!p.hitEmitted && p.jumpT > J * 0.5) {
            const ddx = pt.x - ps.x, ddz = pt.z - ps.z;
            if (ddx * ddx + ddz * ddz < 2.2 * 2.2 && Math.abs(ps.v) > 2) {
              emit({ type: 'ped', impact: Math.abs(ps.v), x: pt.x, z: pt.z });
            }
            p.hitEmitted = p.jumpT < J; // reset on next jump
          }
        }
      }

      p.wrap.position.set(pt.x + jx, jy, pt.z + jz);
      p.wrap.rotation.y = pt.ang;
      // subtle walk bob
      if (p.jumpT < 0) p.wrap.position.y = Math.abs(Math.sin(p.t * 34)) * 0.045;
    }

    return events;
  }

  function drainEvents() {
    return events.splice(0, events.length);
  }

  return { cars, peds, update, drainEvents };
}
