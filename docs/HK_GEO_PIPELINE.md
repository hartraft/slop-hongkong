# Hong Kong geodata pipeline

Cut 1 is the geographic frame and the fetch path. The WebGPU sim still boots the committed Manhattan scene in `js/nyc-geodata.js`. This cut does not regenerate that file and does not build Hong Kong streets or blocks.

## Frame

`tools/geo-frame.mjs` is the source of the numbers in [HK_ORIGIN.md](HK_ORIGIN.md).

| | Hong Kong (`GEO_CITY=hk`) | New York (default) |
|---|---|---|
| Origin | Central / Statue Square–Chater | 5th Ave & 42nd St centreline |
| LAT0, LON0 | 22.28088, 114.15979 | 40.75318, -73.98185 |
| Bearing | True north (`THETA = 0`) | 29.017°, then refined from the avenues |
| World axes | 1 m, x = east, z = south | 1 m, x = grid east, z = grid south |

`tools/geo-base.mjs` reads `GEO_CITY`. Unset or `nyc` runs the existing Manhattan shoreline build and still requires the NYC inputs below. `hk` (aliases `hongkong`, `hong-kong`) sets the Hong Kong frame and does not open CSCL or DCP.

`node tools/build-geodata.mjs` with `GEO_CITY=hk` exits 2. Street and block assembly stays on the NYC modules until a later cut.

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

Building heights are metres on Hong Kong Principal Datum. A later cut extrudes `TopHeight - BaseHeight`. Some Active footprints leave those fields null; extrusion skips them. The road layer is an annotation-grade centreline, the LandsD stand-in for CSCL. The layer probed on 2026-10-24 advertises `maxRecordCount` 3000 and supports `resultOffset`. The fetcher uses that page size, never asks for more than 10,000 rows, tiles the bbox into cells of at most 0.04°, and splits a cell that would need a deep offset. Features that cross a tile edge are deduped on `OBJECTID`.

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

The committed samples live in `tools/data/hk/samples/` (`statue-square-buildings.geojson`, `statue-square-roads.geojson`). Refresh them with `--sample`. Do not commit `landsd-*.geojson` or `osm_*.json` from a full run.

## OSM fill

LandsD is the primary source for buildings and roads. OpenStreetMap fills coast, water, parks, landmarks, and piers. Queries, same bbox:

- `tools/data/q_hk_coast.overpassql` — coastline, water, riverbank, harbour
- `tools/data/q_hk_parks.overpassql` — parks, gardens, nature reserves, protected areas
- `tools/data/q_hk_landmarks.overpassql` — named landmark footprints
- `tools/data/q_hk_piers.overpassql` — piers and ferry terminals

`tools/fetch-hk.sh` runs these through `tools/overpass.sh` into `tools/data/hk/osm_*.json`. The NYC queries `q_coast`, `q_cp`, `q_landmarks`, and `q_piers` are unchanged.

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

That rewrites `js/nyc-geodata.js`. Cut 1 does not run it.

## Later cuts

- Cuts 2–3: streets and blocks from the LandsD centreline and building footprints. `geo-streets.mjs` and `geo-blocks.mjs` stay on CSCL until then.
- Cut 4: generate an `hk-geodata` module. Until that lands, the sim keeps booting `js/nyc-geodata.js`.
