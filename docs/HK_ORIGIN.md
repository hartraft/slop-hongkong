# Hong Kong world origin

Decision record for the Hong Kong frame. The running WebGPU build still loads the Manhattan scene in `js/nyc-geodata.js`. The numbers below are the Hong Kong frame in `tools/geo-frame.mjs`, selected with `GEO_CITY=hk`. `tools/geo-base.mjs` keeps the Manhattan frame and the NYC inputs unless that switch is set. Fetch and bbox notes are in [HK_GEO_PIPELINE.md](HK_GEO_PIPELINE.md).

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
