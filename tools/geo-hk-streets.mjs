// Hong Kong street graph. LandsD Road Centreline takes the CSCL role (geometry and names).
// OSM highways keep the class, lanes, width, oneway, and fill centreline gaps.
// Width is a heuristic where neither source has a measured carriageway.
// The road graph keeps the NYC 7-tuple and, like tools/geo-roadgraph.mjs, only at-grade
// links (level "13"). Tunnels, bridges, and ramps stay on `pieces` and are left out of the graph.
// Blocks are tools/geo-hk-blocks.mjs. This module does not write hk-geodata.
import fs from 'node:fs';
import path from 'node:path';
import { featureKey } from './fetch-landsd.mjs';

const MATCH_M = 12;
const BEARING_TOL = (25 * Math.PI) / 180;
const SAMPLE_STEP = 12;
const GAP_MIN_M = 18;
const LANDSD_MERGE_M = 1.5;
const OSM_SNAP_M = 12;
const SEG_CELL = 16;
const NODE_CELL = 1.5;

const VEHICLE_HIGHWAYS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
]);

const WIDTH_BY_CLASS = {
  motorway: 14,
  trunk: 12,
  primary: 11,
  secondary: 8.5,
  tertiary: 7,
  residential: 6.5,
  unclassified: 6,
  living_street: 5,
  service: 4.5
};

const q = (v) => Math.round(v * 10) / 10;

export function streetTypeClass(streetType) {
  switch (String(streetType || '').trim().toLowerCase()) {
    case 'highway': return 'motorway';
    case 'main road': return 'primary';
    case 'secondary road': return 'secondary';
    case 'tunnel': return 'primary';
    case 'restricted road': return 'service';
    default: return null;
  }
}

export function isDrivableStreetType(streetType) {
  const t = String(streetType || '').trim().toLowerCase();
  if (!t) return true;
  if (t === 'track') return false;
  return !/pedestrian|footpath|footway|walkway|cycle|steps/.test(t);
}

export function isDrivableOsmWay(tags) {
  if (!tags || !VEHICLE_HIGHWAYS.has(tags.highway)) return false;
  if (tags.highway === 'service' && (tags.service === 'driveway' || tags.service === 'parking_aisle' || tags.service === 'parking')) return false;
  if (tags.area === 'yes') return false;
  return true;
}

export function parseLanes(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 16) return Math.round(value);
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const n = Math.round(Number(match[0]));
  return n > 0 && n < 16 ? n : null;
}

function parseMeasure(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0.5 && value < 60) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return n > 0.5 && n < 60 ? n : null;
}

export function travelDir(oneway) {
  if (oneway == null || oneway === '' || oneway === 'no' || oneway === 'false' || oneway === '0') return 0;
  if (oneway === 'yes' || oneway === 'true' || oneway === '1') return 1;
  if (oneway === '-1' || oneway === 'reverse') return -1;
  return 0;
}

export function heuristicWidth({ highway, lanes, osmWidth }) {
  const measured = parseMeasure(osmWidth);
  if (measured != null) return q(measured);
  const laneCount = parseLanes(lanes);
  if (laneCount != null) return q(laneCount * 3.3);
  const link = typeof highway === 'string' && highway.endsWith('_link');
  const key = link ? highway.slice(0, -'_link'.length) : highway;
  const width = WIDTH_BY_CLASS[key];
  if (width == null) return 7.5;
  return link ? Math.min(width, 6.5) : width;
}

export function heuristicLanes({ lanes, width }) {
  const tagged = parseLanes(lanes);
  if (tagged != null) return tagged;
  if (Number.isFinite(width) && width > 0) return Math.max(1, Math.round(width / 3.3));
  return 1;
}

export function roadLevel(streetType, tags = {}) {
  const t = String(streetType || '').trim().toLowerCase();
  const hw = String(tags.highway || '');
  if (tags.tunnel === 'yes' || t === 'tunnel') return 'tunnel';
  if (tags.bridge === 'yes' || tags.bridge === 'viaduct') return 'elevated';
  if (hw.endsWith('_link')) return 'ramp';
  return '13';
}

