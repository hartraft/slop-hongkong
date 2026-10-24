import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  HK_ISLAND_KOWLOON_BBOX,
  HK_LAT0,
  HK_LON0,
  HK_SAMPLE_BBOX,
  LANDSD,
  NYC_LAT0,
  NYC_LON0,
  NYC_THETA_DEG,
  createFrame,
  resolveCity
} from '../tools/geo-frame.mjs';
import {
  clampPageSize,
  collectTiles,
  featureKey,
  featureQueryUrl,
  mergeFeatures,
  pageShouldContinue,
  parseArgs,
  parseBbox,
  readJson,
  spanCount,
  splitBbox,
  tileBbox
} from '../tools/fetch-landsd.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const BBOX = '22.185,114.100,22.360,114.260';

test('GEO_CITY defaults to New York and accepts Hong Kong aliases', () => {
  assert.equal(resolveCity(undefined), 'nyc');
  assert.equal(resolveCity(''), 'nyc');
  assert.equal(resolveCity('new-york'), 'nyc');
  assert.equal(resolveCity('HK'), 'hk');
  assert.equal(resolveCity('hongkong'), 'hk');
  assert.throws(() => resolveCity('paris'), /Unknown GEO_CITY/);
});

test('Hong Kong frame is Statue Square, true north, and metres', () => {
  const frame = createFrame('hk');
  assert.equal(frame.LAT0, HK_LAT0);
  assert.equal(frame.LON0, HK_LON0);
  assert.equal(frame.LAT0, 22.28088);
  assert.equal(frame.LON0, 114.15979);
  assert.equal(frame.thetaRad, 0);
  const [ox, oz] = frame.toWorld(HK_LON0, HK_LAT0);
  assert.ok(Math.abs(ox) < 1e-6 && Math.abs(oz) < 1e-6);
  const [ex, ez] = frame.toWorld(HK_LON0 + 0.001, HK_LAT0);
  const [nx, nz] = frame.toWorld(HK_LON0, HK_LAT0 + 0.001);
  assert.ok(ex > 90 && ex < 120 && Math.abs(ez) < 1e-6);
  assert.ok(nz < -100 && nz > -120 && Math.abs(nx) < 1e-6);
});

test('New York frame keeps the 5th Ave & 42nd St seed bearing', () => {
  const frame = createFrame('nyc');
  assert.equal(frame.LAT0, NYC_LAT0);
  assert.equal(frame.LON0, NYC_LON0);
  assert.equal(frame.thetaRad, (NYC_THETA_DEG * Math.PI) / 180);
  const A = 6378137.0;
  const E2 = 6.69437999014e-3;
  const phi0 = (NYC_LAT0 * Math.PI) / 180;
  const sin0 = Math.sin(phi0);
  const nrad = A / Math.sqrt(1 - E2 * sin0 * sin0);
  const kx = (Math.PI / 180) * nrad * Math.cos(phi0);
  assert.equal(frame.KX, kx);
});

test('Island + Kowloon bbox and LandsD service ids', () => {
  assert.deepEqual(HK_ISLAND_KOWLOON_BBOX, { south: 22.185, west: 114.100, north: 22.360, east: 114.260 });
  assert.equal(LANDSD.buildings.id, 'landsd_rcd_1637211194312_35158');
  assert.equal(LANDSD.roads.id, 'landsd_rcd_1637310758814_80061');
  assert.equal(LANDSD.buildings.where, "Status='Active'");
  assert.match(LANDSD.attribution, /Lands Department via CSDI Portal \/ DATA\.GOV\.HK/);
});

