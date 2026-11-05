/** QA traffic — deterministic sim checks for cars, peds, honk, collisions. */
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5173/?lite', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });

const res = await page.evaluate(() => {
  const T = window.__traffic, P = window.__player, W = window.__world;
  const I = { throttle: 0, brake: 0, steer: 0, horn: false };
  const st = P.state;
  const out = {};

  // 1) cars move + lane keeping
  const S = 64, H = 192;
  const x0 = T.cars.map((c) => ({ x: c.x, z: c.z, h: c.heading }));
  const stepN = (n) => { for (let i = 0; i < n; i++) T.update(1 / 60, false); };
  stepN(300); // 5s
  let onLane = 0, moving = 0, turned = 0;
  T.cars.forEach((c, i) => {
    const sp = Math.hypot(c.x - x0[i].x, c.z - x0[i].z);
    if (sp > 2) moving++;
    if (c.heading !== x0[i].h) turned++;
    const fixed = c.vertical ? c.x : c.z;
    const rel = ((fixed + H) % S + S) % S;
    const dLine = Math.min(rel, S - rel);
    if (dLine < 4.2) onLane++;  // lane center sits 3.5 off the centerline
  });
  out.cars = { total: T.cars.length, moving, turned, onLane };

  // 2) honk jump: teleport player next to a ped, honk once
  const ped = T.peds[0];
  const pp = (() => { // current ped pos from wrap
    return { x: ped.wrap.position.x, z: ped.wrap.position.z };
  })();
  st.x = pp.x - 4; st.z = pp.z; st.v = 0;
  T.update(1 / 60, true); // honk!
  const jumped = ped.jumpT >= 0;
  let hopY = 0;
  for (let i = 0; i < 20; i++) { T.update(1 / 60, false); hopY = Math.max(hopY, ped.wrap.position.y); }
  out.honk = { jumped, hopY: +hopY.toFixed(2), movedAside: +Math.hypot(ped.wrap.position.x - pp.x, ped.wrap.position.z - pp.z).toFixed(2) };

  // 3a) AI brakes for a player blocking the lane
  const car = T.cars.find((c) => c.v > 3) || T.cars[0];
  st.x = car.x + car.dir.dx * 8; st.z = car.z + car.dir.dz * 8;
  st.v = 0; st.crashed = 0;
  for (let i = 0; i < 150; i++) T.update(1 / 60, false);
  const gap = Math.hypot(st.x - car.x, st.z - car.z);
  const braked = car.v < 0.6 && st.crashed === 0 && gap > 2.0;

  // 3b) player rams the car at speed -> crash event
  st.x = car.x - car.dir.dx * 4.5; st.z = car.z - car.dir.dz * 4.5;
  st.v = 0; st.crashed = 0;
  const I2 = { throttle: 1, brake: 0, steer: 0, horn: false };
  st.heading = Math.atan2(car.x - st.x, car.z - st.z);
  let hit = false;
  for (let i = 0; i < 300 && !hit; i++) {
    P.step(1 / 60, I2); P.sync(1 / 60);
    T.update(1 / 60, false);
    if (st.crashed > 0) hit = true;
  }
  out.collide = { braked, gap: +gap.toFixed(1), hit, crashedAt: +st.crashed.toFixed(1) };

  // 4) peds on sidewalks: check ring distance for all peds
  let onRing = 0;
  for (const p of T.peds) {
    const cx = ((p.bx * S) - H) + 32, cz = ((p.bz * S) - H) + 32;
    const dx = Math.abs(p.wrap.position.x - cx), dz = Math.abs(p.wrap.position.z - cz);
    const ringDist = Math.max(Math.abs(dx - 23.7), Math.abs(dz - 23.7), Math.min(Math.abs(dx - 23.7), Math.abs(dz - 23.7)));
    const approx = (Math.abs(dx - 23.7) < 1.5 || Math.abs(dz - 23.7) < 1.5) && dx < 25 && dz < 25;
    if (approx) onRing++;
  }
  out.peds = { total: T.peds.length, onRing };
  out.events = T.drainEvents().length;
  return out;
});
console.log(JSON.stringify(res, null, 1));
const ok =
  res.cars.moving >= 10 && res.cars.onLane >= 13 &&
  res.honk.jumped && res.hopOK !== false && res.honk.hopY > 0.2 &&
  res.collide.braked && res.collide.hit &&
  res.peds.onRing >= 14;
console.log('\nVERDICT:', ok ? 'ALL TRAFFIC CHECKS PASS' : 'CHECK FAILED');
await browser.close();