// CSCL at-grade code. NYC's road graph keeps a link only when both ends are "13".
export function isAtGradeLevel(level) {
  return level === '13';
}

export function roadClassCode(streetType, highway) {
  const t = String(streetType || '').trim().toLowerCase();
  const hw = String(highway || '');
  if (t === 'tunnel') return '3';
  if (t === 'highway' || hw === 'motorway' || hw === 'trunk' || hw === 'motorway_link' || hw === 'trunk_link') return '2';
  return '1';
}

function dirCode(dir) {
  if (dir > 0) return 'FT';
  if (dir < 0) return 'TF';
  return 'TW';
}

function textProp(props, keys) {
  for (const key of keys) {
    const value = props?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function lineParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function worldLine(coords, toWorld) {
  const pts = [];
  for (const coord of coords || []) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const [x, z] = toWorld(coord[0], coord[1]);
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(prev[0] - x, prev[1] - z) < 0.05) continue;
    pts.push([x, z]);
  }
  return pts.length >= 2 ? pts : null;
}

function polylineLength(pts) {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return length;
}

function undirectedDelta(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

function distToSeg(x, z, seg) {
  const dx = seg.x1 - seg.x0;
  const dz = seg.z1 - seg.z0;
  const len2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - seg.x0) * dx + (z - seg.z0) * dz) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(x - (seg.x0 + t * dx), z - (seg.z0 + t * dz));
}

function cellKey(ix, iz) {
  return ix * 100003 + iz;
}

function buildSegmentIndex(lines) {
  const segs = [];
  const index = new Map();
  lines.forEach((line, wayIndex) => {
    const pts = line.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const x0 = pts[i][0];
      const z0 = pts[i][1];
      const x1 = pts[i + 1][0];
      const z1 = pts[i + 1][1];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 0.3) continue;
      const id = segs.length;
      segs.push({ x0, z0, x1, z1, bearing: Math.atan2(x1 - x0, z1 - z0), wayIndex });
      const ix0 = Math.floor(Math.min(x0, x1) / SEG_CELL);
      const ix1 = Math.floor(Math.max(x0, x1) / SEG_CELL);
      const iz0 = Math.floor(Math.min(z0, z1) / SEG_CELL);
      const iz1 = Math.floor(Math.max(z0, z1) / SEG_CELL);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = cellKey(ix, iz);
          let bucket = index.get(key);
          if (!bucket) index.set(key, bucket = []);
          bucket.push(id);
        }
      }
    }
  });
  return { segs, index };
}

function candidates(index, segs, x, z, bearing, maxDist) {
  const reach = Math.max(1, Math.ceil(maxDist / SEG_CELL));
  const ix = Math.floor(x / SEG_CELL);
  const iz = Math.floor(z / SEG_CELL);
  const seen = new Set();
  const hits = [];
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      const bucket = index.get(cellKey(ix + dx, iz + dz));
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        const seg = segs[id];
        if (bearing != null && undirectedDelta(bearing, seg.bearing) > BEARING_TOL) continue;
        const dist = distToSeg(x, z, seg);
        if (dist <= maxDist) hits.push({ dist, wayIndex: seg.wayIndex });
      }
    }
  }
  return hits;
}

function nearest(index, segs, x, z, bearing, maxDist) {
  let best = null;
  for (const hit of candidates(index, segs, x, z, bearing, maxDist)) {
    if (!best || hit.dist < best.dist) best = hit;
  }
  return best;
}

function highwayRank(highway) {
  const link = typeof highway === 'string' && highway.endsWith('_link');
  const key = link ? highway.slice(0, -'_link'.length) : highway;
  const rank = { motorway: 80, trunk: 70, primary: 60, secondary: 50, tertiary: 40, unclassified: 30, residential: 20, living_street: 15, service: 10 }[key] || 0;
  return link ? rank - 5 : rank;
}

