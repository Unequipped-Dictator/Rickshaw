#!/usr/bin/env node
/**
 * build-assets.mjs — 128MB-proof asset pipeline for Rickshaw Mama
 *
 * Downloads Kenney CC0 packs (signed-URL chain, no login), extracts to /tmp
 * (never snapshotted), converts a CURATED subset of models to optimized .glb
 * (joined meshes, WebP textures, base-color only) and writes ONLY the final
 * GLBs into public/assets/models/.
 *
 * Re-runnable at any time: `npm run assets [-- --force]`
 */
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit, KHRTextureTransform } from '@gltf-transform/extensions';
import { prune, dedup, weld, flatten, join, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'rickshaw-assets-'));
const OUT = path.resolve(process.argv[2] || 'public/assets/models');
const FORCE = process.argv.includes('--force');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Curated keep-lists (regex on lowercase model name).
 * Sized to the PLAN_v3 rendering budget: ~120 buildings, ~80 trees,
 * 14 vehicles, 16 pedestrians — road SURFACES are procedural (asphalt
 * texture + painted lines), so we only keep street PROPS from the roads kit.
 */
const PACKS = [
  {
    slug: 'city-kit-commercial', out: 'buildings', prefix: 'com_',
    keep: /^(building-[a-n]|building-skyscraper-[a-e]|detail-(awning|awning-wide|overhang|overhang-wide|parasol-a|parasol-b))$/,
  },
  {
    slug: 'city-kit-suburban', out: 'buildings', prefix: 'sub_',
    keep: /^(building-type-[a-u]|tree-large|tree-small|planter|fence|fence-2x2|fence-3x2)$/,
  },
  {
    slug: 'city-kit-industrial', out: 'buildings', prefix: 'ind_',
    keep: /^(building-[a-t]|chimney-(basic|large)|detail-tank|detail-tank-large|shipping-container-[abc]|water-tower|windmill|solar-panel-flat)$/,
  },
  {
    slug: 'city-kit-roads', out: 'props', prefix: 'road_',
    keep: /^(traffic-light|traffic-light-hanging|light-curved|light-square|electricity-pole|electricity-pole-single|electricity-pole-wide|electricity-wires|sign-highway|sign-highway-wide|road-sign-(empty|stop|street|warning)|dumpster|construction-(barrier|cone|fence)|bridge-pillar|bridge-pillar-wide|road-crossing)$/,
  },
  {
    slug: 'nature-kit', out: 'nature', prefix: 'nat_',
    keep: /^(tree_(default|oak|palm|palmTall|fat|simple|small|tall|cone)|plant_bush(Large|Small))$/,
  },
  {
    slug: 'car-kit', out: 'vehicles', prefix: 'car_',
    keep: /^(sedan|taxi|suv|police|truck|van|ambulance|garbage-truck|delivery)$/,
  },
  {
    slug: 'mini-characters', out: 'characters', prefix: 'char_',
    keep: /^(character-(male|female)-[a-f]|wheelchair)$/,
  },
];

const hex = (s) => Buffer.from(s, 'utf8').toString('hex');
const cookieJar = path.join(WORK, 'cookies.txt');

async function fetchWithCookies(url, opts = {}) {
  const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
  const jar = fs.existsSync(cookieJar) ? fs.readFileSync(cookieJar, 'utf8') : '';
  if (jar) headers['Cookie'] = jar.trim();
  const res = await fetch(url, { ...opts, headers });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookies.length) {
    const jarLines = setCookies.map((c) => c.split(';')[0]).join('; ');
    fs.writeFileSync(cookieJar, jar ? jar + '; ' + jarLines : jarLines);
  }
  return res;
}

