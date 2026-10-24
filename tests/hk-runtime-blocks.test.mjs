import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCKS, ROADS, districtAt, TELEPORT_LOCATIONS, ISLAND_BOUNDS, PLAY_BOUNDS, NJ_SHORELINE_POLYGON, HONG_KONG_ISLAND_COASTLINE, KOWLOON_COASTLINE, getIslandBoundsAtZ } from '../js/city-config.js';
import { GEO } from '../js/hk-geodata.js';

test('every committed HK footprint keeps its LandsD height and a lot rect', () => {
  assert.ok(BLOCKS.length > 10000, `blocks ${BLOCKS.length}`);
  const hsbc = BLOCKS.find((b) => b.name === 'HSBC Main Building');
  const boc = BLOCKS.find((b) => b.name === 'Bank of China Building');
  const princes = BLOCKS.find((b) => b.name === "Prince's Building");
  const scb = BLOCKS.find((b) => b.name === 'Standard Chartered Bank Building' && b.height === 186.1);
  assert.equal(hsbc.height, 177.2);
  assert.equal(hsbc.district, 'hk_cbd');
  assert.equal(boc.height, 73.7);
  assert.equal(princes.height, 80.4);
  assert.equal(scb.frames, null);
  assert.equal(boc.frames, null);
  assert.equal(boc.rects.length, 1);
  assert.equal(scb.rects.length, 1);
  assert.equal(hsbc.median, false);
  let missingRect = 0;
  let missingHeight = 0;
  for (const b of BLOCKS) {
    if (!b.rects.length) missingRect++;
    if (!(b.height > 0)) missingHeight++;
    assert.notEqual(b.district, 'midtown');
    assert.notEqual(b.district, 'harlem');
    assert.notEqual(b.district, 'fidi');
  }
  assert.equal(missingRect, 0);
  assert.ok(BLOCKS.length - missingHeight > 40000);
});

test('districts and spawn stay on the Hong Kong coast, not numbered Manhattan streets', () => {
  assert.deepEqual([TELEPORT_LOCATIONS.central.x, TELEPORT_LOCATIONS.central.z], [0, 0]);
  assert.equal(districtAt(0, 0), 'hk_cbd');
  assert.equal(districtAt(988.3, -1447.3), 'hk_kowloon');
  assert.equal(districtAt(6488, 8930), 'hk_island');
  assert.notEqual(districtAt(0, 0), 'midtown');
  assert.notEqual(districtAt(0, -5000), 'harlem');
});

test('shore bounds cover Island, Kowloon, and Victoria Harbour', () => {
  assert.equal(GEO.manhattan, undefined);
  assert.equal(GEO.boroughs.newJersey, undefined);
  assert.ok(HONG_KONG_ISLAND_COASTLINE.length > 100);
  assert.ok(KOWLOON_COASTLINE.length > 100);
  assert.equal(NJ_SHORELINE_POLYGON.length, 0);
  assert.equal(PLAY_BOUNDS, ISLAND_BOUNDS);
  const inside = (x, z) => x >= ISLAND_BOUNDS.minX && x <= ISLAND_BOUNDS.maxX && z >= ISLAND_BOUNDS.minZ && z <= ISLAND_BOUNDS.maxZ;
  assert.equal(inside(0, 0), true);
  assert.equal(inside(GEO.points.tst[0], GEO.points.tst[1]), true);
  assert.equal(inside(GEO.points.admiralty[0], GEO.points.admiralty[1]), true);
  const harbour = GEO.harbour.rings[0];
  assert.equal(inside(harbour[0], harbour[1]), true);
  const west = GEO.harbour.rings[1];
  assert.equal(inside(west[0], west[1]), true);
  assert.ok(ISLAND_BOUNDS.minX < -5000);
  assert.ok(ISLAND_BOUNDS.minZ < -8000);
  assert.ok(ISLAND_BOUNDS.maxX > 9000);
  const shore = getIslandBoundsAtZ(GEO.points.tst[1], GEO.points.tst[0]);
  assert.ok(shore.westX < GEO.points.tst[0] && shore.eastX > GEO.points.tst[0]);
});

test('visible roads are the committed centreline, including Des Voeux and Chater', () => {
  const names = ROADS.map((r) => r.raw);
  assert.ok(names.some((n) => n === 'DES VOEUX ROAD CENTRAL'));
  assert.ok(names.some((n) => n === 'CONNAUGHT ROAD CENTRAL'));
  assert.ok(names.some((n) => n === 'CHATER ROAD'));
  assert.ok(names.some((n) => n === 'NATHAN ROAD'));
  assert.equal(names.some((n) => n === '5 AVE' || n === 'FDR DRIVE' || n === 'WEST SIDE HWY'), false);
});
