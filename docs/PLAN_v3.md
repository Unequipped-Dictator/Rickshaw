# RICKSHAW MAMA: GORIB CARD — Full Game Plan (v3 · 3D Open World)

> **This is the master plan for the 3D city rickshaw game. Not the runner.**
> Engine: Three.js + Vite. Target: Android (PWA → Capacitor APK). Offline, single-player.

---

## 1. GAME IDEA

**Rickshaw Mama: Gorib Card** — a satirical Dhaka rickshaw driver game.

You drive a pedal/battery rickshaw through a real Dhaka-style 3D city. Pick up passengers, deliver them, earn BDT. When you crash into people, vehicles, or buildings — the crowd corners you — and you play the **"Gorib Manush" (poor man) card** to escape consequences.

**Core joke:** Every rickshaw driver in Dhaka has an excuse. The Gorib Card is yours.

**What makes it funny:**
- Crashing into a bus and immediately playing the poor card
- Tribunal screen: "You hit a school kid. Play Gorib Card? Pay Fine? Say Sorry?"
- Card succeeds → "MAAF HOYE GELO" (sorry accepted), crowd forgives
- Card fails → "CARD DECLINED", anger maxes, police heat rises
- Honking at pedestrians makes them jump out of the way
- "MANUAL MODE" game over when battery dies — you have to pedal, but there's no pedal animation

**Satirical targets:** reckless driving, excuse culture, infrastructure chaos, bureaucracy. NOT poverty, NOT people.

---

## 2. TARGET PLATFORM & DELIVERY

| Stage | Deliverable | Notes |
|-------|-------------|-------|
| 1 | **Standalone HTML** (`rickshaw-mama.html`) | Everything inlined (JS, CSS, GLBs as base64, textures). Open directly in Android Chrome. ~15-25 MB |
| 2 | **PWA** (Vite + manifest + service worker) | Installable on Android home screen, offline, full-screen game mode |
| 3 | **Capacitor APK** | Real Android app package. User builds locally (needs Java 17+ & Android SDK) |

**Constraints:**
- Landscape orientation (landscape-first UI, rotate overlay for portrait)
- No external network at runtime (all assets local)
- 60 fps target on mid-range Android (2018+)
- Touch controls + keyboard support
- No emojis in UI
- No subtitles on voice lines (only short gameplay prompts)
- Bangla signage and flavor text throughout

---

## 3. TECHNICAL ARCHITECTURE

### Stack
- **Three.js r160** — WebGL 3D rendering, no engine framework
- **Vite 5** — dev server + build bundler
- **GLTFLoader** — import downloaded GLB assets
- **Meshopt + gltf-transform** — asset optimization pipeline (simplify, strip Draco, compress textures)
- **localStorage** — save system
- **Web Audio API** — SFX + voice playback
- **Capacitor 7** — APK packaging (stage 3)

### Module Structure
```
src/
  main.js        — boot, renderer, lighting, camera, state machine, game loop
  assets.js      — GLTFLoader cache, texture preloading, model clone/fit helpers
  world.js       — city grid, roads, buildings, districts, colliders, landmarks
  player.js      — rickshaw model, physics (bicycle model), collision, battery
  traffic.js     — AI cars, pedestrians, honk reaction
  game.js        — job system, fares, tribunal, Gorib Card, anger/heat, game over
  ui.js          — HUD, minimap, garage, tribunal card, menu screens
  input.js       — keyboard + touch controls
  audio.js       — SFX + voice playback (bleep fallback, no subtitles)
  save.js        — localStorage progress
  style.css      — full-bleed game HUD, no-emoji, landscape-first
```

### State Machine
```
loading → menu ⇄ howto
              ⇅
            garage
              ↓
            playing ⇄ paused
              ↓
            tribunal → playing
              ↓
            gameover → menu | playing
```

### Rendering Budget (mid-range Android)
- **~120 buildings** (Kenney low-poly GLBs, ≤ 100 tris each)
- **~80 trees** (Kenney nature kit)
- **~14 vehicles** (Kenney car kit, ≤ 100 tris each)
- **~16 pedestrians** (Kenney mini-characters)
- **1 player rickshaw** (80k tris — the only heavy model, justified)
- **1024 shadow map**, PCF soft shadows
- **Fog** at 90-260m to hide draw distance
- **PMREM** environment lighting from HDRI
- Pixel ratio capped at 2

---

## 4. GAME WORLD — DAKKAR MAP

