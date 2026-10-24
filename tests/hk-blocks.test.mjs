import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFrame, HK_ISLAND_KOWLOON_BBOX } from '../tools/geo-frame.mjs';
import {
  HK_MIN_BLOCK_AREA,
  atGradeRoadPieces,
  buildHkBlocks,
  extrusionHeight,
  hkDetailBounds,
  resolveHkBuildingInputs
} from '../tools/geo-hk-blocks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const toWorld = (lon, lat) => [lon, lat];
const localBounds = { cutZ: -50, x0: -100, x1: 500, z1: 500 };

function square(x, z, size) {
  return [[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]];
}

test('extrusion is TopHeight minus BaseHeight and skips a null or flat pair', () => {
  assert.equal(extrusionHeight(3.7, 84.1), 80.4);
  assert.equal(extrusionHeight(4.6, 78.3), 73.7);
  assert.equal(extrusionHeight(null, 40), null);
  assert.equal(extrusionHeight(10, 10), null);
  assert.equal(extrusionHeight(12, 9), null);
  assert.equal(HK_MIN_BLOCK_AREA, 40);
});

test('detail cut sits north of the Lion Rock line, not at 129th Street', () => {
  const frame = createFrame('hk');
  const bounds = hkDetailBounds(frame.toWorld);
  const north = frame.toWorld((HK_ISLAND_KOWLOON_BBOX.west + HK_ISLAND_KOWLOON_BBOX.east) / 2, HK_ISLAND_KOWLOON_BBOX.north);
  const origin = frame.toWorld(114.15979, 22.28088);
  assert.notEqual(bounds.cutZ, -7090);
  assert.ok(bounds.cutZ < -8000);
  assert.ok(north[1] > bounds.cutZ);
  assert.ok(origin[1] > bounds.cutZ && origin[1] < bounds.z1);
  assert.ok(origin[0] > bounds.x0 && origin[0] < bounds.x1);
});

test('footprints become lots, specks and inactive records drop, and the north fringe is carpet', () => {
  const buildings = {
    features: [
      {
        type: 'Feature',
        id: 1,
        properties: { Status: 'Active', BaseHeight: 0, TopHeight: 40, BuildingNameEN: 'Tower', BuildingBlockType: 'Tower' },
        geometry: { type: 'Polygon', coordinates: [square(0, 0, 30)] }
      },
      {
        type: 'Feature',
        id: 2,
        properties: { Status: 'Active', BaseHeight: 1, TopHeight: 4, BuildingNameEN: 'Shed' },
        geometry: { type: 'Polygon', coordinates: [square(0, 40, 3)] }
      },
      {
        type: 'Feature',
        id: 3,
        properties: { Status: 'Proposed', BaseHeight: 0, TopHeight: 20, BuildingNameEN: 'Nope' },
        geometry: { type: 'Polygon', coordinates: [square(40, 0, 20)] }
      },
      {
        type: 'Feature',
        id: 4,
        properties: { Status: 'Active', BaseHeight: 10, TopHeight: 10, BuildingNameEN: 'Flat' },
        geometry: { type: 'Polygon', coordinates: [square(80, 0, 20)] }
      },
      {
        type: 'Feature',
        id: 5,
        properties: { Status: 'Active', BaseHeight: 1, TopHeight: 9, BuildingNameEN: 'Ridge' },
        geometry: { type: 'Polygon', coordinates: [square(0, -80, 20)] }
      }
    ]
  };
  const osm = {
    elements: [
      {
        type: 'way',
        id: 10,
        tags: { building: 'yes', name: 'Inside', height: '18' },
        geometry: square(5, 5, 8).map(([lon, lat]) => ({ lon, lat }))
      },
      {
        type: 'way',
        id: 11,
        tags: { building: 'commercial', name: 'Gap House', height: '12 m' },
        geometry: square(200, 10, 16).map(([lon, lat]) => ({ lon, lat }))
      },
      {
        type: 'way',
        id: 12,
        tags: { building: 'yes', name: 'Tiny Gap' },
        geometry: square(220, 40, 2).map(([lon, lat]) => ({ lon, lat }))
      }
    ]
  };
  const pieces = [
    { level: '13', rw: '1', w: 11, name: 'QUEENSWAY', x0: 0, z0: -5, x1: 40, z1: -5 },
    { level: 'tunnel', rw: '3', w: 11, name: 'WESTERN HARBOUR CROSSING', x0: 0, z0: 50, x1: 40, z1: 50 }
  ];
  const { blocks, lowDetail, roads, report } = buildHkBlocks({
    buildings,
    osm,
    pieces,
    toWorld,
    bounds: localBounds
  });
  assert.equal(report.droppedSpecks, 2);
  assert.equal(report.skippedFeatures, 1);
  assert.equal(report.osmCovered, 1);
  assert.equal(report.osmGapBlocks, 1);
  assert.equal(lowDetail.length, 1);
  assert.equal(lowDetail[0].name, 'Ridge');
  assert.equal(roads.length, 1);
  assert.equal(roads[0].name, 'QUEENSWAY');
  const names = blocks.map((block) => block.name).sort();
  assert.deepEqual(names, ['Flat', 'Gap House', 'Tower']);
  const tower = blocks.find((block) => block.name === 'Tower');
  assert.equal(tower.height, 40);
  assert.equal(tower.base, 0);
  assert.equal(tower.source, 'landsd');
  assert.equal(tower.rect, true);
  assert.equal(tower.frames, null);
  assert.equal(tower.rects.length, 1);
  assert.equal(tower.park, 0);
  const flat = blocks.find((block) => block.name === 'Flat');
  assert.equal(flat.height, null);
  const gap = blocks.find((block) => block.name === 'Gap House');
  assert.equal(gap.source, 'osm');
  assert.equal(gap.height, 12);
  assert.ok(!blocks.some((block) => /BROADWAY|FDR|CENTRAL PARK|FRANKLIN/i.test(block.name)));
});