function samplesWithBearing(pts) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0];
    const az = pts[i - 1][1];
    const bx = pts[i][0];
    const bz = pts[i][1];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.3) continue;
    const bearing = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(length / SAMPLE_STEP));
    for (let k = 0; k <= n; k++) {
      if (i > 1 && k === 0) continue;
      const t = k / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, bearing });
    }
  }
  return out;
}

function adoptOsm(pts, osmIndex, osmLines) {
  const samples = samplesWithBearing(pts);
  if (!samples.length) return null;
  const votes = new Map();
  let matched = 0;
  for (const sample of samples) {
    const hits = candidates(osmIndex.index, osmIndex.segs, sample.x, sample.z, sample.bearing, MATCH_M);
    if (!hits.length) continue;
    matched++;
    const seen = new Set();
    for (const hit of hits) {
      if (seen.has(hit.wayIndex)) continue;
      seen.add(hit.wayIndex);
      votes.set(hit.wayIndex, (votes.get(hit.wayIndex) || 0) + 1);
    }
  }
  if (matched / samples.length < 0.45) return null;
  let best = -1;
  let bestRank = -1;
  let bestN = 0;
  for (const [wayIndex, n] of votes) {
    if (n / samples.length < 0.45) continue;
    const rank = highwayRank(osmLines[wayIndex].tags.highway);
    if (rank > bestRank || (rank === bestRank && n > bestN)) {
      best = wayIndex;
      bestRank = rank;
      bestN = n;
    }
  }
  return best >= 0 ? osmLines[best] : null;
}

function gapPolylines(pts, landsdIndex) {
  if (pts.length < 2) return [];
  const covered = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const bearing = Math.atan2(bx - ax, bz - az);
    const hit = nearest(landsdIndex.index, landsdIndex.segs, (ax + bx) / 2, (az + bz) / 2, bearing, MATCH_M);
    covered.push(!!hit);
  }
  const runs = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2 && polylineLength(run) >= GAP_MIN_M) runs.push(run);
    run = [];
  };
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i]) {
      if (run.length === 0) run.push(pts[i]);
      run.push(pts[i + 1]);
    } else if (run.length) flush();
  }
  flush();
  return runs;
}

function dedupeFeatures(features) {
  const seen = new Set();
  const out = [];
  for (const feature of features) {
    const key = featureKey(feature);
    if (key != null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(feature);
  }
  return out;
}

function osmCoords(way) {
  if (Array.isArray(way.geometry) && way.geometry.length && way.geometry[0] && way.geometry[0].lon != null) {
    return way.geometry.map((point) => [point.lon, point.lat]);
  }
  if (way.geometry?.type === 'LineString') return way.geometry.coordinates;
  return [];
}

function pushPieces(pieces, base, pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length < 0.5) continue;
    pieces.push({ ...base, x0, z0, x1, z1, L: length });
  }
}

