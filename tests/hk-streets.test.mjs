import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFrame } from '../tools/geo-frame.mjs';
import {
  buildHkStreetGraph,
  heuristicLanes,
  heuristicWidth,
  isDrivableOsmWay,
  isDrivableStreetType,
  resolveHkRoadInputs,
  roadClassCode,
  roadLevel,
  streetTypeClass,
  travelDir
} from '../tools/geo-hk-streets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const toWorld = (lon, lat) => [lon, lat];

function linkNamed(graph, name) {
  return graph.links.filter((link) => graph.names[link[2]] === name);
}

test('width falls back from measured width to lanes to street class', () => {
  assert.equal(heuristicWidth({ highway: 'primary', lanes: '2', osmWidth: '15' }), 15);
  assert.equal(heuristicWidth({ highway: 'primary', lanes: '3', osmWidth: '' }), 9.9);
  assert.equal(heuristicWidth({ highway: streetTypeClass('Main Road') }), 11);
  assert.equal(heuristicWidth({ highway: streetTypeClass('Highway') }), 14);
  assert.equal(heuristicWidth({ highway: streetTypeClass('Secondary Road') }), 8.5);
  assert.equal(heuristicWidth({ highway: streetTypeClass('Restricted Road') }), 4.5);
  assert.equal(heuristicWidth({ highway: 'primary_link' }), 6.5);
  assert.equal(heuristicWidth({ highway: null }), 7.5);
  assert.equal(heuristicLanes({ lanes: '4', width: 8 }), 4);
  assert.equal(heuristicLanes({ lanes: null, width: 11 }), 3);
});

test('direction, class, and what counts as a carriageway', () => {
  assert.equal(travelDir('yes'), 1);
  assert.equal(travelDir('-1'), -1);
  assert.equal(travelDir(undefined), 0);
  assert.equal(roadLevel('Tunnel', {}), 'tunnel');
  assert.equal(roadLevel('Main Road', { bridge: 'yes', highway: 'primary' }), 'elevated');
  assert.equal(roadLevel('Main Road', { highway: 'primary_link' }), 'ramp');
  assert.equal(roadLevel('Main Road', { highway: 'primary' }), '13');
  assert.equal(roadClassCode('Highway', 'motorway'), '2');
  assert.equal(roadClassCode('Tunnel', 'primary'), '3');
  assert.equal(roadClassCode('Main Road', 'primary'), '1');
  assert.equal(isDrivableStreetType('Track'), false);
  assert.equal(isDrivableStreetType('Main Road'), true);
  assert.equal(isDrivableOsmWay({ highway: 'primary' }), true);
  assert.equal(isDrivableOsmWay({ highway: 'footway' }), false);
  assert.equal(isDrivableOsmWay({ highway: 'service', service: 'driveway' }), false);
});

test('OSM tags class onto the centreline and only uncovered ways become links', () => {
  const roads = {
    features: [
      {
        type: 'Feature',
        id: 1,
        properties: { OBJECTID: 1, ENGLISHSTREETNAME: 'QUEENS ROAD', STREETTYPE: 'Main Road' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [100, 0], [200, 0]] }
      },
      {
        type: 'Feature',
        id: 2,
        properties: { OBJECTID: 2, ENGLISHSTREETNAME: 'PEAK TRAIL', STREETTYPE: 'Track' },
        geometry: { type: 'LineString', coordinates: [[0, 200], [80, 200]] }
      }
    ]
  };
  const osm = {
    elements: [
      {
        type: 'way',
        id: 1,
        tags: { highway: 'primary', name: 'Queens Road', lanes: '4', width: '15', oneway: 'yes' },
        geometry: [{ lon: 0, lat: 3 }, { lon: 200, lat: 3 }]
      },
      {
        type: 'way',
        id: 2,
        tags: { highway: 'secondary', name: 'Gap Road', lanes: '2' },
        geometry: [{ lon: 0, lat: 100 }, { lon: 80, lat: 100 }]
      },
      {
        type: 'way',
        id: 3,
        tags: { highway: 'footway', name: 'No Walk' },
        geometry: [{ lon: 0, lat: 400 }, { lon: 50, lat: 400 }]
      }
    ]
  };
  const { pieces, roadGraph, report } = buildHkStreetGraph({ roads, osm, toWorld });
  assert.equal(report.landsdFeatures, 1);
  assert.equal(report.skippedFeatures, 1);
  assert.equal(report.osmWays, 2);
  assert.equal(report.taggedFromOsm, 1);
  assert.equal(report.osmGapLinks, 1);
  assert.equal(roadGraph.links.length, 2);
  const queens = linkNamed(roadGraph, 'QUEENS ROAD');
  assert.equal(queens.length, 1);
  assert.equal(queens[0][3], 15);
  assert.equal(queens[0][4], 4);
  assert.equal(queens[0][5], 1);
  const gap = linkNamed(roadGraph, 'Gap Road');
  assert.equal(gap.length, 1);
  assert.equal(gap[0][3], 6.6);
  assert.equal(gap[0][4], 2);
  assert.equal(gap[0][5], 0);
  assert.equal(linkNamed(roadGraph, 'PEAK TRAIL').length, 0);
  assert.equal(linkNamed(roadGraph, 'No Walk').length, 0);
  assert.ok(pieces.some((piece) => piece.name === 'QUEENS ROAD' && piece.source === 'landsd' && piece.w === 15));
  assert.ok(pieces.some((piece) => piece.name === 'Gap Road' && piece.source === 'osm'));
});

