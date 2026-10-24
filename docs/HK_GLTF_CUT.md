# Individualised glTF — Central street faces

Des Voeux and Statue Square use Lands Department / Open3Dhk individualised building meshes. The models are the photogrammetry export (textured glTF), not a procedural podium. Invented canyon walls are removed where one of those meshes covers the street edge. Extrudes that remain, because a sheet has no model there yet, keep an opaque shopfront for the first two storeys. Curtain glass starts above that belt. Neon is a light add-on on the gap podiums.

© Government of the Hong Kong SAR (Lands Department) / [Open3Dhk](https://3d.map.gov.hk/).

## Sheets

Origin is Statue Square (22.28088 N, 114.15979 E), HK1980 about easting 834507, northing 815779. The Des Voeux camera used below sits on that easting, about 29 m south. The 1:1000 sheet edge between 11-SW-8D and 11-SW-9C is the north-south line at easting 834500.6, world x ≈ −7.6. The camera (x = −1.4) is on the 9C side of that line. The street runs east-west, so the west frontage is 8D and the eastward view is 9C.

| Sheet | Zip | BUILDING glTF in the sheet | Intersect Central | Kept on disk |
| --- | --- | --- | --- | --- |
| 11-SW-9C | 534,406,988 bytes | 73 | 73 | 59 (span ≥ 8 m) |
| 11-SW-8D | 2,636,460,399 bytes | 781 | 781 | 24 street faces (see below) |

Central is 22.276–22.288 N, 114.150–114.170 E. 11-SW-9A remains the pier sheet north of this pair (15 BUILDING glTF, none on Des Voeux). 11-SW-9B has no BUILDING models.

11-SW-8D’s 781 models all fall inside the Central box. 747 have a horizontal span of at least 8 m. The page does not need the whole 2.6 GB zip. The street cache is every kept model whose centre is within 180 m of the Des Voeux camera, plus towers of at least 80 m within 280 m: **24 buildings**. One of them, `B344751569101063A0`, is an 80 m × 185 m mesh whose footprint contains the camera (x from −66.9 to 13.4, z from 29.2 to 102.1). That is the photogrammetry street wall, not a glass slab.

11-SW-9C’s 59 models are the east side of the same corner, including towers whose photo atlases show a stone base and real facade. The largest JPEGs are LandsD facade photographs (4096²), not a generated window grid.

```bash
node tools/fetch-central-gltf-sheet.mjs --street
```

That command downloads both zips and keeps every Central BUILDING glTF with span ≥ 8 m. `hk-3d/` is gitignored. A missing manifest leaves the extrude fallback in place.

## What the page does

`HK_GLTF_SHEETS` is `11-SW-9C` and `11-SW-8D`. Boot loads both manifests, keeps masses with span ≥ 8 m inside the core, and mounts the nearest 80. `?gltf=11-SW-9A` still loads a single sheet. `?gltfCap=` overrides the handful, up to 800.

A footprint whose box overlaps a loaded mesh (intersection at least 15% of the smaller box, 2 m margin) is left out of the extrude batch. A canyon wall is cut out wherever its centreline runs through a loaded mesh (3 m margin). The pieces that remain are gap fill.

Gap fill, both the canyon ribbon and the LandsD extrude, is split at `HK_RETAIL_BELT` (sidewalk + two 3.9 m storeys, world y = 8.02). Below that the material is an opaque shopfront: granite plinth to about 1.1 m, shop mouth above the plinth, fascia, then a masonry storey. It does not run a window grid down to the pavement. Glass starts at the belt. Photo materials on the glTF keep the file’s roughness and metalness. The page scales a photo map above 2048 px down to 2048 px so a block of 4K atlases can sit in the GPU; the cached JPEGs are untouched.

Neon boards and strips hang only on canyon faces that are still gaps, on that shopfront belt, and only as a sparse Traditional Chinese add-on. Highways get none.

## Camera

Street level on Des Voeux, looking east along the road:

```text
index.html?at=-1.4,29.3,1.29
```

Person mode, x = −1.4, z = 29.3, heading 1.29 rad. The 8D mesh around that point is textured LandsD geometry. The invented wall is clipped where that footprint sits. Further east, 9C towers continue the street in the same photo material.

## Placement

glTF node matrices are column-major, Y-up after the node: X = HK1980 easting, Y = HKPD, Z = −northing. Horizontal placement is `hkCoreProject` after the HK1980 inverse and the small-area WGS84 shift (latitude −5.5″, longitude +8.8″). Each mesh’s lowest HKPD snaps to the sidewalk at 0.22 m, same as the extrudes.

## Residual risks

- 11-SW-8D on disk is the Des Voeux subset (24), not all 781. `--street` is how to cache the rest of the sheet. Buildings further into Sheung Wan stay on the opaque extrude until that cache grows.
- About a metre of horizontal datum difference versus the LandsD grid API.
- Snapping each mesh to the sidewalk flattens real steps in HKPD.
- A mesh that does not share a footprint’s box can leave an extrude beside it, or hide a neighbour when the boxes overlap.
- The pinned `GLTFLoader` commit (`5e6eee6ce875`) is three.js `dev` as of 2026-10-24.
