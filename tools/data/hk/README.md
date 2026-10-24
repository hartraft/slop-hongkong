# tools/data/hk

Hong Kong source data for later geodata cuts. The sim does not read this directory yet.

- `samples/` — small Statue Square–Chater excerpt from LandsD, safe to commit. Refresh with `node tools/fetch-landsd.mjs --sample`.
- `landsd-buildings.geojson` and `landsd-roads.geojson` — full Island + Kowloon extracts. Gitignored.
- `osm_*.json` — Overpass fill from `tools/data/q_hk_*.overpassql`. Gitignored.

```bash
bash tools/fetch-hk.sh
```

Frame, bbox, service ids, and the NYC inputs that the boot path still requires: [docs/HK_GEO_PIPELINE.md](../../../docs/HK_GEO_PIPELINE.md).

Attribution for the LandsD files: Lands Department via CSDI Portal / DATA.GOV.HK.
