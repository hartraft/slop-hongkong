import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCKS, ROADS, districtAt, TELEPORT_LOCATIONS } from '../js/city-config.js';

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

test('visible roads are the committed centreline, including Des Voeux and Chater', () => {
  const names = ROADS.map((r) => r.raw);
  assert.ok(names.some((n) => n === 'DES VOEUX ROAD CENTRAL'));
  assert.ok(names.some((n) => n === 'CONNAUGHT ROAD CENTRAL'));
  assert.ok(names.some((n) => n === 'CHATER ROAD'));
  assert.ok(names.some((n) => n === 'NATHAN ROAD'));
  assert.equal(names.some((n) => n === '5 AVE' || n === 'FDR DRIVE' || n === 'WEST SIDE HWY'), false);
});
