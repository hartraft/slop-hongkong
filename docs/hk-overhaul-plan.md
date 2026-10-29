# Slop Hong Kong — full overhaul plan (v2)

Live Page: https://cursor.com/canvas/store-be0a2fdc-9102-4ba9-aef7-552f0c88538f/4542a93b-b440-4fc7-b81f-33bbd6f1421a

Amended after Reviewer FAIL. Keep the fork’s engine. Throw out New York. Every step must look right on GPU — not only pass tests.

## Keep
- three.js WebGPU / TSL engine, camera, driving, audio
- LandsD + OSM geo pipeline and js/hk-geodata.js
- Reuse roadGraph, extrusion helpers, controls — rewrite content adapters only
- 繁體 UI chrome and Hong Kong–only boot
- Central origin and Island + Kowloon + harbour scope
- Density guard so sample geo cannot fake a full city

## Throw away
- Manhattan boroughs, bridges, Statue of Liberty, Palisades
- Brownstone / cedar water-tower / fire-escape building kits
- Midtown street-number districts and Times Square hardcodes
- GEO.manhattan / boroughs.newJersey aliases and island-only water boxes
- nyc-geodata.js, NYCMapSystem, any mesh or label that still says New York

## Done looks like
On MSI (real GPU), standing in Central: roads match Des Voeux / Connaught; buildings on real LandsD footprints with real heights; harbour and Kowloon where the map says; nothing NYC remains. 繁體 UI.
- Origin: Central 22.28088, 114.15979 true north
- Area: Hong Kong Island + Kowloon + Victoria Harbour
- Rule: Zero NYC in the 3D world
- Branch: main only — no PR gate

## Gate every step
Steps 1–6 each need: (1) code on main, (2) MSI / WebGPU screenshot Central + harbour checked against a real map, (3) Reviewer. Node tests alone are not enough. Step 7 is final proof, not the first look.

Emergency commits tip 551f044 / c86d72b / 682368a only skip NYC boroughs, draw footprint boxes, and spawn Central. Steps 1–3 must re-verify and replace that work — do not rubber-stamp it as done.

## Steps
1. **Kill New York + fix aliases / shore** — Delete or hard-off NYC boroughs, bridges, landmarks, Midtown districts. Rename GEO.manhattan / boroughs.newJersey and fix island-only water / ISLAND_BOUNDS before any new ground. Fold emergency scraps; prove with MSI screenshot that Liberty / Brooklyn Bridge / Midtown are gone and coast is HK-shaped.
2. **Ground and roads from HK data only** — Asphalt, sidewalks, and road ribbons from Hong Kong coast + GEO.roads / roadGraph only. No Manhattan road deck. Assign water/fog bounds here. MSI shot: Des Voeux / Connaught align with the map.
3. **Every building from LandsD footprints** — Extrude footprints with real heights. Blocks with null height (~4k): low slab or skip — never invent storeys. Re-verify emergency footprint boxes; replace if wrong. MSI shot: massing follows Central footprints.
4. **Hong Kong look** — Reviewable bar: podium + tower massing, curtain-wall glass, dense signage; drop cedar water towers, brownstone, fire-escape kits. Clear street-details Times Square hardcodes. MSI shot must read HK, not brick Manhattan.
5. **Named Hong Kong places** — IFC, Bank of China, TST clock, Peak, Star Ferry at real LandsD/OSM positions only. Keep landmark slots empty until placed — no NYC mesh fallback at origin.
6. **Leftover purge** — Remove dead files (nyc-geodata.js), NYCMapSystem / nyc-map leftovers, camera id nits, traffic/ped routes still on Manhattan assumptions. MSI smoke still clean.
7. **Final proof on MSI** — Full pull, RTX 4070 run, Central + harbour + Kowloon screenshots vs real map. Density tests green. Reviewer final PASS.

## Policies
- Null height → low slab or skip; never invent Midtown storeys
- Landmarks empty until real HK positions — no NYC fallback at origin
- Every step: main push + MSI/WebGPU visual check + Reviewer
- Plan saved here after Keith OK’d amended v2
