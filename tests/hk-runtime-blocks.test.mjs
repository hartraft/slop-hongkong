import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCKS, ROADS, districtAt, TELEPORT_LOCATIONS } from '../js/city-config.js';

test('every committed HK footprint keeps its LandsD height and a lot rect', () => {
  assert.equal(BLOCKS.length, 7);
  const hsbc = BLOCKS.find((b) => b.name === 'HSBC Main Building');
  const boc = BLOCKS.find((b) => b.name === 'Bank of China Building');
  const princes = BLOCKS.find((b) => b.name === "Prince's Building");
  const scb = BLOCKS.find((b) => b.height === 186.1);
  assert.equal(hsbc.height, 177.2);
  assert.equal(boc.height, 73.7);
  assert.equal(princes.height, 80.4);
  assert.equal(scb.frames, null);
  assert.equal(boc.frames, null);
  for (const b of BLOCKS) {
    assert.equal(b.rects.length, 1);
    assert.ok(b.height > 0);
    assert.equal(b.district, 'hk_cbd');
    assert.equal(b.median, false);
  }
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
  assert.ok(names.some((n) => n === 'CHATER ROAD'));
  assert.equal(names.some((n) => /5th Ave|Broadway|FDR|West Side/.test(n)), false);
});
