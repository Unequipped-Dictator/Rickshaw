#!/usr/bin/env node
/** inspect-assets.mjs — validate every GLB: loads, has geometry, bounds, mesh count */
import { NodeIO } from '@gltf-transform/core';
import { KHRMaterialsUnlit, KHRTextureTransform } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'public/assets/models';
const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRTextureTransform]);

let bad = 0, ok = 0;
const summary = [];
for (const dir of fs.readdirSync(ROOT)) {
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.glb')).sort();
  const gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
  for (const f of files) {
    try {
      const doc = await io.read(path.join(ROOT, dir, f));
      const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
      if (!prims.length) throw new Error('no primitives');
      const tmp = [0, 0, 0];
      let hasPos = false;
      for (const p of prims) {
        const pos = p.getAttribute('POSITION');
        if (!pos) throw new Error('missing POSITION');
        hasPos = true;
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, tmp);
          for (let a = 0; a < 3; a++) { gmin[a] = Math.min(gmin[a], tmp[a]); gmax[a] = Math.max(gmax[a], tmp[a]); }
        }
      }
      if (!hasPos) throw new Error('no POSITION');
      ok++;
      if (f === files[0]) {
        const size = gmax.map((v, i) => (v - gmin[i]).toFixed(1)).join(' x ');
        console.log(`${dir}/ sample: ${f}  prims=${prims.length}  approx size=${size}`);
      }
    } catch (e) { bad++; console.log(`BAD ${dir}/${f}: ${e.message}`); }
  }
  if (gmax[0] !== -Infinity) {
    summary.push(`${dir}: ${files.length} files, bounds [${gmin.map((v) => v.toFixed(1))}] -> [${gmax.map((v) => v.toFixed(1))}]`);
  }
}
summary.forEach((s) => console.log('  ' + s));
console.log(`\n${ok} OK, ${bad} failed`);