export function assembleRoadGraph(segments, simplify) {
  const nodes = [];
  const cells = new Map();
  function nodeAt(x, z, radius) {
    const ix = Math.floor(x / NODE_CELL);
    const iz = Math.floor(z / NODE_CELL);
    const reach = Math.max(1, Math.ceil(radius / NODE_CELL));
    let best = -1;
    let bestD = radius;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const bucket = cells.get(cellKey(ix + dx, iz + dz));
        if (!bucket) continue;
        for (const id of bucket) {
          const dist = Math.hypot(nodes[id][0] - x, nodes[id][1] - z);
          if (dist <= bestD) {
            bestD = dist;
            best = id;
          }
        }
      }
    }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push([x, z]);
    const key = cellKey(ix, iz);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(id);
    return id;
  }
  const names = [];
  const nameIds = new Map();
  const nameId = (name) => {
    if (!nameIds.has(name)) {
      nameIds.set(name, names.length);
      names.push(name);
    }
    return nameIds.get(name);
  };
  const links = [];
  for (const seg of segments) {
    if (!seg.pts || seg.pts.length < 2) continue;
    const line = simplify ? simplify(seg.pts, 0.4) : seg.pts;
    const a = nodeAt(seg.pts[0][0], seg.pts[0][1], seg.snap);
    const b = nodeAt(seg.pts[seg.pts.length - 1][0], seg.pts[seg.pts.length - 1][1], seg.snap);
    if (a === b) continue;
    links.push([a, b, nameId(seg.name), q(seg.w), seg.lanes, seg.dir, line]);
  }
  const used = new Map();
  const outNodes = [];
  const idOf = (i) => {
    if (!used.has(i)) {
      used.set(i, outNodes.length / 2);
      outNodes.push(q(nodes[i][0]), q(nodes[i][1]));
    }
    return used.get(i);
  };
  const outLinks = links.map(([a, b, name, width, lanes, dir, line]) => {
    const ia = idOf(a);
    const ib = idOf(b);
    const inner = line.slice(1, -1).flatMap(([x, z]) => [q(x), q(z)]);
    return [ia, ib, name, width, lanes, dir, inner];
  });
  return { nodes: outNodes, links: outLinks, names };
}

function landsdRecords(roads, toWorld) {
  const features = dedupeFeatures(Array.isArray(roads?.features) ? roads.features : []);
  const records = [];
  let skipped = 0;
  for (const feature of features) {
    const props = feature.properties || {};
    const streetType = textProp(props, ['STREETTYPE', 'StreetType', 'streettype']);
    if (!isDrivableStreetType(streetType)) {
      skipped++;
      continue;
    }
    const name = textProp(props, ['ENGLISHSTREETNAME', 'EnglishStreetName', 'englishstreetname'])
      || textProp(props, ['CHINESESTREETNAME', 'ChineseStreetName', 'chinesestreetname']);
    let kept = false;
    for (const coords of lineParts(feature.geometry)) {
      const pts = worldLine(coords, toWorld);
      if (!pts) continue;
      records.push({ name, streetType, pts });
      kept = true;
    }
    if (!kept) skipped++;
  }
  return { records, skipped };
}

function osmLines(osm, toWorld) {
  const elements = Array.isArray(osm?.elements)
    ? osm.elements.filter((element) => element.type === 'way')
    : Array.isArray(osm?.features) ? osm.features : [];
  const lines = [];
  for (const element of elements) {
    const tags = element.tags || element.properties || {};
    if (!isDrivableOsmWay(tags)) continue;
    const pts = worldLine(osmCoords(element), toWorld);
    if (!pts) continue;
    lines.push({
      tags,
      pts,
      name: textProp(tags, ['name', 'ref'])
    });
  }
  return lines;
}

