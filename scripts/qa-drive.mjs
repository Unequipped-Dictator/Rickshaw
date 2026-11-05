/** QA drive test — loads the game, holds throttle, verifies physics/HUD/camera. */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5174/?lite';
const OUT = process.env.QA_OUT || '/tmp/drive.png';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });
await page.waitForTimeout(800);

const read = () => page.evaluate(() => {
  const s = window.__rick;
  return { x: +s.x.toFixed(2), z: +s.z.toFixed(2), v: +s.v.toFixed(2), bat: +s.battery.toFixed(1), crashed: s.crashed, heading: +s.heading.toFixed(2) };
});

const t0 = await read();
console.log('t0 (spawn):', JSON.stringify(t0));

// hold throttle 3.5s
await page.keyboard.down('w');
await page.waitForTimeout(3500);
const t1 = await read();
const hudSpeed = await page.textContent('#speed-val');
console.log('t1 (3.5s throttle):', JSON.stringify(t1), '| HUD speed:', hudSpeed);

// steer while driving 2s
await page.keyboard.down('a');
await page.waitForTimeout(1600);
await page.keyboard.up('a');
const t2 = await read();
console.log('t2 (after left steer):', JSON.stringify(t2));
await page.screenshot({ path: OUT, timeout: 60000 });

// keep driving to see battery drain + maybe a crash
await page.waitForTimeout(4000);
const t3 = await read();
console.log('t3 (total ~11s):', JSON.stringify(t3));

// brake to stop
await page.keyboard.up('w');
await page.keyboard.down('s');
await page.waitForTimeout(1500);
await page.keyboard.up('s');
const t4 = await read();
console.log('t4 (after brake):', JSON.stringify(t4));

const moved = Math.hypot(t1.x - t0.x, t1.z - t0.z);
console.log('\nVERDICT:', {
  accelerated: t1.v > 3,
  moved_m: +moved.toFixed(1),
  steered: t2.heading !== t1.heading,
  batteryDrained: t3.bat < t0.bat,
  stopped: Math.abs(t4.v) < 0.5,
  crashes: t3.crashed > 0 ? 'yes (collisions work)' : 'none yet',
});
console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
