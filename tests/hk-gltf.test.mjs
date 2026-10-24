import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HK_CORE_WORLD, HK_GLTF_SHEET, ISLAND_BOUNDS } from '../js/city-config.js';
import {
  assertSheetAllowed,
  boundsFromGltf,
  chooseCentralSheet,
  formatGltfLog,
  hiddenExtrudeIds,
  hk80GridToHk80Geog,
  hk80GridToWgs84,
  hk80ToWorld,
  hkpdToSidewalkY,
  isBuildingGltf,
  planGltfManifest,
  resolveHkGltfRequest
} from '../js/hk-gltf-frame.js';

const root = fileURLToPath(new URL('..', import.meta.url));

// LandsD worked example, explanatory notes page C9: HK1980 grid → HK1980 geographic.
const WORKED_E = 836055;
const WORKED_N = 832699;
const WORKED_LAT = 22 + 26 / 60 + 6.76 / 3600;
const WORKED_LON = 114 + 10 / 60 + 20.45 / 3600;

// Official API, 2026-10-24: https://www.geodetic.gov.hk/transform/v2/?inSys=hkgrid&outSys=wgsgeog
// Sheet 11-SW-9B terrain centre from the glTF node matrix.
const SHEET_9B_E = 835625.5625;
const SHEET_9B_N = 816500;
const SHEET_9B_WGS = { lat: 22.28739549, lon: 114.170640292 };

// 11-SW-9A BUILDING/B346721638201063A1 node matrix (local origin).
const NINE_A_MATRIX = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 834672.5625, 4.715000152587891, -816382.6875, 1];

function metresBetween(lat, lon, lat2, lon2) {
  const phi = (22.28088 * Math.PI) / 180;
  const a = 6378137;
  const e2 = 6.69437999014e-3;
  const sin = Math.sin(phi);
  const nrad = a / Math.sqrt(1 - e2 * sin * sin);
  const mrad = (a * (1 - e2)) / (1 - e2 * sin * sin) ** 1.5;
  const kx = (Math.PI / 180) * nrad * Math.cos(phi);
  const ky = (Math.PI / 180) * mrad;
  return Math.hypot((lon - lon2) * kx, (lat - lat2) * ky);
}

test('HK1980 grid matches the LandsD worked example and the geodetic API within a metre', () => {
  const hk = hk80GridToHk80Geog(WORKED_E, WORKED_N);
  assert.ok(Math.abs(hk.lat - WORKED_LAT) < 0.02 / 3600, `lat ${hk.lat}`);
  assert.ok(Math.abs(hk.lon - WORKED_LON) < 0.02 / 3600, `lon ${hk.lon}`);
  const wgs = hk80GridToWgs84(SHEET_9B_E, SHEET_9B_N);
  const miss = metresBetween(wgs.lat, wgs.lon, SHEET_9B_WGS.lat, SHEET_9B_WGS.lon);
  assert.ok(miss < 1.2, `9B centre is ${miss.toFixed(2)} m from the LandsD API`);
});

test('a 11-SW-9A building node lands in the Central core, east and up', () => {
  const gltf = {
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'B346721638201063A1', matrix: NINE_A_MATRIX, children: [1] },
      { mesh: 0 }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{
      type: 'VEC3',
      min: [-64.75, -35.375, 0],
      max: [64.75, 35.375, 25.29199981689453]
    }]
  };
  const box = boundsFromGltf(gltf);
  assert.equal(box.name, 'B346721638201063A1');
  assert.ok(box.minX < 164.35 && box.maxX > 164.35);
  assert.ok(box.minZ < -604.44 && box.maxZ > -604.44);
  assert.ok(box.minX >= HK_CORE_WORLD.minX && box.maxX <= HK_CORE_WORLD.maxX);
  assert.ok(box.minZ >= HK_CORE_WORLD.minZ && box.maxZ <= HK_CORE_WORLD.maxZ);
  assert.ok(box.span >= 100, `span ${box.span}`);
  assert.ok(box.minH < 5 && box.maxH > 25);
  const origin = hk80ToWorld(834672.5625, 816382.6875, 4.715);
  assert.ok(Math.abs(origin[0] - 164.344) < 0.05);
  assert.ok(Math.abs(origin[2] - -604.443) < 0.05);
  assert.equal(hkpdToSidewalkY(4.715, 4.715), ISLAND_BOUNDS.sidewalkHeight);
  assert.ok(Math.abs(hkpdToSidewalkY(4.715 + 25.292, 4.715) - (ISLAND_BOUNDS.sidewalkHeight + 25.292)) < 1e-9);
});

test('11-SW-9B with no overlapping BUILDING models falls back only to 11-SW-9A', () => {
  const kept = chooseCentralSheet([{ sheet: '11-SW-9B', buildingFiles: 4, overlap: 2 }]);
  assert.equal(kept.sheet, '11-SW-9B');
  const fallback = chooseCentralSheet([
    { sheet: '11-SW-9B', buildingFiles: 0, overlap: 0 },
    { sheet: '11-SW-9A', buildingFiles: 15, overlap: 5 }
  ]);
  assert.equal(fallback.sheet, '11-SW-9A');
  assert.match(fallback.reason, /11-SW-9B/);
  assert.match(fallback.reason, /11-SW-9A/);
  assert.doesNotMatch(fallback.reason, /8D/);
  assert.throws(() => assertSheetAllowed('11-SW-8D'), /8D/);
  assert.equal(assertSheetAllowed('11-SW-9A'), '11-SW-9A');
});