### Grid
- **7×7 intersections**, spacing 64 units
- **Road width:** 14 units (two lanes + shoulders)
- **Block size:** 50×50 units
- **Total play area:** ~400×400 units
- **Ground plane:** 520×520

### Districts (SW → NE)
| District | Position | Style |
|----------|----------|-------|
| **Old Dhaka** | SW | Dense low-rise, market stalls, alleys, narrow buildings |
| **Farmgate** | NW | Commercial mid-rises, offices |
| **Dhanmondi** | SE | Suburban houses, trees, parks |
| **Motijheel** | NE | Skyscrapers, bank towers, glass |
| **Gabtoli** | W | Industrial, warehouses, shipping containers |
| **Hatirjheel** | Center | Lake + bridge, water blocks, park |
| **Karwan Bazar** | S | Market, awnings, parasols |

### Road Network
- Asphalt planes with Poly Haven texture, repeated tiling
- Dashed center lines on all roads
- Kenney crossroad tiles at every intersection
- Traffic lights at 2/3 of intersections
- Electricity poles, street signs, barriers
- Sidewalks along all blocks
- Water blocks in Hatirjheel center (3 blocks) — driving through slows you 5×

### Landmarks / Job Points (16)
New Market, Lalbagh Gate, Farmgate Office, Karwan Bazar, Dhanmondi School, Dhanmondi Lake, Motijheel Bank, Motijheel Shapla, Gabtoli Bus Stand, Hatirjheel Park, Bangla Motor, Shahbagh, Kamalapur Rail, Gulistan, Mirpur Road, Tejgaon

### Depot
**Mama Garage** at SW corner — stop here to recharge battery + repair rickshaw

### Collision
- AABB colliders on all buildings, stalls, containers, traffic poles
- Player radius 1.2m, car radius 1.5m, ped radius 0.5m
- Simple push-out collision resolution
- No physics engine (too heavy for mobile); simple circle-AABB + circle-circle

---

## 5. GAMEPLAY SYSTEMS

### 5.1 Driving (Bicycle Model)
| Parameter | Value |
|-----------|-------|
| Acceleration | 7.5 m/s² (upgradeable) |
| Max speed | 12-18 m/s (upgradeable) |
| Reverse max | 4 m/s |
| Steer rate | 1.9 rad/s at speed |
| Battery drain | ~0.12%/s throttle + speed factor |
| Battery range | ~80-120m depending on speed |
| Brake | 16 m/s² decel |

### 5.2 Controls
| Action | Keyboard | Touch |
|--------|----------|-------|
| Gas | W / ↑ | GAS button (bottom right) |
| Brake/Reverse | S / ↓ | BRAKE button |
| Steer Left | A / ← | LEFT arrow |
| Steer Right | D / → | RIGHT arrow |
| Horn | Space | HORN button |
| Interact | E / Enter | PICK UP / DROP OFF button |
| Pause | P / Esc | PAUSE button |

### 5.3 Job System
- **Passenger types:** Office Uncle (৳70-120), Aunty (৳50-90), School Kid (৳20-40), Old Man (৳30-50), Tourist (৳90-150)
- **Job flow:** Beacon appears at pickup point → drive there → stop within 5m at <1.5 m/s → interact → passenger hops on → green beacon at dropoff → drive there → stop → interact → fare paid
- **Fare calculation:** base rate + distance bonus
- **Card earning:** +1 Gorib Card every 3 completed fares (max 3 cards)

### 5.4 Tribunal System (Core Humor)
When you crash hard (>7 damage), you're taken to a tribunal screen:
- **Charge:** random from (scratched a taxi, clipped a CNG, hit a market stall, bumped a pedestrian, dented a bus, knocked a signboard)
- **Fine:** 40 + damage × 6 BDT
- **Three choices:**

| Choice | Outcome |
|--------|---------|
| **Play Gorib Card** | 85% success (minus card luck, anger) → 20% fine, anger -10, "MAAF HOYE GELO" |
| | Fail → 120% fine, anger +15, heat +8, "CARD DECLINED" |
| **Pay Fine** | Full fine, anger -18, heat -6, "FINE PAID" |
| **Say Sorry** | No fine, anger -8, heat +2, "SORRY ACCEPTED" |

- **Gorib Card chance:** `clamp(0.85 − 0.12×cardUses − 0.004×anger + luckUpgrade, 0.05, 0.95)`

