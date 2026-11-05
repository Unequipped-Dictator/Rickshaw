/** Deterministic physics test — steps the sim at fixed 60Hz inside the page. */
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5174/?lite', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });

const res = await page.evaluate(() => {
  const P = window.__player, W = window.__world;
  const I = { throttle: 0, brake: 0, steer: 0, horn: false };
  const stepN = (n) => { for (let i = 0; i < n; i++) { P.step(1 / 60, I); P.sync(1 / 60); } };
  const st = P.state;
  const out = {};

  // 1) accelerate 4s
  I.throttle = 1; stepN(240);
  out.accel = { v: +st.v.toFixed(2), dist: +st.odo.toFixed(1) }; // expect v=12 (capped), dist ~35m

  // 2) steer left 1s at speed
  const h0 = st.heading;
  I.steer = -1; stepN(60); I.steer = 0;
  out.steer = { dHeading: +(st.heading - h0).toFixed(3), stillFast: st.v > 8 };

  // 3) brake 1.5s
  I.throttle = 0; I.brake = 1; stepN(90);
  out.brake = { v: +st.v.toFixed(2) }; // expect ~0 (maybe slight reverse)

  // 4) water slowdown: teleport into Hatirjheel
  const wz = W.waterZones[0];
  st.x = (wz.minX + wz.maxX) / 2; st.z = (wz.minZ + wz.maxZ) / 2; st.v = 0;
  I.brake = 0; I.throttle = 1; stepN(180);
  out.water = { inWater: st.inWater, vTop: +st.v.toFixed(2) }; // expect inWater, v ~2.4 (12*0.2)

  // 5) battery death: drain to 0 then try throttle
  st.battery = 0.05; st.x = 0; st.z = 190.5; st.v = 0; // middle of a road, no water
  stepN(30); // drains in ~0.5s
  const vDead = (() => { I.throttle = 1; stepN(300); return st.v; })();
  out.dead = { battery: +st.battery.toFixed(2), vCrawl: +Math.abs(vDead).toFixed(2) }; // expect v <= ~1.7

  // 6) recharge at depot
  st.x = W.depot.x; st.z = W.depot.z; I.throttle = 0; stepN(120);
  out.recharge = { battery: +st.battery.toFixed(1) }; // expect ~ +19% after 2s

  // 7) collision: drive into a known building AABB
  const c = W.colliders[0];
  console.error('collider under test:', JSON.stringify(c));
  I.throttle = 1; I.brake = 0;
  st.battery = 100; st.x = (c.minX + c.maxX) / 2; st.z = c.minZ - 8; st.v = 0;
  st.heading = 0; // +z, toward the box which sits at larger z
  st.heading = 0; stepN(300);
  out.collide = { bounced: st.crashed > 0, v: +st.v.toFixed(2), pushedOut: st.z > c.minZ - 2.5 };
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('\nCHECKS:',
  'accel→12:', res.accel.v === 12, '| dist~35m:', res.accel.dist > 25 && res.accel.dist < 45,
  '| steering:', res.steer.dHeading < -0.2 && res.steer.stillFast,
  '| brake→~0 (or deliberate reverse):', Math.abs(res.brake.v) < 4.5,
  '| water slow:', res.water.inWater && res.water.vTop < 3,
  '| dead→crawl:', res.dead.vCrawl < 2,
  '| recharge:', res.recharge.battery > 15,
  '| collision:', res.collide.bounced && res.collide.pushedOut);
await browser.close();
