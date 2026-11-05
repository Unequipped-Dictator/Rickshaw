# Rickshaw Mama: Gorib Card (v3 — 3D open world)

A satirical Dhaka rickshaw driver game. Three.js + Vite, offline, single-player,
landscape, touch + keyboard. Design doc: `docs/PLAN_v3.md` · Build roadmap:
`docs/REBUILD_PLAN.md`.

## Quick start

```bash
npm install          # node_modules is never snapshotted — reinstall freely
npm run dev          # dev server on :5173
npm run assets       # rebuild ALL 3D assets from CC0 sources (~30 s, needs network)
npm run build        # production build -> dist/ (excluded from snapshot)
```

## The 128 MB-proof workflow

Raw asset zips are downloaded to `/tmp` (outside the snapshot), processed by
`scripts/build-assets.mjs`, and only the final optimized GLBs (~8.4 MB, 133
files) live in `public/assets/models/`. Any session can rebuild every asset
from scratch — the CC0 sources are stable and login-free.

Keep the workspace thin:

- never commit raw zips / extracted packs into the workspace
- `node_modules/`, `dist/` are excluded from snapshots — don't fight them
- build standalone/PWA deliverables into `release/` on demand, delete after

## Credits

Kenney (CC0) — city kits, car kit, mini characters, nature kit.
Textures for the final game will come from Poly Haven (CC0).
See `docs/ASSET_CREDITS.md`.