### 5.5 Stats & Game Over
| Stat | Max | Drain |
|------|-----|-------|
| Battery | 100-175 | Throttle + speed |
| Condition | 100 | Crashes (reduced by body upgrade) |
| Anger | 100 | Crashes +15-25, ped hits +6 |
| Heat (police) | 100 | Tribunal fails +8, horn +0.5 |

**Game over conditions:**
- Battery 0 → "MANUAL MODE" (you must pedal, but no pedal exists)
- Anger 100 → "CARD DECLINED" (crowd stops believing you)
- Heat 100 → "THANA MODE" (police pick you up)
- Condition 0 → "TOWED" (rickshaw destroyed)

### 5.6 Garage / Progression
| Upgrade | Cost | Effect |
|---------|------|--------|
| Motor | ৳150×level | +2.2 m/s top speed |
| Battery | ৳180×level | +25 battery capacity |
| Card Luck | ৳220×level | +3% Gorib Card success |
| Body Kit | ৳160×level | -18% crash damage |

Max level: 5. Earn BDT from fares. Save best BDT, total fares, cards used.

### 5.7 Save System
- localStorage key: `rickshaw-mama-v3`
- Saves: best BDT, total fares, cards used, BDT balance, upgrade levels
- Auto-saved on game over and garage purchase

---

## 6. ASSET PLAN

### 6.1 Already Downloaded & Processed
All GLBs live in `public/assets/models/`

**Kenney CC0 packs** (free, no attribution required but credited anyway):
- City Kit Roads 2.2 — road segments, intersections, traffic lights, signs, poles
- City Kit Commercial — buildings, skyscrapers, awnings, parasols
- City Kit Suburban — houses, fences, planters, trees
- City Kit Industrial — warehouses, containers, water towers, chimneys
- Nature Kit — trees (oak, palm, fat, blocks)
- Car Kit — sedan, taxi, SUV, police, truck, van, ambulance, garbage truck, delivery
- Mini Characters — male/female in 4 variants each

**Real rickshaw model** (Sketchfab, CC-BY):
- `vehicles/rickshaw.glb` — 4.8 MB, 80,270 tris, 9 textures
- Source: AryPadli "Cycle rickshaw", Sketchfab uid `704a942b531846bfbbfa067c24d501a5`
- Draco compression stripped, PBR textures partially removed, textures compressed to 128px

**Textures** (Poly Haven, CC-CC0):
- Asphalt, brick wall, concrete floor, plastered wall (diffuse + normal maps)
- Sky HDRI (1k equirect)

### 6.2 Asset Pipeline (Already Working)
`scripts/build-assets.mjs`:
1. Download raw GLBs from Kenney/Sketchfab
2. Load with gltf-transform
3. Convert primitives to triangles
4. Optional mesh simplification (meshoptimizer)
5. Strip PBR textures (normal, metallicRoughness, occlusion) — keep base color only
6. Compress textures via sharp (mozjpeg) to target size
7. Dispose Draco extension (so no runtime decoder needed)
8. Write final GLB

**Parameters for rickshaw:** `{maxTex:128, simplifyRatio:0, quality:78, stripPBR:true}`

### 6.3 Asset Credits (Required)
- **Kenney** (CC0) — 7 packs
- **AryPadli** (CC-BY) — rickshaw model
- **Poly Haven** (CC0) — textures
- Full credits in `docs/ASSET_CREDITS.md`

---

## 7. VOICE-OVER PIPELINE

User records all voice lines themselves. Pipeline:
- 12 line IDs defined in `public/voice/README.md`
- Audio files: `public/voice/<ID>.{mp3,ogg,m4a,wav}`
- `audio.js` tries each format, falls back to bleep if missing
- **No auto-subtitles** — only short gameplay prompts
- Voice line IDs:

| ID | Content |
|----|---------|
| MAMA_IDLE_01 | Humming while driving |
| MAMA_HORN_01 | Horn honk + yell |
| MAMA_CRASH_01 | Oof after crash |
| MAMA_GORIB_01 | Playing the card |
| MAMA_PAY | Paying fine |
| MAMA_APOLOGY | Saying sorry |
| CROWD_CARD_DECLINED_01 | Crowd rejecting |
| OFFICE_UNCLE_PICKUP | Office uncle passenger |
| AUNTY_PICKUP | Aunty passenger |
| SCHOOL_KID_PICKUP | School kid passenger |
| OLD_MAN_PICKUP | Old man passenger |
| TOURIST_PICKUP | Tourist passenger |