test('FeatureServer pages are capped, tiled, and deduped', () => {
  assert.equal(clampPageSize(0, 3000), 3000);
  assert.equal(clampPageSize(10000, 3000), 3000);
  assert.equal(clampPageSize(50000, 20000), 10000);
  assert.equal(spanCount(HK_ISLAND_KOWLOON_BBOX.east - HK_ISLAND_KOWLOON_BBOX.west, 0.04), 4);
  assert.equal(spanCount(HK_ISLAND_KOWLOON_BBOX.north - HK_ISLAND_KOWLOON_BBOX.south, 0.04), 5);
  assert.equal(tileBbox(HK_ISLAND_KOWLOON_BBOX, 0.04).length, 20);
  assert.equal(tileBbox({ south: 22.2802, west: 114.1591, north: 22.2816, east: 114.1605 }, 0.04).length, 1);
  assert.equal(pageShouldContinue({ received: 3000, pageSize: 3000, exceeded: true }), true);
  assert.equal(pageShouldContinue({ received: 4, pageSize: 3000, exceeded: undefined }), false);
  assert.equal(pageShouldContinue({ received: 3000, pageSize: 3000, exceeded: false }), false);
  const merged = mergeFeatures([
    { id: 1, properties: { OBJECTID: 1 } },
    { id: 1, properties: { OBJECTID: 1 } },
    { properties: { OBJECTID: 2 } },
    { properties: { name: 'anon' } }
  ]);
  assert.deepEqual(merged.map(featureKey), ['id:1', 'oid:2', null]);
  assert.equal(splitBbox(HK_ISLAND_KOWLOON_BBOX).length, 4);
  const url = featureQueryUrl('https://portal.csdi.gov.hk/server/rest/services/common/landsd_rcd_1637211194312_35158/FeatureServer/0', {
    where: "Status='Active'",
    bbox: HK_ISLAND_KOWLOON_BBOX,
    pageSize: 3000,
    offset: 3000
  });
  assert.equal(url.searchParams.get('f'), 'geojson');
  assert.equal(url.searchParams.get('resultOffset'), '3000');
  assert.equal(url.searchParams.get('resultRecordCount'), '3000');
  assert.equal(url.searchParams.get('orderByFields'), 'OBJECTID ASC');
  assert.equal(url.searchParams.get('outSR'), '4326');
  assert.match(url.searchParams.get('where'), /Status='Active'/);
});

test('a dense tile is split instead of walking a deep resultOffset', async () => {
  const calls = [];
  const fetchPage = async (bounds, offset, pageSize) => {
    calls.push({ width: bounds.east - bounds.west, offset, pageSize });
    if (bounds.east - bounds.west > 0.05) {
      return { features: [{ id: `wide-${offset}` }, { id: `wide-${offset}-b` }], exceeded: true };
    }
    return { features: [{ id: `${bounds.south},${bounds.west}` }], exceeded: false };
  };
  const features = await collectTiles(
    { south: 0, west: 0, north: 0.1, east: 0.1 },
    fetchPage,
    { pageSize: 2, tileStep: 1, maxOffset: 2, maxDepth: 4 }
  );
  assert.equal(features.length, 4);
  assert.ok(calls.some((call) => call.width > 0.05));
  assert.ok(calls.every((call) => call.offset === 0));
});

test('FeatureServer reads retry a failed response', async () => {
  let n = 0;
  const payload = await readJson(async () => {
    n += 1;
    if (n === 1) return { ok: false, status: 503, text: async () => 'busy' };
    return { ok: true, status: 200, text: async () => '{"features":[]}' };
  }, 'https://example.test/query', { tries: 3, sleep: async () => {} });
  assert.deepEqual(payload, { features: [] });
  assert.equal(n, 2);
});