/** Kenney download chain: page -> hex id -> signed link -> zip */
async function downloadKenneyPack(slug) {
  const pageUrl = `https://kenney.nl/assets/${slug}`;
  const page = await fetchWithCookies(pageUrl, { headers: { Accept: 'text/html' } });
  const html = await page.text();
  if (!page.ok) throw new Error(`page ${page.status} for ${slug}`);

  const idMatch = html.match(/data-download-id='([0-9a-f]+)'/);
  if (!idMatch) throw new Error(`no download id found for ${slug}`);

  const linkRes = await fetchWithCookies(`https://kenney.nl/download-link/${idMatch[1]}`, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: pageUrl,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const { url } = await linkRes.json();
  if (!url) throw new Error(`no signed url for ${slug}`);

  const zipRes = await fetchWithCookies(url);
  if (!zipRes.ok) throw new Error(`zip ${zipRes.status} for ${slug}`);
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const zipPath = path.join(WORK, `${slug}.zip`);
  fs.writeFileSync(zipPath, buf);
  return zipPath;
}

// ---------- glTF processing ----------

const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRTextureTransform]);

async function processModel(srcFile, destGlb, label) {
  const doc = await io.read(srcFile);

  // keep base color only: drop normal / metalRough / occlusion / emissive maps
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getNormalTexture()) mat.setNormalTexture(null);
    if (mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(null);
    if (mat.getOcclusionTexture()) mat.setOcclusionTexture(null);
    if (mat.getEmissiveTexture()) mat.setEmissiveTexture(null);
    mat.setEmissiveFactor([0, 0, 0]);
  }

  await doc.transform(
    flatten(),        // bake node transforms
    join(),           // merge nodes per material -> 1-2 draw calls per model (mobile!)
    dedup(),
    weld(),
    prune({ keepAttributes: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [128, 128] }) // palettes only; never upscales
  );

  await io.write(destGlb, doc);
  const kb = (fs.statSync(destGlb).size / 1024).toFixed(1);
  console.log(`  ok ${label.padEnd(40)} ${kb.padStart(7)} KB`);
  return fs.statSync(destGlb).size;
}

async function processPack(pack) {
  const { slug, out, prefix, keep } = pack;
  console.log(`\n> ${slug}`);
  const packDir = path.join(WORK, slug);
  const zipPath = path.join(WORK, `${slug}.zip`);

  if (!fs.existsSync(zipPath)) {
    console.log('  downloading…');
    await downloadKenneyPack(slug);
  } else {
    console.log('  zip cached in /tmp');
  }
  execSync(`unzip -oq "${zipPath}" -d "${packDir}"`);

  // only the canonical "Models" tree (packs also contain Isometric/ Side/ sets)
  const all = execSync(`find "${packDir}/Models" \\( -name '*.glb' -o -name '*.gltf' \\)`)
    .toString().trim().split('\n').filter(Boolean);
  const files = all.filter((f) => keep.test(path.basename(f).replace(/\.(glb|gltf)$/i, '').toLowerCase()));
  console.log(`  ${files.length}/${all.length} models match keep-list`);
  if (!files.length) throw new Error(`keep-list matched nothing in ${slug}`);

  const outDir = path.join(OUT, out);
  fs.mkdirSync(outDir, { recursive: true });

  let bytes = 0, count = 0;
  for (const file of files) {
    const name = path.basename(file).replace(/\.(glb|gltf)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const dest = path.join(outDir, `${prefix}${name}.glb`);
    if (!FORCE && fs.existsSync(dest)) { bytes += fs.statSync(dest).size; count++; continue; }
    try { bytes += await processModel(file, dest, `${prefix}${name}`); count++; }
    catch (e) { console.log(`  FAIL ${prefix}${name}: ${e.message}`); }
  }
  return { bytes, count };
}

// ---------- main ----------

console.log(`workspace output: ${OUT}`);
fs.mkdirSync(OUT, { recursive: true });

let total = 0, files = 0;
for (const pack of PACKS) {
  try { const r = await processPack(pack); total += r.bytes; files += r.count; }
  catch (e) { console.log(`!! pack ${pack.slug} failed: ${e.message}`); }
}

console.log(`\n==========================================`);
console.log(`final GLBs: ${files} files, ${(total / 1024 / 1024).toFixed(2)} MB total`);
console.log(`(raw zips + extraction stayed in ${WORK} — never persisted)`);
