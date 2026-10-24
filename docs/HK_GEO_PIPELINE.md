# Hong Kong geodata pipeline

The WebGPU sim still boots the committed Manhattan scene in `js/nyc-geodata.js`. Cut 2 builds a Hong Kong street graph from the LandsD Road Centreline and OSM highways. It does not write `js/hk-geodata.js` (Cut 4) and does not rebuild blocks or building heights (Cut 3).

## Frame

`tools/geo-frame.mjs` is the source of the numbers in [HK_ORIGIN.md](HK_ORIGIN.md).

| | Hong Kong (`GEO_CITY=hk`) | New York (default) |
|---|---|---|
| Origin | Central / Statue Square–Chater | 5th Ave & 42nd St centreline |
| LAT0, LON0 | 22.28088, 114.15979 | 40.75318, -73.98185 |
| Bearing | True north (`THETA = 0`) | 29.017°, then refined from the avenues |
| World axes | 1 m, x = east, z = south | 1 m, x = grid east, z = grid south |

`tools/geo-base.mjs` reads `GEO_CITY`. Unset or `nyc` runs the existing Manhattan shoreline build and still requires the NYC inputs below. `hk` (aliases `hongkong`, `hong-kong`) sets the Hong Kong frame and does not open CSCL or DCP.

`node tools/build-geodata.mjs` with `GEO_CITY=hk` builds the street graph and then exits 0 before blocks. It does not rewrite `js/nyc-geodata.js` and does not write an `hk-geodata` module. `tools/geo-blocks.mjs` is still the Manhattan block builder.

## v1 bbox

Hong Kong Island, Kowloon up to the Lion Rock / Kowloon Peak ridgeline, and Victoria Harbour. WGS84 degrees, south / west / north / east:

```
22.185, 114.100, 22.360, 114.260
```

The box includes Green Island, Cape D'Aguilar, Stanley, and Stonecutters. Most of Lamma, Lantau, and the New Territories fall outside it. A sliver of northern Lamma or Tseung Kwan O can still meet the edge.

Probe on 2026-10-24, `returnCountOnly` against this bbox: **70,247** Active buildings and **15,227** road centreline parts. A full building extract is on the order of 100 MB. Those files are gitignored.

## LandsD via CSDI

Prefer the open FeatureServer paths. Attribution on every extract: **Lands Department via CSDI Portal / DATA.GOV.HK**. hkgeotiles is not a dependency.

| Layer | Service id | Where | Output |
|---|---|---|---|
| Building | `landsd_rcd_1637211194312_35158` | `Status='Active'` | `tools/data/hk/landsd-buildings.geojson` |
| Road Centreline | `landsd_rcd_1637310758814_80061` | `1=1` | `tools/data/hk/landsd-roads.geojson` |

```
https://portal.csdi.gov.hk/server/rest/services/common/<id>/FeatureServer/0/query?f=geojson&returnGeometry=true&outFields=*&outSR=4326
```

Building heights are metres on Hong Kong Principal Datum. A later cut extrudes `TopHeight - BaseHeight`. Some Active footprints leave those fields null; extrusion skips them. The road layer is an annotation-grade centreline, the LandsD stand-in for CSCL geometry and names. The layer probed on 2026-10-24 advertises `maxRecordCount` 3000 and supports `resultOffset`. The fetcher uses that page size, never asks for more than 10,000 rows, tiles the bbox into cells of at most 0.04°, and splits a cell that would need a deep offset. Features that cross a tile edge are deduped by `featureKey` in `tools/fetch-landsd.mjs`: GeoJSON `feature.id` when CSDI sets it (that id is the OBJECTID), otherwise `properties.OBJECTID` (`objectid` / `ObjectId`). Features with neither key are kept.

### How to fetch

```bash
# Committed fixture: a few buildings and centreline parts around Statue Square
node tools/fetch-landsd.mjs --sample

# Full Island + Kowloon extract, plus OSM fill. Writes tools/data/hk/ (gitignored).
bash tools/fetch-hk.sh

# Either source on its own
bash tools/fetch-hk.sh --landsd-only
bash tools/fetch-hk.sh --osm-only
```

`--layer buildings|roads`, `--bbox south,west,north,east`, `--page-size`, and `--out` are passed through `fetch-landsd.mjs` (`--help`).

The committed samples live in `tools/data/hk/samples/` (`statue-square-buildings.geojson`, `statue-square-roads.geojson`, and `statue-square-highways.json` for the street-graph smoke test). Refresh the LandsD files with `--sample`. Do not commit `landsd-*.geojson` or `osm_*.json` from a full run.

## Street graph (Cut 2)

`GEO_CITY=hk` makes `tools/geo-streets.mjs` call `tools/geo-hk-streets.mjs`. The Manhattan numbered-street and avenue lists stay on the NYC path. Hong Kong `STREETS` and `AVENUES` are empty.

