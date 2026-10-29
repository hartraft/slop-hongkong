# Hong Kong geography: data and implementation notes

This document records candidate sources for replacing the upstream Manhattan dataset. Confirm the current licence, attribution, redistribution, API and caching terms before checking derived assets into this repository.

## Recommended source order

### 1. Hong Kong Lands Department 3D Spatial Data API

- Dataset/API: https://tools.csdi.gov.hk/csdi-webpage/apidoc/3d-spatial-data-api
- Coverage: territory-wide building and infrastructure models delivered as Cesium 3D Tiles in WGS84.
- Why it matters: this may provide a faster route to recognizable building massing and major infrastructure than extruding every building footprint ourselves.
- Integration question: determine whether the tile data can be baked into a compact static asset compatible with this project's procedural Three.js scene, and whether its terms allow redistribution of derived assets.

### 2. Lands Department 3D Visualisation Map

- Individualised models: https://data.gov.hk/en-data/dataset/hk-landsd-openmap-3d-visualisation-map-individualised-models
- Non-textured models: https://data.gov.hk/en-data/dataset/hk-landsd-openmap-3d-visualisation-map-non-textured-models
- Tile-based models: https://data.gov.hk/en-data/dataset/hk-landsd-openmap-3d-visualisation-map-tile-based-models
- These datasets cover Hong Kong and include combinations of buildings, infrastructure, vegetation, waterbody and terrain. Formats vary by product and include glTF / Cesium 3D Tiles.
- Review the dataset-specific terms and attribution before choosing one for a distributable browser game.

### 3. Building footprints and heights

- Lands Department Building dataset: https://data.gov.hk/en-data/dataset/hk-landsd-openmap-landsd-building
- The dataset describes building/structure polygons and attributes including building name and height. It is a useful fallback for a procedural building pipeline where 3D model licensing or asset size is unsuitable.

### 4. OpenStreetMap

- Copyright and licence: https://www.openstreetmap.org/copyright
- Use OSM for street centre-lines, road classification, names, paths, and supplementary points of interest where coverage and tags are adequate.
- Include required attribution and assess ODbL obligations for the database and any distributed derived database.

### 5. Coordinate systems and terrain

- Lands Department geospatial open data: https://www.landsd.gov.hk/en/spatial-data/open-data.html
- Hong Kong datasets may use Hong Kong 1980 Grid or WGS84 depending on the product. Keep the source CRS explicit in the pipeline and transform to a local metric coordinate frame for rendering.
- Use a local origin near the chosen playable area (initially Causeway Bay / Wan Chai), keep horizontal units in metres, and preserve elevation separately. Avoid applying NYC's Manhattan-grid bearing or its assumed flat island bounds.

## First playable area

Start with a bounded Causeway Bay–Wan Chai slice. Include enough coastline and harbour to make the location unmistakable, but keep the first asset package small enough for a normal browser load. Expansion to Central and Tsim Sha Tsui should follow only after the projection, roads, collision geometry, and map agree.

## Data pipeline requirements

- Keep source downloads separate from generated files.
- Record source URL, retrieval date, licence/terms URL, source CRS, and transformation parameters.
- Make generation deterministic and document all required tools.
- Clip sources to a documented bounding box before conversion.
- Validate geometry for invalid polygons, missing heights, coordinate-order errors, and outliers.
- Produce one consistent coordinate frame for 3D geometry, minimap, full-screen map, player spawn, teleport locations, and collision.
- Do not commit large raw datasets until size, redistribution rights, and Git history impact have been assessed.

## Licensing reminder

The upstream code is MIT-licensed, but that does not automatically license third-party geographic datasets or 3D models. Preserve upstream attribution, comply with each dataset's terms, and include OpenStreetMap attribution if OSM-derived data is used.
