/** QA screenshot runner — captures the world after load, logs console errors. */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5174/?lite';
const OUT = process.env.QA_OUT || '/tmp/shot.png';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });

// wait for the loading overlay to hide (world built) — max 60s
try {
  await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });
} catch {
  const status = await page.textContent('#loading-status').catch(() => '?');
  console.log('TIMEOUT waiting for world. loading-status:', status);
}
await page.waitForTimeout(2500); // let a few frames render
const hud = await page.textContent('#hud-top').catch(() => '(no hud)');
console.log('HUD:', hud);
console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 6) : 'none');
await page.screenshot({ path: OUT, timeout: 60000 });
console.log('screenshot ->', OUT);
await browser.close();
