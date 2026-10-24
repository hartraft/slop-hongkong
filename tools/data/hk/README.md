# tools/data/hk

Hong Kong source data. The sim still boots `js/nyc-geodata.js`. `GEO_CITY=hk` reads the road centreline from this directory when building the street graph.

- `samples/` — Statue Square–Chater LandsD excerpt, plus `statue-square-highways.json` (a few-metre offset of those centrelines, one extra way, and a footway the graph must ignore). Refresh the LandsD files with `node tools/fetch-landsd.mjs --sample`.
- `landsd-buildings.geojson` and `landsd-roads.geojson` — full Island + Kowloon extracts. Gitignored. The street graph prefers `landsd-roads.geojson` over the sample.
- `osm_*.json` — Overpass output from `tools/data/q_hk_*.overpassql`, including `osm_highways.json` for the street graph. Gitignored. A full centreline does not pair with the Statue Square highway fixture.

```bash
bash tools/fetch-hk.sh
```

Frame, bbox, service ids, and the NYC inputs that the boot path still requires: [docs/HK_GEO_PIPELINE.md](../../../docs/HK_GEO_PIPELINE.md).

Attribution for the LandsD files: Lands Department via CSDI Portal / DATA.GOV.HK.
