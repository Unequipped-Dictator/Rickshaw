import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({
  viewport: { width: 780, height: 360 }, hasTouch: true, isMobile: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto('http://localhost:5173/?lite', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });
await page.waitForTimeout(1200);
const layout = await page.evaluate(() => {
  const dash = document.getElementById('dash').getBoundingClientRect();
  const hudTop = getComputedStyle(document.getElementById('hud-top')).display;
  const hudBot = getComputedStyle(document.getElementById('hud-bottom')).display;
  return { dashY: Math.round(dash.y), dashH: Math.round(dash.height), hudTop, hudBot, vw: innerWidth, vh: innerHeight };
});
console.log('LAYOUT:', JSON.stringify(layout), '| errors:', errors.length ? errors : 'none');
await page.screenshot({ path: '/tmp/mobile.png', timeout: 60000 });
await browser.close();
