# Central city floor

The asphalt deck stops at the curb and a 3.15 m sidewalk. Everything past that was the island coast plate (`hkCoastLand`, olive `0x6a7264`). Under the sky that plate reads as a flat teal sheet, so a taxi that leaves Des Voeux is driving on GIS fill. Victoria Harbour is a separate water mesh and was never that sheet. This cut covers the Central part of the same coast ring with paved ground. There is no flag. Boot does not need a fetch.

## What changed

`js/hk-ground-fill.js` clips the OSM Hong Kong Island ring to the Central box (`22.276–22.288 × 114.150–114.170`, `HK_CORE_WORLD`). `js/city-grid.js` meshes that clip. The ring is the land already drawn as `HongKongCoastGround`. The north edge of the box crosses the harbour, and those cells are outside the ring, so they stay water.

- **City floor** uses the existing sidewalk shader (`createSidewalkMaterial`): concrete flags, joints, and the same rain wetness as the walks. It sits at y = 0.012, a centimetre above the coast plate and below the asphalt ribbon (the ribbon starts at y = 0.02 and tops out at 0.075). A depth bias of factor −0.35 pulls it in front of the coast. The asphalt bias stays −1, so the deck, curb, and lane paint stay on top. No second centreline and no change to `planHkRoadDeck`.
- **Lawns** are OSM `leisure=garden`, plus `leisure=park` of at least 3 acres, clipped to the same box and drawn with `createParkLawnMaterial` at y = 0.04. Hong Kong Park, the Zoological and Botanical Gardens, Chater Garden, Tamar Park, and the smaller named gardens are in that set.
- **Left paved** on purpose: Statue Square (the spawn), the Central promenade, the Central Pier waterfront, and the observation wheel. Those OSM polygons are tagged park, and they are stone and deck, not turf. A name match on 海濱, promenade, waterfront, 廣場, or the wheel keeps them on the concrete floor.

Outside Central the coast plate is unchanged. Kowloon is unchanged. The 2D atlas is unchanged.

## How to verify

`node --test tests/*.mjs tests/*.cjs`

On MSI, open the page (no query flag). The taxi still starts on Statue Square, about 18 m from Des Voeux. That ground is concrete flags, not the olive plate.

From the chase camera:

- On the Des Voeux centreline, about **x = −1.4, z = 29.3**, the lane is still dark asphalt with the white edge and the dashed lane line. The raised sidewalk and curb are still outside it.
- A few metres off that carriageway, about **x = −1.4, z = 10**, the ground is the same concrete as the sidewalk, not teal.
- Chater Garden, about **x = 152, z = 39**, is lawn. Hong Kong Park, about **x = 172, z = 405**, is lawn.
- The harbour north of the island shore, about **x = 0, z = −860**, is still water. The northeast corner of the Central box (about **x = 1050, z = −788**) is inside the box and outside the island ring, and it stays water.

## Residual gaps

- No 5 m DTM. The floor is flat. Hills, the seawall grade, and street camber are later.
- No neon shopfront pack.
- Not a parcel cadastre. The floor is the coast ring clipped to Central, not a lot-by-lot setback. Building footprints still sit on it; they are not subtracted.
- Small sitting-out areas under 3 acres stay concrete. A garden tagged promenade stays concrete.
- The sidewalk slab is still the raised 0.22 m walk from the road cut. The block interior is the lower concrete plate, so there is a step at the outer edge of that slab until the deck and the floor share one cross-section.