Same roles as the NYC pipeline. Only the government centreline changes:

| Role | New York | Hong Kong |
|---|---|---|
| Street centreline geometry and names | CSCL | LandsD Road Centreline |
| Class, lanes, width, oneway, and roads the centreline misses | (CSCL carries width and lanes) | OSM highways (`q_hk_highways.overpassql`) |
| Coast, water, parks, landmarks, piers | OSM `q_*` | OSM `q_hk_*` (unchanged roles) |
| Blocks and building heights | DCP / CSCL blocks | Still Cut 3. Not this graph. |

LandsD `STREETTYPE` values on the layer are Main Road, Secondary Road, Highway, Tunnel, Restricted Road, and Track. Track is not a carriageway and is left out. The other five become world-frame pieces (`x` east, `z` south, metres) and graph links. A link is `[node a, node b, name index, width m, lanes, direction, inner x/z…]`, the same tuple as `buildRoadGraph()` in `tools/geo-roadgraph.mjs`. Direction is `1` along the digitised line, `-1` against it, `0` both ways. LandsD has no travel direction, so oneway comes from a matched OSM way; otherwise the link is both ways.

There is no measured width on the centreline. A matched OSM `width` wins, then OSM `lanes` × 3.3 m, then a class width (motorway 14, trunk 12, primary / Main Road 11, secondary 8.5, residential 6.5, service / Restricted Road 4.5). Highway and motorway/trunk links use roadway code `2`. Tunnels use level `tunnel` and code `3`. OSM `bridge` lifts the level to `elevated`. `*_link` is a ramp.

Matching is 12 m and about 25° of bearing. When a service road and a main road both lie on the same centreline, the higher OSM class is the one copied onto it. An OSM way that is not already on the centreline is appended as gap links (runs of at least 18 m). Its ends snap to an existing node within 12 m. LandsD ends snap within 1.5 m. Footways, paths, and service driveways are not part of the graph. The Manhattan module is not imported, so Broadway, numbered avenues, and the 14th Street cutoff are not applied.

Without `tools/data/hk/landsd-roads.geojson`, the stage uses the committed Statue Square centreline and `statue-square-highways.json`. A full centreline does not fall back to that small highway fixture. Missing OSM keeps the LandsD geometry and uses `STREETTYPE` for class.

```bash
# Statue Square sample: LandsD centreline + OSM highway fixture
GEO_CITY=hk node tools/geo-streets.mjs

# Same graph, then stop. Exit 0. Does not write js/nyc-geodata.js or js/hk-geodata.js.
GEO_CITY=hk node tools/build-geodata.mjs

# Full extract (gitignored) once tools/data/hk/landsd-roads.geojson and osm_highways.json exist
GEO_CITY=hk node tools/geo-streets.mjs
```

## OSM fill

OpenStreetMap keeps the roles it has on the NYC path: coast, water, parks, landmarks, and piers. Highways are additional, and they feed the street graph above. They do not replace the centreline. Queries, same bbox:

- `tools/data/q_hk_coast.overpassql` — coastline, water, riverbank, harbour
- `tools/data/q_hk_parks.overpassql` — parks, gardens, nature reserves, protected areas
- `tools/data/q_hk_landmarks.overpassql` — named landmark footprints
- `tools/data/q_hk_piers.overpassql` — piers and ferry terminals
- `tools/data/q_hk_highways.overpassql` — drivable highways for class, lanes, width, oneway, and gaps

`tools/fetch-hk.sh` runs these through `tools/overpass.sh` into `tools/data/hk/osm_*.json` (`osm_highways.json` for the highway query). The NYC queries `q_coast`, `q_cp`, `q_landmarks`, and `q_piers` are unchanged.

## What the NYC boot path still needs

Leave `GEO_CITY` unset (or set `nyc`) and keep these files in `tools/data/`:

- `cscl_manhattan.json` — NYC street centreline (CSCL), `inkn-q76z`
- `dcp_boroughs.json` — DCP borough boundaries, `gthc-hcne`
- `nycparks_manhattan.json` — NYC Parks properties, `enfh-gkve`
- `osm_centralpark.json`, `osm_piers.json`, `osm_coastline.json`, `osm_landmarks.json` — from the NYC Overpass queries

Rebuild, without touching the Hong Kong fetch:

```bash
node --max-old-space-size=8192 tools/build-geodata.mjs
```

That rewrites `js/nyc-geodata.js`. Leave `GEO_CITY` unset. The Hong Kong street stage does not write that file.

## Later cuts

- Cut 3: blocks, and building heights from LandsD Building (`TopHeight - BaseHeight`). OSM buildings are gap fill only. `geo-blocks.mjs` stays on the Manhattan raster until then. The street stage stops here on purpose.
- Cut 4: generate an `hk-geodata` module. Until that lands, the sim keeps booting `js/nyc-geodata.js`.
