import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5173/?lite', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.hidden', { timeout: 90000, state: 'attached' });
const res = await page.evaluate(() => {
  const T = window.__traffic, S = 64, H = 192;
  for (let i = 0; i < 300; i++) T.update(1/60, false);
  return T.cars.map((c) => {
    // distance from cross-axis to nearest road centerline
    const fixed = c.vertical ? c.x : c.z;
    const rel = ((fixed + H) % S + S) % S;
    const dLine = Math.min(rel, S - rel); // 0 = on centerline, 3.5 = lane
    return { v: c.vertical ? 1 : 0, dLine: +dLine.toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1) };
  });
});
console.table ? console.log(JSON.stringify(res)) : null;
const bad = res.filter(r => r.dLine > 5);
console.log('off-lane cars:', bad.length, JSON.stringify(bad));
await browser.close();
