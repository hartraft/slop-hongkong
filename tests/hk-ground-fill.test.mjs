import assert from 'node:assert/strict';
import test from 'node:test';
import { HK_CORE_WORLD, HONG_KONG_ISLAND_COASTLINE } from '../js/city-config.js';
import { GEO } from '../js/geo-source.js';
import {
  HK_CITY_FLOOR_Y,
  HK_CITY_LAWN_Y,
  clipRingToBox,
  isCityLawn,
  planHkGroundFill,
  pointInRing,
  ringArea
} from '../js/hk-ground-fill.js';

function orient(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function ringIsSimple(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let k = i + 1; k < n; k++) {
      if (k === i || (k + 1) % n === i || k === (i + 1) % n) continue;
      const c = ring[k];
      const d = ring[(k + 1) % n];
      const o1 = orient(a, b, c);
      const o2 = orient(a, b, d);
      const o3 = orient(c, d, a);
      const o4 = orient(c, d, b);
      if (o1 === 0 || o2 === 0 || o3 === 0 || o4 === 0) continue;
      if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return false;
    }
  }
  return true;
}

test('clip keeps the inside of a box and drops a ring that misses it', () => {
  const square = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 }
  ];
  const clipped = clipRingToBox(square, { minX: 2, maxX: 8, minZ: 3, maxZ: 7 });
  assert.equal(clipped.length, 4);
  assert.ok(pointInRing(5, 5, clipped));
  assert.equal(pointInRing(1, 5, clipped), false);
  assert.equal(pointInRing(5, 9, clipped), false);
  assert.ok(Math.abs(Math.abs(ringArea(clipped)) - 24) < 1e-6);
  assert.equal(clipRingToBox(square, { minX: 20, maxX: 30, minZ: 0, maxZ: 10 }), null);
  assert.equal(clipRingToBox([{ x: 0, z: 0 }], { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }), null);
});

test('promenades and Statue Square stay paved; gardens and large parks are lawns', () => {
  assert.equal(isCityLawn({ name: '皇后像廣場 Statue Square', cat: 'park', acres: 0.9 }), false);
  assert.equal(isCityLawn({ name: 'Central and Western District Promenade – Central Section', cat: 'park', acres: 9.4 }), false);
  assert.equal(isCityLawn({ name: '中環碼頭海濱長廊 Central Pier Waterfront', cat: 'park', acres: 3.5 }), false);
  assert.equal(isCityLawn({ name: '香港摩天輪 The Hong Kong Observation Wheel', cat: 'park', acres: 0.3 }), false);
  assert.equal(isCityLawn({ name: '遮打花園 Chater Garden', cat: 'garden', acres: 2.8 }), true);
  assert.equal(isCityLawn({ name: '香港公園 Hong Kong Park', cat: 'park', acres: 18.9 }), true);
  assert.equal(isCityLawn({ name: '添馬公園 Tamar Park', cat: 'park', acres: 4.1 }), true);
  assert.equal(isCityLawn({ name: 'AIA Vitality Park', cat: 'park', acres: 1.5 }), false);
  assert.equal(isCityLawn(null), false);
});

test('city floor sits under the asphalt deck and lawns sit under the asphalt top', () => {
  const asphaltTop = 0.02 + 0.055;
  assert.ok(HK_CITY_FLOOR_Y > 0 && HK_CITY_FLOOR_Y < 0.02);
  assert.ok(HK_CITY_LAWN_Y > HK_CITY_FLOOR_Y && HK_CITY_LAWN_Y < asphaltTop);
});

test('Central floor is island land inside the core and stops at the harbour', () => {
  const plan = planHkGroundFill({
    island: HONG_KONG_ISLAND_COASTLINE,
    parks: GEO.parks,
    core: HK_CORE_WORLD
  });
  assert.ok(plan.floor && plan.floor.length >= 4);
  assert.equal(ringIsSimple(plan.floor), true);
  const boxArea = (HK_CORE_WORLD.maxX - HK_CORE_WORLD.minX) * (HK_CORE_WORLD.maxZ - HK_CORE_WORLD.minZ);
  const area = Math.abs(ringArea(plan.floor));
  assert.ok(area > 1.2e6 && area < boxArea, `floor area ${area}`);

  assert.equal(pointInRing(0, 0, plan.floor), true);
  assert.equal(pointInRing(-1.4, 10, plan.floor), true);
  assert.equal(pointInRing(24, -62, plan.floor), true);
  assert.equal(pointInRing(2500, 0, plan.floor), false);
  assert.equal(pointInRing(0, -860, plan.floor), false);
  assert.equal(pointInRing(0, -788, HONG_KONG_ISLAND_COASTLINE), false);
  assert.equal(pointInRing(0, -788, plan.floor), false);
  assert.equal(pointInRing(HK_CORE_WORLD.maxX - 1, HK_CORE_WORLD.minZ + 1, plan.floor), false);

  for (const p of plan.floor) {
    assert.ok(p.x >= HK_CORE_WORLD.minX - 0.05 && p.x <= HK_CORE_WORLD.maxX + 0.05);
    assert.ok(p.z >= HK_CORE_WORLD.minZ - 0.05 && p.z <= HK_CORE_WORLD.maxZ + 0.05);
  }

  let mismatches = 0;
  for (let x = HK_CORE_WORLD.minX + 40; x < HK_CORE_WORLD.maxX; x += 80) {
    for (let z = HK_CORE_WORLD.minZ + 40; z < HK_CORE_WORLD.maxZ; z += 80) {
      const land = pointInRing(x, z, HONG_KONG_ISLAND_COASTLINE);
      if (land !== pointInRing(x, z, plan.floor)) mismatches += 1;
    }
  }
  assert.equal(mismatches, 0);

  const lawnHas = (x, z) => plan.lawns.some((lawn) => pointInRing(x, z, lawn.ring));
  assert.equal(lawnHas(172, 405), true);
  assert.equal(lawnHas(152, 39), true);
  assert.equal(lawnHas(5, -20), false);
  assert.equal(lawnHas(603, -239), false);
  assert.ok(plan.lawns.length >= 4 && plan.lawns.length < 40);
  for (const lawn of plan.lawns) {
    assert.equal(ringIsSimple(lawn.ring), true);
    const center = lawn.ring.reduce((s, p) => ({ x: s.x + p.x, z: s.z + p.z }), { x: 0, z: 0 });
    center.x /= lawn.ring.length;
    center.z /= lawn.ring.length;
    assert.equal(pointInRing(center.x, center.z, HONG_KONG_ISLAND_COASTLINE), true);
  }
});
