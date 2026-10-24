import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFrame } from '../tools/geo-frame.mjs';
import {
  BLOCKS,
  HK_CORE_BBOX,
  HK_CORE_WORLD,
  HK_NULL_HEIGHT,
  blockInHkCore,
  hkFootprintHeight
} from '../js/city-config.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('Central core box is the WGS84 window and matches the geodata frame', () => {
  assert.deepEqual(
    [HK_CORE_BBOX.south, HK_CORE_BBOX.west, HK_CORE_BBOX.north, HK_CORE_BBOX.east],
    [22.276, 114.150, 22.288, 114.170]
  );
  const frame = createFrame('hk');
  const corners = [
    [HK_CORE_BBOX.west, HK_CORE_BBOX.south],
    [HK_CORE_BBOX.east, HK_CORE_BBOX.south],
    [HK_CORE_BBOX.west, HK_CORE_BBOX.north],
    [HK_CORE_BBOX.east, HK_CORE_BBOX.north]
  ].map(([lon, lat]) => frame.toWorld(lon, lat));
  const minX = Math.min(...corners.map((p) => p[0]));
  const maxX = Math.max(...corners.map((p) => p[0]));
  const minZ = Math.min(...corners.map((p) => p[1]));
  const maxZ = Math.max(...corners.map((p) => p[1]));
  assert.ok(Math.abs(HK_CORE_WORLD.minX - minX) < 1e-6);
  assert.ok(Math.abs(HK_CORE_WORLD.maxX - maxX) < 1e-6);
  assert.ok(Math.abs(HK_CORE_WORLD.minZ - minZ) < 1e-6);
  assert.ok(Math.abs(HK_CORE_WORLD.maxZ - maxZ) < 1e-6);
  assert.equal(blockInHkCore({ cx: 0, cz: 0 }), true);
  assert.equal(blockInHkCore({ cx: 988.3, cz: -1447.3 }), false);
});

test('in-box footprints keep LandsD height and null height is skipped', () => {
  assert.equal(HK_NULL_HEIGHT, 'skip');
  let inside = 0;
  let outside = 0;
  let built = 0;
  let skippedNull = 0;
  for (const block of BLOCKS) {
    if (block.park > 0.6 || block.median) continue;
    if (!blockInHkCore(block)) {
      outside++;
      continue;
    }
    inside++;
    const height = hkFootprintHeight(block);
    if (height == null) skippedNull++;
    else {
      built++;
      assert.equal(height, block.height);
      assert.ok(height > 0);
    }
  }
  assert.equal(inside, 2021);
  assert.equal(built, 1943);
  assert.equal(skippedNull, 78);
  assert.equal(outside, 51092);
  assert.equal(inside + outside, 53113);

  const hsbc = BLOCKS.find((block) => block.name === 'HSBC Main Building');
  const princes = BLOCKS.find((block) => block.name === "Prince's Building");
  const boc = BLOCKS.find((block) => block.name === 'Bank of China Building');
  const scb = BLOCKS.find((block) => block.name === 'Standard Chartered Bank Building' && block.height === 186.1);
  const tower = BLOCKS.find((block) => block.name === 'Bank of China Tower' && block.height === 303.3);
  const nullAnnex = BLOCKS.find((block) => block.name === 'BANK OF CHINA TOWER' && block.height == null);
  for (const block of [hsbc, princes, boc, scb, tower, nullAnnex]) assert.equal(blockInHkCore(block), true);
  assert.equal(hkFootprintHeight(hsbc), 177.2);
  assert.equal(hkFootprintHeight(princes), 80.4);
  assert.equal(hkFootprintHeight(boc), 73.7);
  assert.equal(hkFootprintHeight(scb), 186.1);
  assert.equal(hkFootprintHeight(tower), 303.3);
  assert.equal(hkFootprintHeight(nullAnnex), null);
  assert.ok(hsbc.poly.length >= 4);
  assert.ok(princes.poly.length >= 4);
});

test('the boot builder extrudes Central rings and does not invent a stand-in height', () => {
  const src = readFileSync(path.join(root, 'js/buildings.js'), 'utf8');
  const body = src.slice(src.indexOf('function ringForExtrude'), src.indexOf('function buildCityBlocks'));
  assert.match(body, /ExtrudeGeometry/);
  assert.match(body, /blockInHkCore/);
  assert.match(body, /hkFootprintHeight/);
  assert.match(body, /HK_NULL_HEIGHT/);
  assert.doesNotMatch(body, /BoxGeometry|InstancedMesh|: 12\b/);
  const boot = src.slice(src.indexOf('function buildCityBlocks'), src.indexOf('function buildNycCityBlocks'));
  assert.match(boot, /return buildHkFootprintBlocks\(scene\)/);
  assert.doesNotMatch(boot, /brownstone|waterTower|fireEscape|populateBlock/);
});
