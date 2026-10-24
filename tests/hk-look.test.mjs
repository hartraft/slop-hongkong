import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BLOCKS,
  HK_CORE_WORLD,
  blockInHkCore,
  hkCentralSignSites,
  HK_RETAIL_BELT,
  hkFootprintHeight,
  hkMassingPlan,
  hkRetailSlices,
  hkScaleRing
} from '../js/city-config.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('podium and tower keep the LandsD height and only appear on wide plates', () => {
  assert.equal(hkMassingPlan({ id: 1, height: null, minX: 0, maxX: 40, minZ: 0, maxZ: 40 }), null);
  assert.equal(hkMassingPlan({ id: 1, height: 0, minX: 0, maxX: 40, minZ: 0, maxZ: 40 }), null);

  const low = hkMassingPlan({ id: 2, height: 18, minX: 0, maxX: 40, minZ: 0, maxZ: 36 });
  assert.equal(low.parts.length, 1);
  assert.equal(low.parts[0].role, 'shaft');
  assert.equal(low.parts[0].style, 'podium');
  assert.equal(low.parts[0].h, 18);

  const slim = hkMassingPlan({ id: 8, height: 120, minX: 0, maxX: 14, minZ: 0, maxZ: 40 });
  assert.equal(slim.parts.length, 1);
  assert.equal(slim.parts[0].style, 'tower2');
  assert.equal(slim.parts[0].scale, 1);

  const wide = hkMassingPlan({ id: 4, height: 120, minX: 0, maxX: 70, minZ: 0, maxZ: 60 });
  assert.equal(wide.parts.length, 2);
  assert.equal(wide.parts[0].role, 'podium');
  assert.equal(wide.parts[0].style, 'podium');
  assert.equal(wide.parts[0].scale, 1);
  assert.equal(wide.parts[1].role, 'tower');
  assert.equal(wide.parts[1].style, 'tower1');
  assert.ok(wide.parts[1].scale < 1 && wide.parts[1].scale >= 0.7);
  assert.equal(wide.parts[1].y0, wide.parts[0].h);
  assert.ok(Math.abs(wide.parts[0].h + wide.parts[1].h - 120) < 1e-6);
});

test('the street base is an opaque retail belt and glass starts above it', () => {
  const low = hkRetailSlices(0, 6, 'podium');
  assert.equal(low.length, 1);
  assert.equal(low[0].style, 'retail');
  const tall = hkRetailSlices(0, 40, 'tower0');
  assert.equal(tall.length, 2);
  assert.equal(tall[0].style, 'retail');
  assert.equal(tall[1].style, 'tower0');
  assert.ok(Math.abs(tall[0].h - (HK_RETAIL_BELT - 0.22)) < 1e-9);
  assert.ok(Math.abs(tall[0].h + tall[1].h - 40) < 1e-9);
  assert.ok(tall[1].y0 >= HK_RETAIL_BELT - 0.22 - 1e-9);
  const above = hkRetailSlices(tall[1].y0, tall[1].h, 'tower1');
  assert.equal(above.length, 1);
  assert.equal(above[0].style, 'tower1');
});

test('Central names use podium-tower glass plans and null height stays unbuilt', () => {
  const hsbc = BLOCKS.find((block) => block.name === 'HSBC Main Building');
  const princes = BLOCKS.find((block) => block.name === "Prince's Building");
  const slim = BLOCKS.find((block) => block.name === 'Bel Mount Garden');
  const annex = BLOCKS.find((block) => block.name === 'BANK OF CHINA TOWER' && block.height == null);
  for (const block of [hsbc, princes, slim, annex]) assert.equal(blockInHkCore(block), true);

  const hsbcPlan = hkMassingPlan(hsbc);
  const princesPlan = hkMassingPlan(princes);
  assert.equal(hsbcPlan.parts.length, 2);
  assert.equal(princesPlan.parts.length, 2);
  assert.ok(Math.abs(hsbcPlan.parts[0].h + hsbcPlan.parts[1].h - 177.2) < 1e-6);
  const hsbcTower = hkScaleRing(hsbc.poly, hsbcPlan.parts[1].scale);
  assert.equal(hsbcTower.length, hsbc.poly.length);
  for (const p of hsbcTower) {
    assert.ok(p.x >= hsbc.minX - 0.05 && p.x <= hsbc.maxX + 0.05);
    assert.ok(p.z >= hsbc.minZ - 0.05 && p.z <= hsbc.maxZ + 0.05);
  }
  assert.ok(Math.abs(princesPlan.height - hkFootprintHeight(princes)) < 1e-6);

  const slimPlan = hkMassingPlan(slim);
  assert.equal(slimPlan.parts.length, 1);
  assert.equal(slimPlan.parts[0].scale, 1);
  assert.equal(hkMassingPlan(annex), null);

  let podiumTowers = 0;
  let built = 0;
  for (const block of BLOCKS) {
    if (block.park > 0.6 || block.median || !blockInHkCore(block)) continue;
    const plan = hkMassingPlan(block);
    if (!plan) {
      assert.equal(hkFootprintHeight(block), null);
      continue;
    }
    built++;
    assert.equal(plan.height, block.height);
    let top = 0;
    for (const part of plan.parts) {
      assert.ok(part.h > 0);
      assert.ok(part.y0 + part.h <= plan.height + 1e-6);
      top = Math.max(top, part.y0 + part.h);
      assert.match(part.style, /^podium$|^tower[012]$/);
    }
    assert.ok(Math.abs(top - plan.height) < 1e-6);
    if (plan.parts.length === 2) podiumTowers++;
  }
  assert.equal(built, 1943);
  assert.ok(podiumTowers >= 120 && podiumTowers < 500, `podium+tower ${podiumTowers}`);
});