Recording guide: `docs/RECORDING_GUIDE.md`

---

## 8. BANGLA SIGNAGE & FLAVOR

- Building/shop signs: চা ও সিঙ্গারা, বিসমিল্লাহ স্টোর, মা টেলিকম, ভাই ভাই হোটেল, নিউ মার্কেট, ফার্মেসি, সেলুন, মিষ্টি মুখ
- Bus names: ঢাকা পরিবহন, মধুমতি, হানিফ, গুলশান চাকা, মতিঝিল এক্সপ্রেস
- Traffic signs: ধীরে চালান, সাবধান, বাস স্টপ, হর্ন নিষেধ, স্কুল আছে
- Rickshaw rear art: "মা / HORN PLEASE / ঢাকা"
- System font: Noto Sans Bengali (no external fonts, offline)

---

## 9. MILESTONES

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **M1: Asset Pipeline** | ✅ Done | All GLBs downloaded, processed, optimized, in `public/assets/models/` |
| **M2: World Build** | ✅ Done | 7×7 grid, districts, roads, buildings, trees, water, landmarks, depot, colliders |
| **M3: Player + Driving** | ✅ Done | Real rickshaw model, bicycle physics, collision, battery, steering |
| **M4: Traffic AI** | ✅ Done | 14 cars, 16 peds, honk reaction, simple collision |
| **M5: Job System** | ✅ Done | Pickup beacon, passenger model, dropoff, fare calculation, card earning |
| **M6: Tribunal** | ✅ Done | Crash → tribunal screen, 3 choices, Gorib Card luck, anger/heat |
| **M7: Garage + Save** | ✅ Done | Upgrade purchase, localStorage, best score |
| **M8: UI + HUD** | ✅ Done | Menu, HUD, minimap, garage, tribunal card, game over, pause |
| **M9: Build + QA** | ✅ Done | `vite build` passes, Playwright smoke test passes (0 errors) |
| **M10: Rickshaw Fix** | ⏳ Next | Verify/fix model orientation & scale (bounds came out ~5m) |
| **M11: Visual QA** | ⏳ Next | Screenshots: menu, driving, intersection, pickup, tribunal, garage |
| **M12: Standalone HTML** | ⏳ Pending | Inline all assets as base64 → `rickshaw-mama.html` for Android |
| **M13: PWA** | ⏳ Pending | Manifest + service worker, installable |
| **M14: APK (Capacitor)** | ⏳ Pending | Real Android package |
| **M15: Voice-overs** | ⏳ User action | User records 12 line IDs, drops into `public/voice/` |
| **M16: Polish** | ⏳ Pending | Performance tuning, density tuning, minimap refinement |

---

## 10. OPEN ISSUES / NEXT ACTIONS

1. **Rickshaw model orientation** — bounding box showed ~5m span (x: -177.5 to -172.5). The source model is likely a wide/side-view becak. Need to verify axis and normalize to ~3.4m length, wheels on ground (y=0), forward along Z. The `fitModel` in `assets.js` and the scale logic in `player.js` handle this, but may need a tweak for this specific model's axis layout.

2. **Visual verification** — Playwright screenshots were taken but couldn't be visually inspected. Need to verify: rickshaw looks like a rickshaw, buildings aren't floating, roads connect properly, HUD is readable, minimap works.

3. **Build standalone HTML** — the old standalone is the rejected runner. New one needs all v3 code + GLBs as base64 data URIs (~15-25 MB total).

4. **Update docs** — GDD.md (runner-era, needs v3 update), ASSET_CREDITS.md (needs rickshaw credit).

---

## 11. WHAT'S NOT IN THIS GAME (Deliberately)

- No multiplayer
- No online leaderboards (offline)
- No ads
- No in-app purchases
- No emojis
- No subtitles on voice lines
- No real politicians or celebrities
- No gore or injury detail
- No rewards for hitting pedestrians

---

## 12. REJECTED APPROACHES (Do Not Revisit)

- Endless runner with recycled road segments (v1/v2) — rejected by user
- Coin-collector loop — rejected
- Pure primitive/box-built models — rejected ("It's just blocks")
- Portrait orientation — reversed to landscape
- Webpage-style UI — must look like a game
- Large text boxes — one-line prompts only
- Emojis in UI — removed
- Auto-subtitles on voice lines — removed
