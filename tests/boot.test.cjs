const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const importMap = html.match(/<script type="importmap">([^]*?)<\/script>/);
const preloads = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"\s*\/>/g)];
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)];

test('city module preloads start after the import map and before stylesheets', () => {
  assert.ok(importMap);
  assert.ok(preloads.length > 0);
  const stylesheetIndex = html.indexOf('rel="stylesheet"');
  for (const preload of preloads) {
    assert.ok(importMap.index < preload.index);
    assert.ok(preload.index < stylesheetIndex);
  }
  assert.equal(entries.length, 1);
  assert.ok(importMap.index < entries[0].index);
  assert.ok(entries[0].index < stylesheetIndex, 'the module graph starts loading early too');
  assert.match(html, /<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/>/);
  const { imports } = JSON.parse(importMap[1]);
  assert.equal(imports.three, imports['three/webgpu'], 'Three.js aliases share one module instance');
});

test('Hong Kong boot builders do not call NYC borough, bridge, or landmark meshes', () => {
  const root = join(__dirname, '..');
  const read = (rel) => readFileSync(join(root, rel), 'utf8');
  const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
  const boroughsSrc = read('js/boroughs.js');
  const boroughs = between(boroughsSrc, 'function buildBoroughs', 'function buildNycBoroughs');
  assert.match(boroughs, /buildHkHarbourLand/);
  assert.doesNotMatch(boroughs, /buildStatueOfLiberty|buildBrooklynBridge|buildSuspensionBridge|Palisades/);
  assert.match(boroughsSrc, /if \(GEO\.frame\.city !== 'hk'\) paintLandUse\(\)/);
  assert.match(boroughsSrc, /if \(GEO\.frame\.city !== 'hk'\) paintZones\(\)/);
  const landmarks = between(read('js/landmarks.js'), 'function buildLandmarks', 'function buildNycLandmarks');
  assert.match(landmarks, /return buildHkLandmarks\(scene\)/);
  assert.doesNotMatch(landmarks, /buildNycLandmarks|ManhattanLandmarks|Chrysler|Times Square/);
  const blocks = between(read('js/buildings.js'), 'function buildCityBlocks', 'function buildNycCityBlocks');
  assert.match(blocks, /buildHkFootprintBlocks/);
  assert.doesNotMatch(blocks, /brownstone|waterTower|fireEscape/);
  const details = between(read('js/street-details.js'), 'function buildStreetDetails', 'function buildNycStreetDetails');
  assert.match(details, /return \{ group, footprints: \[\], signalClock/);
  assert.doesNotMatch(details, /Times Square|fromOldFrame/);
  const grid = between(read('js/city-grid.js'), 'function buildHkCityGrid', 'function buildNycCityGrid');
  assert.match(read('js/city-grid.js'), /function buildCityGrid\(scene\) \{\n  return buildHkCityGrid\(scene\);/);
  assert.match(grid, /buildHkRoadRibbons\(group, roadMat, sidewalkMat\)/);
  assert.match(grid, /HongKongCoastGround/);
  assert.match(grid, /VictoriaHarbourWater/);
  assert.doesNotMatch(grid, /HongKongIslandGround|buildWaterfrontPiers\(group\);|buildManhattanWaterfrontEdge\(/);
  const map = read('js/nyc-map.js');
  const layers = between(map, 'function mapLayers', 'const ROAD_LABELS');
  assert.match(layers, /GEO\.hongKongIsland/);
  assert.match(layers, /GEO\.kowloon/);
  assert.match(layers, /GEO\.harbour/);
  assert.match(layers, /L\.streets/);
  assert.match(layers, /L\.arterials/);
  assert.doesNotMatch(layers, /for \(const b of BLOCKS\)|L\.blocks|L\.highways/);
  assert.match(map, /Number\.isFinite\(GEO\.frame\.bearingDeg\)/);
  assert.doesNotMatch(layers, /STATEN_ISLAND|LIBERTY_ISLAND|EAST_RIVER_BRIDGES|UPPER_MANHATTAN|WESTCHESTER|NASSAU|Central Park/);
  assert.doesNotMatch(map, /29\.02/);
  const draw = between(map, 'drawWorld(ctx, v, isMinimap)', 'drawRoadLabels');
  assert.match(draw, /L\.harbour/);
  assert.match(draw, /L\.land/);
  assert.match(draw, /L\.streets/);
  assert.doesNotMatch(draw, /L\.blocks|MAP\.highway|footprintLayers/);
  assert.match(read('js/city-grid.js'), /const NYC_GRID_DECOR = false/);
  assert.match(read('js/tsl-materials.js'), /const REFLECT_NYC_SKYLINE = false/);
  const config = read('js/city-config.js');
  assert.doesNotMatch(config, /GEO\.manhattan|newJersey/);
  const geodataHead = read('js/hk-geodata.js').slice(0, 800);
  assert.match(geodataHead, /hongKongIsland/);
  assert.doesNotMatch(geodataHead, /GEO\.manhattan|newJersey/);
  const ridge = boroughsSrc.slice(boroughsSrc.indexOf('const RIDGE_TABLE'), boroughsSrc.indexOf('function ridgeJitter'));
  const guard = ridge.indexOf('if (!NJ_LAND)');
  const indexRead = ridge.indexOf('NJ_LAND.index');
  assert.ok(guard >= 0 && indexRead > guard, 'RIDGE_TABLE returns before reading NJ_LAND.index');
  const height = boroughsSrc.slice(boroughsSrc.indexOf('function ridgeHeightAt'), boroughsSrc.indexOf('function buildRidgeGeometry'));
  assert.match(height, /if \(!NJ_LAND\) return 0/);
});

test('native module entry and imports share canonical preloaded URLs on GitHub Pages', () => {
  const links = preloads.map((match) => match[1]);
  assert.equal(links.length, 31);
  assert.equal(new Set(links).size, links.length, 'each module is preloaded once');
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1], './js/main.js');
  assert.ok(links.includes(entries[0][1]));
  assert.equal(links[0], './js/hk-geodata.js');
  assert.equal(links.includes('./js/nyc-geodata.js'), false);
  assert.ok(links.indexOf('./js/geo-source.js') < links.indexOf('./js/city-config.js'), 'geo-source preloads before city-config');
  assert.ok(links.indexOf('./js/geo-source.js') > links.indexOf('./js/hk-geodata.js'));
  assert.equal([...html.matchAll(/<script\b/g)].length, 2, 'only the import map and native entry are needed');
  const base = 'https://example.test/slop-hongkong/';
  const urls = new Set(links.map((src) => new URL(src, base).href));
  for (const src of links) {
    assert.match(src, /^\.\/js\/[\w-]+\.js$/, 'preloads use the same unversioned paths as native imports');
    const source = readFileSync(join(__dirname, '..', src), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)) {
      const url = new URL(specifier, new URL(src, base));
      assert.ok(urls.has(url.href), `${src} imports an unpreloaded or mismatched URL: ${specifier}`);
    }
  }
});
