# RICKSHAW MAMA — Rebuild Execution Plan (Arena workspace)

> Companion to `docs/PLAN_v3.md` (the game design). This file is the **build roadmap**
> for rebuilding the game in this workspace after the old one was lost, plus the
> rules that keep us under Arena's 128 MB / 10,000-file snapshot cap.

---

## 0. WHY THE OLD WORKSPACE DIED — AND THE NEW RULES

Arena saves a snapshot at the **end of every turn**: max ~128 MB and ~10,000 files.
These directories are **excluded** (never counted): `node_modules/`, `dist/`, `build/`,
`out/`, `.cache/`, `.npm/`, etc. — so heavy tooling is free. What killed the old
workspace was **raw assets** (Kenney packs ~300 MB extracted, thousands of files)
plus **duplicate copies** (base64-inlined HTML adds +33% per copy).

### Operating rules (non-negotiable from now on)

| # | Rule |
|---|------|
| R1 | Raw asset zips are **downloaded to `/tmp`** (never snapshotted), processed, and only final optimized GLBs (~5 MB) are copied into `public/assets/models/`. |
| R2 | `scripts/build-assets.mjs` must always be able to **rebuild every asset from scratch** (CC0 sources are stable). Any turn can re-run it. |
| R3 | Only ONE copy of each deliverable lives in the workspace. The standalone HTML is built into `release/` **on demand**, not hoarded. |
| R4 | Before ending any turn that touched big files: `git status` + delete strays. Files deleted before turn end never count. |
| R5 | `vite build` output lands in `dist/` (excluded). Final deliverables are **copied** to `release/` only when the user asks for them. |

### GitHub = our permanent hard drive (removes the cap almost entirely)

The Arena GitHub *connector* is unsupported, but the sandbox has git + network, so:

1. You create a free account → new **private** repo `rickshaw-mama`.
2. GitHub → Settings → Developer settings → **Fine-grained personal access token**
   (scope: this repo, permission: Contents read/write). Copy the token.
3. Paste the token in chat when you want a sync. I run:
   `git push https://<TOKEN>@github.com/<you>/rickshaw-mama.git main`
   The token is used in-memory / in `.git-credentials` (excluded from snapshots —
   it will NOT persist, and never appears in saved files).
4. Any future session (even a brand-new Arena conversation) starts with one
   `git clone` → nothing is ever lost again.

Optional later: deploy the PWA to **Cloudflare Pages** (free: unlimited bandwidth,
500 builds/mo) → your phone installs the game from a URL; no 25 MB file ever
travels through chat.

---

## 1. ASSET DECISIONS (after live testing, 2026-11-06)

| Asset | Decision | Why |
|-------|----------|-----|
| Kenney kits (roads, commercial, suburban, industrial, nature, cars, mini-people) | ✅ Download from kenney.nl — **verified working** (signed-URL chain cracked: `download-link/{hex}` + cookies) | CC0, no login, ~4 MB per pack |
| Poly Haven textures (asphalt, brick, plaster, sky HDRI) | ✅ Use public API `api.polyhaven.com` / `dl.polyhaven.org` | CC0, no login |
| **Player rickshaw** | 🔧 **Built procedurally in Three.js code** + drop-in GLB slot | Sketchfab/poly.pizza need logins; procedural = 0 MB, no license risk, perfect for the 128 MB cap. Swap in a GLB later via `public/assets/models/vehicles/rickshaw.glb` (drop the file in `public/` yourself or give me a poly.pizza API key — free) |
| Traffic vehicles, pedestrians | ✅ Kenney Car Kit + Mini Characters GLBs | CC0 |

License note: procedural rickshaw + Kenney (CC0) + Poly Haven (CC0) = **no attribution
required**. If a CC-BY GLB is swapped in later, credit goes in `docs/ASSET_CREDITS.md`.

---

## 2. REBUILD ROADMAP (mapped to PLAN_v3 milestones)

Old milestones M1–M9 are gone; we rebuild them as R-numbers. Each R is roughly
one session, verified before moving on:

| Rebuild | Contents | Deliverable / proof | Status |
|---------|----------|---------------------|--------|
| **R0** | Project scaffold, asset pipeline script, Kenney download verified, GLBs produced | `public/assets/models/` populated (~5 MB), sizes logged | ✅ **done — 133 GLBs, 8.4 MB, live preview** |
| **R1** | `world.js` — 7×7 grid, 7 districts, roads, sidewalks, water (Hatirjheel), landmarks ×16, depot, colliders, Bangla signage | Dev server shows the city; collision list exported | ✅ **done — 373 instances / 94 instanced meshes / 351 colliders, screenshot-verified** |
| **R2** | `player.js` — procedural rickshaw (body, canopy, spoked wheels, rear art), bicycle physics, battery, camera; `input.js` keyboard+touch | Drive it in the browser | ✅ **done — 7/7 physics checks pass (accel/steer/brake/water/dead/recharge/collision), chase cam + dash + touch UI, screenshot-verified** |
| **R3** | `traffic.js` — 14 AI cars, 16 peds, honk-jump reaction, circle collision | Traffic moves, reacts to horn | ✅ **done — left-hand traffic, 14/14 on-lane, turns at intersections, brakes for obstacles, honk-jump (2m hop-aside), car↔player crashes emit tribunal events; all sim checks pass** |
| **R3.5** | **Dhaka-ification pass** — irregular road network, adaptive lot fill (no empty lots), footprint-fitted buildings w/ tint variance, Old Dhaka ruins + construction frames, Lalbagh Fort build, Shapla roundabout, Kamalapur coaches, Gabtoli named buses, Hatirjheel bridge deck+railings+pillars, tea stalls + hawkers + rickshaw stands everywhere, parking chaos | City reads as Dhaka, not a grid | ✅ **done — 919 instances / ~100 draw calls, screenshot-verified (Old Dhaka, Shapla, bridge, Kamalapur, Gabtoli)** |
| **R3.5.2** | **Alley pass** — roads 14→12m, buildings stretch 1.3–3.6× taller (loom), tighter cells (~1,531 instances), compound walls w/ Dhaka color washes + tin variants + gate gaps, alley chase-cam (low/close/FOV 60), ped-hit comedy lines | Street-level Dhaka canyon feel | ✅ **done — screenshot-verified (NO HORN sign over a walled lane!)** |
| **R4** | `game.js` — job beacons, passenger types/fares, tribunal + Gorib Card odds, anger/heat/battery/condition, game-over modes | One full fare loop playable | ⬜ |
| **R5** | `ui.js` + `style.css` — menu, HUD, minimap, garage upgrades, tribunal screen, game over, landscape overlay; `save.js` localStorage | Full game loop menu→play→gameover | ⬜ |
| **R6** | `audio.js` — SFX (Web Audio, synthesized bleeps now), voice-line loader with bleep fallback (your recordings drop into `public/voice/` later) | Sounds on events | ⬜ |
| **R7** | QA — Playwright smoke test, screenshots, perf pass (draw calls, pixel ratio), then `release/` PWA build + optional standalone HTML | Playable game you can install | ⬜ |

Stretch (after R7): PWA hosting, Capacitor APK guide, voice-overs.

---

## 3. PROJECT LAYOUT

```
rickshaw-mama/
  docs/PLAN_v3.md          <- game design (your upload)
  docs/REBUILD_PLAN.md     <- this file
  scripts/build-assets.mjs <- downloads Kenney+PolyHaven -> optimized GLBs
  public/assets/models/    <- final GLBs ONLY (~5 MB)
  public/voice/            <- your future voice recordings
  src/                     <- game modules (per PLAN_v3 section 3)
  release/                 <- built deliverables (on demand, rule R5)
```

## 4. SIZE BUDGET (current, verified)

| Item | Size |
|------|------|
| This workspace total, target | < 30 MB of 128 MB |
| `public/assets/models/` | ~5 MB |
| Source + docs | < 1 MB |
| Everything else (node_modules, dist, raw zips) | 0 MB counted (excluded / /tmp) |
