import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFrame } from '../tools/geo-frame.mjs';
import { HK_PLACES, buildHkHarbour, resolveHkExtraInputs } from '../tools/geo-hk-extra.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const frame = createFrame('hk');

function way(id, tags, ring) {
  const geometry = ring.map(([lon, lat]) => ({ lon, lat }));
  return { type: 'way', id, tags, geometry };
}

function square(south, west, north, east) {
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

test('a channel of coastline separates Island and Kowloon and keeps a pier', () => {
  const coast = {
    elements: [
      way(1, { natural: 'coastline' }, square(22.276, 114.155, 22.283, 114.165)),
      way(2, { natural: 'coastline' }, square(22.292, 114.165, 22.300, 114.176))
    ]
  };
  const piers = {
    elements: [
      way(3, { man_made: 'pier', name: 'Central Ferry Piers' }, square(22.2822, 114.1585, 22.2838, 114.1605))
    ]
  };
  const built = buildHkHarbour({
    coast,
    piers,
    toWorld: frame.toWorld,
    seed: { lon: 114.160, lat: 22.287 },
    res: 20
  });
  const [cx, cz] = built.places.central;
  const [tx, tz] = built.places.tst;
  assert.equal(built.report.centralInsideIsland, true);
  assert.equal(built.report.tstInsideKowloon, true);
  assert.ok(Math.abs(cx) < 1 && Math.abs(cz) < 1);
  assert.ok(tz < -800);
  const [hx, hz] = built.harbourRings[0].reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((v) => v / built.harbourRings[0].length);
  assert.ok(hz < cz - 50 && hz > tz + 50, `harbour centroid z ${hz} should sit between island ${cz} and Kowloon ${tz}`);
  assert.ok(built.report.harbourKm2 > 0.2);
  assert.ok(built.piers.some((pier) => pier.name === 'Central Ferry Piers'));
  assert.equal(built.harbourName, 'Victoria Harbour');
  assert.ok(hx > -2000 && hx < 4000);
});

test('harbour inputs prefer a full coast extract and fall back to the sample', () => {
  const moduleDir = path.join(root, 'tools');
  const sample = resolveHkExtraInputs({ env: {}, moduleDir, exists: (file) => file.endsWith('harbour-coast.json') || file.endsWith('harbour-piers.json') });
  assert.equal(sample.usedSampleCoast, true);
  assert.match(sample.coast, /harbour-coast\.json$/);
  const full = resolveHkExtraInputs({
    env: {},
    moduleDir,
    exists: (file) => file.endsWith(`${path.sep}osm_coast.json`) || file.endsWith(`${path.sep}osm_piers.json`)
  });
  assert.equal(full.usedSampleCoast, false);
  assert.match(full.coast, /osm_coast\.json$/);
  assert.equal(HK_PLACES.central.lat, 22.28088);
  assert.equal(fs.existsSync(path.join(root, 'tools/data/q_hk_coast.overpassql')), true);
});