test('Central street plates stay inside the box and use Traditional Chinese', () => {
  const sites = hkCentralSignSites();
  assert.ok(sites.length > 40 && sites.length < 400, `plates ${sites.length}`);
  const texts = new Set(sites.map((site) => site.text));
  assert.ok(texts.has('德輔道中'));
  assert.ok(texts.has('皇后大道中'));
  assert.ok(texts.has('干諾道中'));
  assert.equal(sites.some((site) => /Times Square|5TH AVE|Midtown|Broadway|42 ST|[A-Za-z]/i.test(`${site.text} ${site.sub || ''}`)), false);
  for (const site of sites) {
    assert.equal(site.kind, 'plate');
    assert.ok(site.x >= HK_CORE_WORLD.minX && site.x <= HK_CORE_WORLD.maxX);
    assert.ok(site.z >= HK_CORE_WORLD.minZ && site.z <= HK_CORE_WORLD.maxZ);
    assert.ok(site.y > 2 && site.y < 80);
  }
});

test('the boot path extrudes curtain-wall glass and Central street signs', () => {
  const buildings = readFileSync(path.join(root, 'js/buildings.js'), 'utf8');
  const body = buildings.slice(buildings.indexOf('function ringForExtrude'), buildings.indexOf('function buildCityBlocks'));
  assert.match(body, /ExtrudeGeometry/);
  assert.match(body, /blockInHkCore/);
  assert.match(body, /hkFootprintHeight/);
  assert.match(body, /hkMassingPlan/);
  assert.match(body, /HK_NULL_HEIGHT/);
  assert.match(body, /createCurtainWallMaterial/);
  assert.match(body, /createRetailPodiumMaterial/);
  assert.match(body, /createPodiumMasonryMaterial/);
  assert.match(body, /hkRetailSlices/);
  assert.match(body, /HkRetailPodium/);
  assert.match(body, /HkPodiumMasonry/);
  assert.doesNotMatch(body, /hkPodiumGlass/);
  assert.doesNotMatch(body, /BoxGeometry|InstancedMesh|: 12\b|populateBlock/);
  const boot = buildings.slice(buildings.indexOf('function buildCityBlocks'));
  assert.match(boot, /return buildHkFootprintBlocks\(scene, gltfPlan\)/);
  assert.doesNotMatch(boot, /populateBlock/);

  const streets = readFileSync(path.join(root, 'js/street-details.js'), 'utf8');
  const live = streets.slice(streets.indexOf('function buildStreetDetails'));
  assert.match(live, /hkCentralSignSites/);
  assert.match(live, /planHkCanyonNeon/);
  assert.match(live, /HongKongStreetDetails/);
  const main = readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.match(main, /buildStreetDetails\(scene, gltfPlan\)/);
  assert.match(main, /buildCityBlocks\(scene, gltfPlan\)/);

  const materials = readFileSync(path.join(root, 'js/tsl-materials.js'), 'utf8');
  const curtain = materials.slice(
    materials.indexOf('function createCurtainWallMaterial'),
    materials.indexOf('const _carPaintCache')
  );
  assert.match(curtain, /HK_RETAIL_BELT/);
  assert.match(curtain, /podiumStreetColor\(\)/);
  assert.match(curtain, /if \(boxLocal\) return curtainCol/);
  assert.match(curtain, /if \(boxLocal\) return glassEmit/);
  const cell = materials.slice(materials.indexOf('function facadeCell('), materials.indexOf('let bayWidth', materials.indexOf('function facadeCell(')));
  assert.doesNotMatch(cell, /HK_RETAIL_BELT/);
});
