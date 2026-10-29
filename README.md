# Slop Hong Kong

A Hong Kong-focused city simulation based on [Slop New York](https://github.com/mrdoob/slop-newyork), built with Three.js, WebGPURenderer, and TSL.

**Status: conversion in progress.** This repository currently contains the upstream Manhattan implementation. It is not yet a playable Hong Kong map; the city geography, road network, building data, coastline, landmarks, and map labels must be replaced together rather than merely renaming the UI.

## Target

The first playable slice will focus on **Causeway Bay and Wan Chai**, with an expansion path toward Central and across Victoria Harbour to Tsim Sha Tsui. The existing walking, driving, cycling, helicopter, camera, and time-of-day systems should be retained where practical.

## Conversion plan

1. Audit and isolate New York-specific geography and coordinate assumptions.
2. Establish a reproducible Hong Kong geodata pipeline for roads, building footprints/heights, coastline, and terrain.
3. Replace Manhattan geometry with a compact, correctly projected Hong Kong area.
4. Add local landmarks and teleport destinations; adapt traffic and road markings for left-hand traffic.
5. Update the HUD, maps, descriptions, and branding once they accurately represent the implemented area.
6. Test in a WebGPU-capable browser and document data provenance and known limitations.

## Run locally

Serve the repository with a local static HTTP server and open it in a browser with WebGPU support. The project uses an import map to load Three.js modules from jsDelivr. Browser support and GPU capability affect whether the simulation starts successfully.

## Code and data licensing

The upstream project code is available under the [MIT License](LICENSE). Preserve upstream attribution and check the terms of each new dataset before redistribution. OpenStreetMap data is licensed under the [ODbL](https://www.openstreetmap.org/copyright) and requires attribution; any Hong Kong government or other geographic datasets may have separate terms.

## Upstream

- Original project: [mrdoob/slop-newyork](https://github.com/mrdoob/slop-newyork)
- Community city remixes: [zz85/slop-cities](https://github.com/zz85/slop-cities)