test('BUILDING glTF paths are the individualised models, not terrain or generic', () => {
  assert.equal(isBuildingGltf('BUILDING/B346721638201063A1/B346721638201063A1.gltf'), true);
  assert.equal(isBuildingGltf('BUILDING_block.gltf'), true);
  assert.equal(isBuildingGltf('GENERIC/G352501620001062A1/G352501620001062A1.gltf'), false);
  assert.equal(isBuildingGltf('TERRAIN(TB)/T35250162000106E12/T35250162000106E12.gltf'), false);
  assert.equal(isBuildingGltf('VEGETATION(TB)/V352501620001062A1/V352501620001062A1.gltf'), false);
  assert.equal(isBuildingGltf('BUILDING/B1/B1.bin'), false);
});

test('the manifest keeps a capped handful of Central masses and hides overlapping extrudes', () => {
  assert.equal(HK_GLTF_SHEET, '');
  const manifest = {
    sheet: '11-SW-9A',
    buildings: [
      { file: 'BUILDING/speck.gltf', name: 'speck', minX: 10, maxX: 12, minZ: -10, maxZ: -8, minH: 4, maxH: 6, span: 2 },
      { file: 'BUILDING/near.gltf', name: 'near', minX: 100, maxX: 160, minZ: -640, maxZ: -560, minH: 4, maxH: 30, span: 60 },
      { file: 'BUILDING/also.gltf', name: 'also', minX: 40, maxX: 90, minZ: -700, maxZ: -640, minH: 4, maxH: 20, span: 50 },
      { file: 'BUILDING/far.gltf', name: 'far', minX: 5000, maxX: 5060, minZ: 5000, maxZ: 5060, minH: 4, maxH: 20, span: 60 }
    ]
  };
  const plan = planGltfManifest(manifest, { cap: 1 });
  assert.equal(plan.sheet, '11-SW-9A');
  assert.equal(plan.selected.length, 1);
  assert.equal(plan.selected[0].name, 'near');
  assert.equal(plan.skippedSpeck, 1);
  assert.equal(plan.skippedOutside, 1);
  assert.equal(plan.skippedCap, 1);
  const hidden = hiddenExtrudeIds([
    { id: 1, height: 20, minX: 110, maxX: 140, minZ: -620, maxZ: -580, cx: 125, cz: -600 },
    { id: 2, height: 20, minX: 0, maxX: 10, minZ: 0, maxZ: 10, cx: 5, cz: 5 },
    { id: 3, height: null, minX: 110, maxX: 140, minZ: -620, maxZ: -580, cx: 125, cz: -600 }
  ], plan.selected);
  assert.deepEqual(hidden, [1]);
  const line = formatGltfLog({
    sheet: '11-SW-9A',
    loaded: 1,
    skipped: 3,
    skippedSpeck: 1,
    skippedOutside: 1,
    skippedCap: 1,
    hidden: hidden.length,
    sidewalk: ISLAND_BOUNDS.sidewalkHeight
  });
  assert.match(line, /sheet 11-SW-9A/);
  assert.match(line, /loaded 1/);
  assert.match(line, /skipped 3/);
  assert.match(line, /EPSG:2326|HK1980/);
  assert.match(line, /sidewalk/);
});

test('the local flag is the gltf query, else the empty city-config default', () => {
  assert.equal(resolveHkGltfRequest('https://x/index.html'), null);
  assert.equal(resolveHkGltfRequest('https://x/index.html?gltf=11-SW-9A').sheet, '11-SW-9A');
  assert.equal(resolveHkGltfRequest('https://x/index.html?gltf=11-SW-9A').cap, 6);
  assert.equal(resolveHkGltfRequest('https://x/index.html?gltf=11-SW-9A&gltfCap=2').cap, 2);
  assert.equal(resolveHkGltfRequest('https://x/index.html?gltf=manhattan'), null);
  assert.equal(resolveHkGltfRequest('https://x/index.html', { configured: '11-SW-9B' }).sheet, '11-SW-9B');
  assert.equal(resolveHkGltfRequest('https://x/index.html?gltf=11-SW-9A', { configured: '11-SW-9B' }).sheet, '11-SW-9A');
});

test('boot wires the sheet ahead of the extrude and preloads the frame', () => {
  const main = readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const buildings = readFileSync(path.join(root, 'js/buildings.js'), 'utf8');
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = readFileSync(path.join(root, 'tools/fetch-central-gltf-sheet.mjs'), 'utf8');
  assert.match(main, /prepareHkGltfSheet/);
  assert.match(main, /mountHkGltfBuildings/);
  assert.match(main, /buildCityBlocks\(scene, gltfPlan\)/);
  assert.match(buildings, /hiddenIds/);
  assert.match(html, /hk-gltf-frame\.js/);
  assert.match(html, /hk-gltf\.js/);
  assert.match(script, /download\.map\.gov\.hk\/api\/3d-zip\/GLTF/);
  assert.match(script, /chooseCentralSheet/);
  assert.match(script, /11-SW-9B/);
  assert.match(script, /11-SW-9A/);
  assert.doesNotMatch(script, /11-SW-8D\.zip/);
});
