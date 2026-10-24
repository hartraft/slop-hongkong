# Slop Hong Kong

A Hong Kong city simulation built with [three.js](https://threejs.org/), WebGPURenderer, and TSL. Explore on foot, by car, by bicycle, or by helicopter.

This build still renders the upstream Manhattan map from `js/nyc-geodata.js`. The Hong Kong frame is Central (Statue Square / Chater): LAT0 = 22.28088, LON0 = 114.15979, true north. v1 covers Hong Kong Island, Kowloon, and Victoria Harbour. The origin decision is in [docs/HK_ORIGIN.md](docs/HK_ORIGIN.md). Cut 3 of the pipeline (frame, LandsD fetch, street graph, and building blocks) is in [docs/HK_GEO_PIPELINE.md](docs/HK_GEO_PIPELINE.md).

This fork started from [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork). The live New York demo remains at [mrdoob.github.io/slop-newyork](https://mrdoob.github.io/slop-newyork/).

## Make it your own

Fork it, remix it, improve it, break it. Make games, animations, films, experiments, or something completely different. Use it as a starting point and take it wherever you want. Have fun!

## License and data

The project code is available under the [MIT License](LICENSE).

The running build still ships the upstream geographic set: NYC Open Data and © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). The Hong Kong fetch path uses Lands Department data via the [CSDI Portal](https://portal.csdi.gov.hk/) / [DATA.GOV.HK](https://data.gov.hk/), with OpenStreetMap (ODbL) as fill. Third-party data and dependencies retain their respective licenses.
