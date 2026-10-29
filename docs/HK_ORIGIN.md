# Hong Kong world origin

Decision record for the Hong Kong frame. The running WebGPU build loads `js/hk-geodata.js` with no query parameter. The numbers below are the Hong Kong frame in `tools/geo-frame.mjs`. `GEO_CITY=hk` is how the geodata tools select that frame. Unset `GEO_CITY` still rebuilds the legacy Manhattan file, which the page does not boot. Fetch and bbox notes are in [HK_GEO_PIPELINE.md](HK_GEO_PIPELINE.md).

## Origin

Central, Hong Kong — Statue Square / Chater Road.

- LAT0 = 22.28088
- LON0 = 114.15979

Mean of OpenStreetMap Statue Square nodes near Chater Road.

## Why Central

In a 1.2 km sample, Central had the densest OpenStreetMap coverage among Central, Admiralty, and Tsim Sha Tsui: buildings, height tags, and named features.

## Bearing

v1 bearing is true north. `THETA = 0` in `tools/geo-frame.mjs`. A rotation onto the harbour axis is deferred. No offset angle is chosen in this step.

## v1 extent

Hong Kong Island, Kowloon, and Victoria Harbour.