test('a nearer service way does not outrank a primary way on the same centreline', () => {
  const roads = {
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 3, ENGLISHSTREETNAME: 'QUEENS ROAD', STREETTYPE: 'Main Road' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [120, 0]] }
      }
    ]
  };
  const osm = {
    elements: [
      { type: 'way', id: 1, tags: { highway: 'service', name: 'Queens Road service' }, geometry: [{ lon: 0, lat: 2 }, { lon: 120, lat: 2 }] },
      { type: 'way', id: 2, tags: { highway: 'primary', name: 'Queens Road', lanes: '4', width: '15', oneway: 'yes' }, geometry: [{ lon: 0, lat: 8 }, { lon: 120, lat: 8 }] }
    ]
  };
  const { roadGraph, report } = buildHkStreetGraph({ roads, osm, toWorld });
  assert.equal(report.osmGapLinks, 0);
  const link = linkNamed(roadGraph, 'QUEENS ROAD')[0];
  assert.equal(link[3], 15);
  assert.equal(link[4], 4);
  assert.equal(link[5], 1);
});

test('without OSM the centreline still builds and Main Road uses the class width', () => {
  const roads = {
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 7, ENGLISHSTREETNAME: 'NATHAN ROAD', STREETTYPE: 'Main Road' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [0, 40]] }
      }
    ]
  };
  const { roadGraph, report } = buildHkStreetGraph({ roads, osm: null, toWorld });
  assert.equal(report.osmWays, 0);
  assert.equal(report.osmGapLinks, 0);
  const link = linkNamed(roadGraph, 'NATHAN ROAD')[0];
  assert.equal(link[3], 11);
  assert.equal(link[5], 0);
  assert.ok(link[4] >= 1);
});

test('Statue Square sample joins LandsD names with the OSM fixture', () => {
  const frame = createFrame('hk');
  const roads = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/hk/samples/statue-square-roads.geojson'), 'utf8'));
  const osm = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/hk/samples/statue-square-highways.json'), 'utf8'));
  const { roadGraph, report } = buildHkStreetGraph({ roads, osm, toWorld: frame.toWorld });
  assert.equal(report.landsdFeatures, 4);
  assert.equal(report.taggedFromOsm, 4);
  assert.equal(report.osmGapLinks, 1);
  assert.equal(report.links, 5);
  const chater = linkNamed(roadGraph, 'CHATER ROAD')[0];
  assert.equal(chater[3], 15);
  assert.equal(chater[4], 4);
  assert.equal(chater[5], 1);
  for (const link of linkNamed(roadGraph, 'DES VOEUX ROAD CENTRAL')) {
    assert.equal(link[3], 9.9);
    assert.equal(link[4], 3);
    assert.equal(link[5], 0);
  }
  const bank = linkNamed(roadGraph, 'BANK STREET')[0];
  assert.equal(bank[3], 6.5);
  assert.equal(bank[5], -1);
  assert.equal(linkNamed(roadGraph, 'Ice House Street').length, 1);
  assert.equal(linkNamed(roadGraph, 'Pedestrian Promenade').length, 0);
  const origin = frame.toWorld(114.15979, 22.28088);
  assert.ok(Math.abs(origin[0]) < 1e-6 && Math.abs(origin[1]) < 1e-6);
});

test('road input resolution prefers a full extract and does not mix it with the sample highways', () => {
  const moduleDir = path.join(root, 'tools');
  const fallback = resolveHkRoadInputs({ env: {}, moduleDir, exists: (file) => file.endsWith('statue-square-roads.geojson') || file.endsWith('statue-square-highways.json') });
  assert.equal(fallback.usedSampleRoads, true);
  assert.match(fallback.roads, /statue-square-roads\.geojson$/);
  assert.match(fallback.osm, /statue-square-highways\.json$/);
  const full = resolveHkRoadInputs({
    env: {},
    moduleDir,
    exists: (file) => file.endsWith(`${path.sep}landsd-roads.geojson`)
  });
  assert.equal(full.usedSampleRoads, false);
  assert.equal(full.osm, null);
  assert.throws(() => resolveHkRoadInputs({ env: { GEO_HK_ROADS: '/missing/roads.geojson' }, moduleDir, exists: () => false }), /GEO_HK_ROADS not found/);
});

test('GEO_CITY=hk street CLI prints LandsD names, OSM width, and the gap', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'tools/geo-streets.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, GEO_CITY: 'hk' },
    timeout: 20000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /CHATER ROAD {2}15m {2}4L {2}FT/);
  assert.match(result.stdout, /DES VOEUX ROAD CENTRAL {2}9\.9m/);
  assert.match(result.stdout, /BANK STREET {2}6\.5m {2}2L {2}TF/);
  assert.match(result.stdout, /Ice House Street/);
  assert.doesNotMatch(result.stdout, /Pedestrian Promenade/);
  assert.match(result.stdout, /gaps=1/);
  assert.doesNotMatch(result.stdout, /numbered streets/);
});

test('default GEO_CITY keeps the Manhattan street inventory', { timeout: 60000 }, () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=4096', '-e', `
    import { pieces, STREETS, AVENUES, hkRoadGraph } from './tools/geo-streets.mjs';
    const s42 = STREETS.find((s) => s.n === 42);
    const a5 = AVENUES.find((a) => a.id === '5');
    if (pieces.length !== 28489) process.exit(2);
    if (STREETS.length !== 212) process.exit(3);
    if (AVENUES.length !== 23) process.exit(4);
    if (!s42 || s42.z !== 0.3) process.exit(5);
    if (!a5 || a5.x !== 0.4) process.exit(6);
    if (hkRoadGraph !== null) process.exit(7);
  `], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, GEO_CITY: '' },
    timeout: 60000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