test('Hong Kong Overpass queries use the Island + Kowloon bbox and the NYC queries stay', () => {
  for (const name of ['q_hk_coast.overpassql', 'q_hk_parks.overpassql', 'q_hk_landmarks.overpassql', 'q_hk_piers.overpassql', 'q_hk_highways.overpassql']) {
    const text = fs.readFileSync(path.join(root, 'tools/data', name), 'utf8');
    assert.match(text, new RegExp(BBOX.replace(/[.]/g, '\\.')));
    assert.doesNotMatch(text, /40\.7/);
  }
  const coast = fs.readFileSync(path.join(root, 'tools/data/q_coast.overpassql'), 'utf8');
  assert.match(coast, /40\.54,-74\.20,40\.98,-73\.90/);
  assert.match(fs.readFileSync(path.join(root, 'tools/data/q_hk_coast.overpassql'), 'utf8'), /natural"="coastline"/);
  assert.match(fs.readFileSync(path.join(root, 'tools/data/q_hk_coast.overpassql'), 'utf8'), /natural"="water"/);
  assert.match(fs.readFileSync(path.join(root, 'tools/data/q_hk_parks.overpassql'), 'utf8'), /leisure"="park"/);
  assert.match(fs.readFileSync(path.join(root, 'tools/data/q_hk_highways.overpassql'), 'utf8'), /highway/);
});

test('pipeline dedupe text matches featureKey', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/HK_GEO_PIPELINE.md'), 'utf8');
  assert.match(doc, /featureKey/);
  assert.match(doc, /feature\.id/);
  assert.match(doc, /properties\.OBJECTID/);
  assert.doesNotMatch(doc, /deduped on `OBJECTID`/);
});

test('fetch arguments accept a sample run and an explicit bbox', () => {
  const sample = parseArgs(['--sample', '--layer', 'buildings']);
  assert.equal(sample.sample, true);
  assert.equal(sample.layer, 'buildings');
  assert.equal(sample.delayMs, 0);
  assert.deepEqual(parseBbox(BBOX), HK_ISLAND_KOWLOON_BBOX);
});

test('Statue Square sample is a LandsD excerpt with heights and a centreline', () => {
  const buildings = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/hk/samples/statue-square-buildings.geojson'), 'utf8'));
  const roads = JSON.parse(fs.readFileSync(path.join(root, 'tools/data/hk/samples/statue-square-roads.geojson'), 'utf8'));
  assert.equal(buildings.type, 'FeatureCollection');
  assert.equal(buildings.attribution, LANDSD.attribution);
  assert.equal(buildings.query.serviceId, LANDSD.buildings.id);
  assert.equal(buildings.query.where, "Status='Active'");
  assert.equal(roads.query.serviceId, LANDSD.roads.id);
  assert.deepEqual(buildings.bbox, [HK_SAMPLE_BBOX.west, HK_SAMPLE_BBOX.south, HK_SAMPLE_BBOX.east, HK_SAMPLE_BBOX.north]);
  const princes = buildings.features.find((feature) => feature.properties.BuildingNameEN === "Prince's Building");
  assert.ok(princes);
  assert.equal(princes.geometry.type, 'Polygon');
  assert.equal(princes.properties.Status, 'Active');
  assert.equal(typeof princes.properties.BaseHeight, 'number');
  assert.ok(princes.properties.TopHeight > princes.properties.BaseHeight);
  assert.ok(buildings.features.every((feature) => feature.properties.Status === 'Active'));
  assert.ok(roads.features.some((feature) => feature.properties.ENGLISHSTREETNAME === 'CHATER ROAD' && feature.geometry.type === 'LineString'));
});

test('GEO_CITY=hk loads the frame without CSCL or DCP', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-frame-'));
  const script = path.join(empty, 'check.mjs');
  fs.writeFileSync(script, `
    import { geo, toWorld, cscl } from ${JSON.stringify(pathToFileURL(path.join(root, 'tools/geo-base.mjs')).href)};
    if (geo.city !== 'hk' || geo.THETA !== 0 || cscl.length !== 0) process.exit(2);
    const [x, z] = toWorld(114.15979, 22.28088);
    if (Math.abs(x) > 1e-6 || Math.abs(z) > 1e-6) process.exit(3);
    const east = toWorld(114.16079, 22.28088);
    const north = toWorld(114.15979, 22.28188);
    if (!(east[0] > 50) || Math.abs(east[1]) > 1) process.exit(4);
    if (!(north[1] < -50) || Math.abs(north[0]) > 1) process.exit(5);
    if (geo.bbox.south !== 22.185) process.exit(6);
  `);
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, GEO_CITY: 'hk', GEO_DATA: empty },
    timeout: 20000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('GEO_CITY=hk writes harbour geodata into the requested file', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-build-'));
  const out = path.join(empty, 'hk-geodata.js');
  const removed = path.join(root, 'js', ['nyc', 'geodata.js'].join('-'));
  const result = spawnSync(process.execPath, [path.join(root, 'tools/build-geodata.mjs'), out], {
    encoding: 'utf8',
    env: { ...process.env, GEO_CITY: 'hongkong', GEO_DATA: empty },
    timeout: 120000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const text = result.stderr + result.stdout;
  assert.match(text, /22\.28088/);
  assert.match(text, /114\.15979/);
  assert.match(text, /centreline pieces/);
  assert.match(text, /road graph/);
  assert.match(text, /non-at-grade omitted/);
  assert.match(text, /Blocks \(Cut 3\): 7 footprints, 7 extruded/);
  assert.match(text, /Cut 4/);
  assert.match(text, /Victoria Harbour|維多利亞港/);
  assert.doesNotMatch(text, /Stopping before blocks/);
  assert.doesNotMatch(text, /Broadway/);
  assert.equal(fs.existsSync(removed), false);
  assert.equal(fs.existsSync(path.join(root, 'js/hk-geodata.js')), true);
  const built = await import(pathToFileURL(out).href);
  assert.equal(built.GEO.frame.city, 'hk');
  assert.ok(built.GEO.harbour.rings.length >= 1);
  assert.equal(built.GEO.harbour.oppositeShore, 'kowloon');
  assert.equal(built.GEO.manhattan, undefined);
  assert.equal(built.GEO.boroughs.newJersey, undefined);
  assert.ok(built.GEO.hongKongIsland.length > 10);
  assert.ok(built.GEO.kowloon.length > 10);
  assert.ok(Math.abs(built.GEO.points.central[0]) < 1);
  assert.ok(Math.abs(built.GEO.points.central[1]) < 1);
  assert.ok(built.GEO.points.tst[0] > 900);
  assert.ok(built.GEO.piers.length >= 40);
  assert.equal(built.GEO.blocks.length, 7);
  assert.equal(built.GEO.blocks[0].length, 9);
  assert.equal(typeof built.GEO.blocks[0][6], 'number');
  const committed = await import(pathToFileURL(path.join(root, 'js/hk-geodata.js')).href);
  assert.equal(committed.GEO.frame.city, 'hk');
  assert.ok(committed.GEO.harbour.rings.length >= 1);
  assert.match(committed.GEO.harbour.name, /Victoria Harbour|維多利亞港/);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('committed hk-geodata.js stays the full Island + Kowloon extract', async () => {
  // A rebuild without the gitignored LandsD/OSM extracts writes the Statue Square sample
  // (7 blocks, 5 roads, 8 graph nodes, about 28 KB) and must not stay green.
  const committedPath = path.join(root, 'js/hk-geodata.js');
  const size = fs.statSync(committedPath).size;
  assert.ok(size > 5e6, `committed hk-geodata.js is ${size} bytes; the sample rebuild is far smaller`);
  const { GEO } = await import(pathToFileURL(committedPath).href);
  assert.equal(GEO.manhattan, undefined);
  assert.equal(GEO.boroughs.newJersey, undefined);
  assert.ok(GEO.hongKongIsland.length > 100);
  assert.ok(GEO.kowloon.length > 100);
  assert.ok(GEO.blocks.length > 10000, `blocks ${GEO.blocks.length}; the Statue Square sample has 7`);
  assert.ok(GEO.roads.length > 1000, `roads ${GEO.roads.length}; the Statue Square sample has 5`);
  assert.ok(GEO.roadGraph.links.length > 1000, `links ${GEO.roadGraph.links.length}; the Statue Square sample has 5`);
  assert.ok(GEO.roadGraph.nodes.length / 2 > 1000, `nodes ${GEO.roadGraph.nodes.length / 2}; the Statue Square sample has 8`);
});

test('resolveRuntimeCity is Hong Kong even when a query or GEO_CITY asks for New York', async () => {
  const { resolveRuntimeCity } = await import(pathToFileURL(path.join(root, 'js/geo-source.js')).href);
  assert.equal(resolveRuntimeCity({}, ''), 'hk');
  assert.equal(resolveRuntimeCity({ GEO_CITY: 'nyc' }, ''), 'hk');
  assert.equal(resolveRuntimeCity({ GEO_CITY: 'nyc' }, '?city=nyc'), 'hk');
  assert.equal(resolveRuntimeCity({ GEO_CITY: 'hongkong' }, ''), 'hk');
  assert.equal(resolveRuntimeCity({ GEO_CITY: 'hong-kong' }, '?city=hk'), 'hk');
});

test('the shipped module is Hong Kong without GEO_CITY or a query', () => {
  const source = fs.readFileSync(path.join(root, 'js/geo-source.js'), 'utf8');
  assert.match(source, /from '\.\/hk-geodata\.js'/);
  assert.equal(source.includes('nyc' + '-geodata'), false);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-boot-default-'));
  const script = path.join(empty, 'boot.mjs');
  fs.writeFileSync(script, `
    import { GEO, RUNTIME_CITY } from ${JSON.stringify(pathToFileURL(path.join(root, 'js/geo-source.js')).href)};
    if (RUNTIME_CITY !== 'hk') process.exit(2);
    if (GEO.frame.city !== 'hk') process.exit(3);
    if (!GEO.harbour || !GEO.harbour.rings.length) process.exit(4);
    if (Math.abs(GEO.points.central[0]) > 1 || Math.abs(GEO.points.central[1]) > 1) process.exit(5);
    const keys = Object.keys(GEO.points);
    if (!keys.includes('central') || !keys.includes('tst') || !keys.includes('admiralty')) process.exit(6);
  `);
  const env = { ...process.env };
  delete env.GEO_CITY;
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env, timeout: 20000 });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('GEO_CITY=nyc cannot select the Manhattan module', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-boot-nyc-'));
  const script = path.join(empty, 'boot.mjs');
  fs.writeFileSync(script, `
    import { GEO, RUNTIME_CITY } from ${JSON.stringify(pathToFileURL(path.join(root, 'js/geo-source.js')).href)};
    if (RUNTIME_CITY !== 'hk') process.exit(2);
    if (GEO.frame.city !== 'hk') process.exit(3);
    if (!String(GEO.frame.origin).includes('Central')) process.exit(4);
  `);
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, GEO_CITY: 'nyc' },
    timeout: 20000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  fs.rmSync(empty, { recursive: true, force: true });
});