export function buildHkStreetGraph({ roads, osm = null, toWorld, simplify = null, log = null }) {
  if (typeof toWorld !== 'function') throw new Error('buildHkStreetGraph requires toWorld');
  const { records, skipped } = landsdRecords(roads, toWorld);
  if (!records.length) throw new Error('Hong Kong road centreline has no drivable features');
  const osmRoads = osmLines(osm, toWorld);
  const osmIndex = buildSegmentIndex(osmRoads);
  const pieces = [];
  const segments = [];
  let taggedFromOsm = 0;
  for (const record of records) {
    const donor = osmRoads.length ? adoptOsm(record.pts, osmIndex, osmRoads) : null;
    const tags = donor?.tags || {};
    if (donor) taggedFromOsm++;
    const highway = tags.highway || streetTypeClass(record.streetType);
    const width = heuristicWidth({ highway, lanes: tags.lanes, osmWidth: tags.width });
    const lanes = heuristicLanes({ lanes: tags.lanes, width });
    const dir = travelDir(tags.oneway);
    const level = roadLevel(record.streetType, tags);
    const rw = roadClassCode(record.streetType, highway);
    const name = record.name || donor?.name || '';
    pushPieces(pieces, { name, rw, w: width, lanes, dir: dirCode(dir), level, highway: highway || '', source: 'landsd' }, record.pts);
    segments.push({ name, w: width, lanes, dir, level, pts: record.pts, snap: LANDSD_MERGE_M });
  }
  const landsdIndex = buildSegmentIndex(records);
  let osmGapLinks = 0;
  for (const line of osmRoads) {
    const highway = line.tags.highway;
    const width = heuristicWidth({ highway, lanes: line.tags.lanes, osmWidth: line.tags.width });
    const lanes = heuristicLanes({ lanes: line.tags.lanes, width });
    const dir = travelDir(line.tags.oneway);
    const level = roadLevel('', line.tags);
    const rw = roadClassCode('', highway);
    for (const pts of gapPolylines(line.pts, landsdIndex)) {
      osmGapLinks++;
      pushPieces(pieces, { name: line.name, rw, w: width, lanes, dir: dirCode(dir), level, highway: highway || '', source: 'osm' }, pts);
      segments.push({ name: line.name, w: width, lanes, dir, level, pts, snap: OSM_SNAP_M });
    }
  }
  let omittedNonAtGrade = 0;
  const graphSegments = [];
  for (const seg of segments) {
    if (!isAtGradeLevel(seg.level)) {
      omittedNonAtGrade++;
      continue;
    }
    graphSegments.push(seg);
  }
  const roadGraph = assembleRoadGraph(graphSegments, simplify);
  const report = {
    landsdFeatures: records.length,
    skippedFeatures: skipped,
    osmWays: osmRoads.length,
    taggedFromOsm,
    osmGapLinks,
    omittedNonAtGrade,
    nodes: roadGraph.nodes.length / 2,
    links: roadGraph.links.length,
    roadsFile: null,
    osmFile: null,
    usedSampleRoads: false
  };
  if (log) {
    log(`${pieces.length} centerline pieces`);
    log(`road graph: ${report.nodes} nodes, ${report.links} links (LandsD ${records.length}, OSM gaps ${osmGapLinks}, ${skipped} non-carriageway skipped, ${omittedNonAtGrade} non-at-grade omitted)`);
  }
  return { pieces, roadGraph, report };
}

export function resolveHkRoadInputs({ env = process.env, moduleDir, exists = fs.existsSync } = {}) {
  if (!moduleDir) throw new Error('moduleDir is required');
  const dataRoot = env.GEO_DATA || path.join(moduleDir, 'data');
  const hkDir = env.GEO_HK_DATA || path.join(dataRoot, 'hk');
  const sampleRoads = path.join(moduleDir, 'data', 'hk', 'samples', 'statue-square-roads.geojson');
  const sampleOsm = path.join(moduleDir, 'data', 'hk', 'samples', 'statue-square-highways.json');
  const fullRoads = path.join(hkDir, 'landsd-roads.geojson');
  const fullOsm = path.join(hkDir, 'osm_highways.json');

  let roads;
  let usedSampleRoads = false;
  if (env.GEO_HK_ROADS) {
    roads = env.GEO_HK_ROADS;
    if (!exists(roads)) throw new Error(`GEO_HK_ROADS not found: ${roads}`);
  } else if (exists(fullRoads)) {
    roads = fullRoads;
  } else if (exists(sampleRoads)) {
    roads = sampleRoads;
    usedSampleRoads = true;
  } else {
    throw new Error('Hong Kong road centreline not found. Run bash tools/fetch-hk.sh or set GEO_HK_ROADS.');
  }

  let osm = null;
  if (env.GEO_HK_OSM_ROADS) {
    if (!exists(env.GEO_HK_OSM_ROADS)) throw new Error(`GEO_HK_OSM_ROADS not found: ${env.GEO_HK_OSM_ROADS}`);
    osm = env.GEO_HK_OSM_ROADS;
  } else if (exists(fullOsm)) {
    osm = fullOsm;
  } else if (usedSampleRoads && exists(sampleOsm)) {
    osm = sampleOsm;
  }
  return { roads, osm, usedSampleRoads };
}