test('a rotated rectangular footprint gets one frontage frame', () => {
  const buildings = {
    features: [
      {
        type: 'Feature',
        id: 8,
        properties: { Status: 'Active', BaseHeight: 0, TopHeight: 30, BuildingNameEN: 'Diamond' },
        geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 10], [10, 20], [0, 10], [10, 0]]] }
      }
    ]
  };
  const { blocks } = buildHkBlocks({ buildings, toWorld, bounds: localBounds });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].rect, false);
  assert.equal(blocks[0].rects.length, 0);
  assert.equal(blocks[0].frames.length, 1);
  assert.equal(blocks[0].height, 30);
  const theta = blocks[0].frames[0][0];
  assert.ok(Math.abs(Math.abs(theta) - Math.PI / 4) < 0.05);
});

test('Statue Square sample extrudes LandsD heights and drops the null speck', () => {
  const frame = createFrame('hk');
  const buildings = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/hk/samples/statue-square-buildings.geojson'), 'utf8'));
  const { blocks, lowDetail, report } = buildHkBlocks({ buildings, osm: null, toWorld: frame.toWorld });
  assert.equal(blocks.length, 7);
  assert.equal(report.extruded, 7);
  assert.equal(report.nullHeight, 0);
  assert.equal(report.droppedSpecks, 2);
  assert.equal(report.osmGapBlocks, 0);
  assert.equal(lowDetail.length, 0);
  assert.ok(report.cutZ < -8000);
  const princes = blocks.find((block) => block.name === "Prince's Building");
  assert.ok(princes);
  assert.equal(princes.height, 80.4);
  assert.equal(princes.base, 3.7);
  assert.equal(princes.source, 'landsd');
  assert.equal(princes.kind, 'Tower');
  assert.ok(princes.poly.length >= 4);
  const hsbc = blocks.find((block) => block.name === 'HSBC Main Building');
  assert.equal(hsbc.height, 177.2);
  const boc = blocks.find((block) => block.name === 'Bank of China Building');
  assert.equal(boc.height, 73.7);
  const podium = blocks.find((block) => block.kind === 'Podium');
  assert.equal(podium.height, 15.9);
  assert.ok(blocks.every((block) => block.park === 0 && block.parkName === ''));
  assert.ok(!blocks.some((block) => /BROADWAY|FDR|CENTRAL PARK/i.test(`${block.name} ${block.kind}`)));
});

test('building input resolution prefers a full extract and keeps OSM optional', () => {
  const moduleDir = path.join(root, 'tools');
  const fallback = resolveHkBuildingInputs({
    env: {},
    moduleDir,
    exists: (file) => file.endsWith('statue-square-buildings.geojson')
  });
  assert.equal(fallback.usedSampleBuildings, true);
  assert.equal(fallback.osm, null);
  assert.match(fallback.buildings, /statue-square-buildings\.geojson$/);
  const full = resolveHkBuildingInputs({
    env: {},
    moduleDir,
    exists: (file) => file.endsWith(`${path.sep}landsd-buildings.geojson`) || file.endsWith(`${path.sep}osm_buildings.json`)
  });
  assert.equal(full.usedSampleBuildings, false);
  assert.match(full.osm, /osm_buildings\.json$/);
  assert.throws(
    () => resolveHkBuildingInputs({ env: { GEO_HK_BUILDINGS: '/missing/buildings.geojson' }, moduleDir, exists: () => false }),
    /GEO_HK_BUILDINGS not found/
  );
});

test('at-grade road pieces ignore tunnels', () => {
  const roads = atGradeRoadPieces([
    { level: '13', w: 8, name: 'NATHAN ROAD', x0: 0, z0: 0, x1: 1, z1: 0 },
    { level: 'elevated', w: 12, name: 'FLYOVER', x0: 0, z0: 1, x1: 1, z1: 1 },
    { level: 'ramp', w: 6, name: 'RAMP', x0: 0, z0: 2, x1: 1, z1: 2 }
  ]);
  assert.deepEqual(roads.map((road) => road.name), ['NATHAN ROAD']);
});

test('GEO_CITY=hk block CLI prints LandsD heights and the ridgeline cut', () => {
  // Pin the Statue Square fixture. A local full extract would otherwise become the CLI input.
  const result = spawnSync(process.execPath, [path.join(root, 'tools/geo-blocks.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GEO_CITY: 'hk',
      GEO_HK_BUILDINGS: path.join(root, 'tools/data/hk/samples/statue-square-buildings.geojson')
    },
    timeout: 20000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /HK blocks {2}n=7 {2}extruded=7/);
  assert.match(result.stdout, /Prince's Building {2}80\.4m/);
  assert.match(result.stdout, /HSBC Main Building {2}177\.2m/);
  assert.match(result.stdout, /carpet=0/);
  assert.doesNotMatch(result.stdout, /Broadway|FDR|Central Park/);
});
