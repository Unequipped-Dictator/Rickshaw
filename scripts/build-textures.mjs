#!/usr/bin/env node
/**
 * build-textures.mjs — fetch CC0 Poly Haven textures into public/assets/textures/
 * Direct downloads, no login. Re-runnable: skips files that already exist.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/assets/textures');
fs.mkdirSync(OUT, { recursive: true });

const WANTED = [
  { url: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg', file: 'asphalt_diff_1k.jpg' },
  { url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/qwantani_afternoon_puresky_1k.hdr', file: 'sky_1k.hdr' },
];

for (const { url, file } of WANTED) {
  const dest = path.join(OUT, file);
  if (fs.existsSync(dest)) { console.log(`skip ${file} (exists)`); continue; }
  const res = await fetch(url);
  if (!res.ok) { console.log(`FAIL ${file}: HTTP ${res.status}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`ok ${file}: ${(buf.length / 1024).toFixed(0)} KB`);
}
