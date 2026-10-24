# Individualised glTF cut

One LandsD / Open3Dhk individualised sheet can sit in the Central world frame beside the footprint extrudes. The page still extrudes every Central footprint unless the flag is on and `manifest.json` is present. This cut does not stream 11-SW-8D, Cesium tiles, the 2017 Planning Department mesh, the 5 m DTM, or the pedestrian network.

## Sheet

`node tools/fetch-central-gltf-sheet.mjs` downloads [11-SW-9B](https://download.map.gov.hk/api/3d-zip/GLTF/11-SW-9B.zip) first (about 35 MB, HTTP 200 with no key on 2026-10-24).

That zip has no `BUILDING/` glTF. It has one `GENERIC` model, one `TERRAIN(TB)` tile, and one `VEGETATION(TB)` model. The terrain node is the 750 m × 600 m sheet centred near HK1980 easting 835625.6, northing 816500 (WGS84 about 22.2874 N, 114.1706 E). The west edge clips the Central bbox; the building models are not in this sheet.

The script then downloads **11-SW-9A** (about 105 MB) and writes `hk-3d/sheet.json`. Survey of that zip: 15 `BUILDING/*.gltf` files, all inside the Central bbox (22.276–22.288 N, 114.150–114.170 E). Five have a horizontal span of at least 12 m (about 16–130 m). The other ten are 2–7 m specks and are skipped. The runtime loads those five (the cap is 6). They sit on the north edge of the core, around the Central piers: roughly 50–230 m east and 570–720 m north of Statue Square. The largest (`B346721638201063A1`) overlaps the Central Pier footprints. The CBD tower cluster is sheet 11-SW-8D, which this cut refuses.

Files land in gitignored `hk-3d/<sheet>/`. CI does not need the zip.

```bash
node tools/fetch-central-gltf-sheet.mjs
node tools/fetch-central-gltf-sheet.mjs --sheet 11-SW-9A
```

A 401 triggers one read of the public key on `https://3d.map.gov.hk/download-api`. The 2026-10-24 probe did not need a key.

## Flag

`HK_GLTF_SHEET` in `js/city-config.js` is `''`. Extrudes stay up.

After the fetch:

```text
index.html?gltf=11-SW-9A
```

`gltfCap` overrides the handful (default 6, max 24), for example `?gltf=11-SW-9A&gltfCap=2`. Setting `HK_GLTF_SHEET` to `11-SW-9A` does the same without the query. A missing manifest logs a warning and leaves the extrudes in place.

## Placement

glTF node matrices from this product are column-major, Y-up after the node:

- X = HK1980 easting (EPSG:2326)
- Y = metres above Hong Kong Principal Datum
- Z = −northing

Local mesh Z is height. The node matrix turns that onto Y. Confirmed from `11-SW-9B` terrain (`±375` m east, `±300` m north) and from `11-SW-9A` building `B346721638201063A1`.

Horizontal placement is the same Central ENU as `hkCoreProject`: inverse Transverse Mercator to HK1980 latitude/longitude (LandsD explanatory notes, worked example on page C9), then the small-area WGS84 shift (latitude −5.5″, longitude +8.8″). On the 9B terrain centre that shift is about 0.9 m from the [Geodetic Survey API](https://www.geodetic.gov.hk/transform/v2/?inSys=hkgrid&outSys=wgsgeog&e=835625.5625&n=816500).

Vertical placement matches the extrudes, which sit on the sidewalk (`0.22` m) and use `TopHeight − BaseHeight`, not absolute HKPD. Each loaded mesh’s lowest HKPD is snapped onto that sidewalk. Statue Square `BaseHeight` in the sample is about 3.7–5.4 m; the 9A building bases in the node translation are about 1.3–6.1 m.

A footprint whose box overlaps a loaded mesh (intersection at least 15% of the smaller box, 2 m margin) is left out of the extrude batch, so the two surfaces do not z-fight. Everywhere else the extrude remains. The console line starts with `[gltf] sheet … loaded … skipped …` and includes the transform.

## Success

- `node --test tests/*.mjs tests/*.cjs` passes.
- With the flag off, boot never asks for the sheet.
- With `?gltf=11-SW-9A` and a fetched manifest, textured `BUILDING` glTF is baked into Central metres and the WebGPU module graph still starts. `GLTFLoader` is pinned in the import map because the jsDelivr `@dev` alias returns 403 for that one file.

## Next cuts

1. 5 m DTM so the sidewalk is no longer a flat HKPD snap.
2. Pedestrian network on that ground.
3. Denser sheets, then 11-SW-8D, once the single-sheet path is trusted.
4. Neon, signs, and street life after the mesh is in the right place.

## Residual risks

- About a metre of horizontal datum difference versus the LandsD grid API, plus any equirectangular-versus-grid residual across the sheet.
- Snapping each mesh to the sidewalk flattens real steps in HKPD between buildings.
- A mesh that does not share its footprint’s box (courtyard, podium, or a speck we kept) can leave an extrude in place, or hide a neighbour when the boxes overlap.
- Photo materials use the glTF roughness and metalness (`metallicFactor` 0.5 on the FME export). They are not the curtain-wall shader.
- The pinned `GLTFLoader` commit (`5e6eee6ce875`) is three.js `dev` as of 2026-10-24. A later `@dev` build can drift from that file.
