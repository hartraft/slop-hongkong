# tools/data/hk

Hong Kong source data. The default page boots `js/hk-geodata.js`. `GEO_CITY=hk node tools/build-geodata.mjs` rewrites that file (streets, LandsD blocks, Victoria Harbour, piers). Open `index.html` with no query parameter.

- `samples/` — Statue Square–Chater LandsD excerpt, plus `statue-square-highways.json` (a few-metre offset of those centrelines, one extra way, and a footway the graph must ignore). `harbour-coast.json` and `harbour-piers.json` are the OSM coast and pier fixtures used when `osm_coast.json` / `osm_piers.json` are absent. Those fixtures already trace the full-bbox shores, so a sample harbour matches the committed module's Island, Kowloon, and Victoria Harbour rings. Refresh the LandsD files with `node tools/fetch-landsd.mjs --sample`. The committed `js/hk-geodata.js` is the full extract (LandsD buildings and roads plus OSM highways, coast, parks, and piers), not this sample.
- `landsd-buildings.geojson` and `landsd-roads.geojson` — full Island + Kowloon extracts. Gitignored. The street graph prefers `landsd-roads.geojson` over the sample. Blocks prefer `landsd-buildings.geojson`.
- `osm_*.json` — Overpass output from `tools/data/q_hk_*.overpassql`, including `osm_highways.json` for the street graph and `osm_coast.json` / `osm_piers.json` for the harbour. Gitignored. When those full files are present the build prefers them over the harbour samples. A full centreline does not pair with the Statue Square highway fixture. `osm_buildings.json` is optional gap fill for blocks and is not part of the default fetch.

```bash
bash tools/fetch-hk.sh
```

Frame, bbox, service ids, and the NYC inputs that the boot path still requires: [docs/HK_GEO_PIPELINE.md](../../../docs/HK_GEO_PIPELINE.md).

Attribution for the LandsD files: Lands Department via CSDI Portal / DATA.GOV.HK.
