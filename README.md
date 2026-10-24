# Slop Hong Kong

A Hong Kong city simulation built with [three.js](https://threejs.org/), WebGPURenderer, and TSL. Explore on foot, by car, by bicycle, or by helicopter.

Opening `index.html` loads Hong Kong. No query parameter is required. The scene is `js/hk-geodata.js`: the full Hong Kong Island and Kowloon extract (LandsD buildings and the road centreline, OSM highways, parks, and Victoria Harbour), origin at Central (中環／皇后像廣場), LAT0 = 22.28088, LON0 = 114.15979, true north. The interface is Traditional Chinese (繁體中文). The origin decision is in [docs/HK_ORIGIN.md](docs/HK_ORIGIN.md). Cut 5 of the pipeline, including how to re-fetch, is in [docs/HK_GEO_PIPELINE.md](docs/HK_GEO_PIPELINE.md).

This fork started from [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork). The live New York demo remains at [mrdoob.github.io/slop-newyork](https://mrdoob.github.io/slop-newyork/).

## Make it your own

Fork it, remix it, improve it, break it. Make games, animations, films, experiments, or something completely different. Use it as a starting point and take it wherever you want. Have fun!

## License and data

The project code is available under the [MIT License](LICENSE).

The playable page uses Lands Department data via the [CSDI Portal](https://portal.csdi.gov.hk/) / [DATA.GOV.HK](https://data.gov.hk/) for buildings and the road centreline, and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL) for Victoria Harbour, the coast, and piers. `js/nyc-geodata.js` remains in the tree so the Manhattan rebuild tools still run; the page does not load it. Third-party data and dependencies retain their respective licenses.
