// Hong Kong blocks. Each LandsD Building footprint is one block and one lot.
// Height is TopHeight - BaseHeight (metres). A null pair is kept as a lot and not extruded.
// OSM buildings fill gaps only: a footprint whose interior misses every LandsD ring.
// There is no Manhattan name filter (Broadway plazas, Central Park drives, FDR / Route 9A).
// The v1 bbox is the detailed set. CUT_Z sits north of the Lion Rock line; footprints
// past that line are a low-detail carpet (outlines, no lots, no extrusion).
// Victoria Harbour and the playable hk-geodata module stay in Cut 4.
import fs from 'node:fs';
import path from 'node:path';
import { HK_ISLAND_KOWLOON_BBOX } from './geo-frame.mjs';
import { featureKey } from './fetch-landsd.mjs';
import { isAtGradeLevel } from './geo-hk-streets.mjs';

// Same ring helpers as tools/geo-base.mjs. Kept here so importing this module does not
// load the Manhattan shoreline (geo-base runs that build at import time).
function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return area / 2;
}
function bbox(pts) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz) || 1e-9;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / length;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
function rdpRing(ring, eps) {
  let i0 = 0;
  let far = 0;
  let i1 = 0;
  for (let i = 0; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[i0][0], ring[i][1] - ring[i0][1]);
    if (d > far) {
      far = d;
      i1 = i;
    }
  }
  const a = rdp(ring.slice(i0, i1 + 1), eps);
  const b = rdp([...ring.slice(i1), ring[i0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function centroid(ring) {
  return [ring.reduce((t, p) => t + p[0], 0) / ring.length, ring.reduce((t, p) => t + p[1], 0) / ring.length];
}

export const HK_MIN_BLOCK_AREA = 40; // m², same speck floor as the Manhattan curb islands
export const HK_DETAIL_MARGIN = 200; // m past the v1 northern edge, so the ridgeline stays detailed
const FRAME_EPS = (2 * Math.PI) / 180;
const COVER_FILL = 0.85;
const Q = (v) => Math.round(v * 10) / 10;

export function extrusionHeight(base, top) {
  const b = finiteNumber(base);
  const t = finiteNumber(top);
  if (b == null || t == null) return null;
  const height = t - b;
  if (!(height > 0)) return null;
  return Q(height);
}

export function hkDetailBounds(toWorld, box = HK_ISLAND_KOWLOON_BBOX, margin = HK_DETAIL_MARGIN) {
  if (typeof toWorld !== 'function') throw new Error('hkDetailBounds requires toWorld');
  const midLon = (box.west + box.east) / 2;
  const midLat = (box.south + box.north) / 2;
  const northZ = toWorld(midLon, box.north)[1];
  const southZ = toWorld(midLon, box.south)[1];
  const westX = toWorld(box.west, midLat)[0];
  const eastX = toWorld(box.east, midLat)[0];
  const cutZ = Math.round(Math.min(northZ, southZ) - margin);
  return {
    cutZ,
    x0: Math.round(Math.min(westX, eastX) - margin),
    x1: Math.round(Math.max(westX, eastX) + margin),
    z1: Math.round(Math.max(northZ, southZ) + margin)
  };
}

export function resolveHkBuildingInputs({ env = process.env, moduleDir, exists = fs.existsSync } = {}) {
  if (!moduleDir) throw new Error('moduleDir is required');
  const dataRoot = env.GEO_DATA || path.join(moduleDir, 'data');
  const hkDir = env.GEO_HK_DATA || path.join(dataRoot, 'hk');
  const sampleBuildings = path.join(moduleDir, 'data', 'hk', 'samples', 'statue-square-buildings.geojson');
  const fullBuildings = path.join(hkDir, 'landsd-buildings.geojson');
  const fullOsm = path.join(hkDir, 'osm_buildings.json');

  let buildings;
  let usedSampleBuildings = false;
  if (env.GEO_HK_BUILDINGS) {
    buildings = env.GEO_HK_BUILDINGS;
    if (!exists(buildings)) throw new Error(`GEO_HK_BUILDINGS not found: ${buildings}`);
  } else if (exists(fullBuildings)) {
    buildings = fullBuildings;
  } else if (exists(sampleBuildings)) {
    buildings = sampleBuildings;
    usedSampleBuildings = true;
  } else {
    throw new Error('Hong Kong buildings not found. Run bash tools/fetch-hk.sh or set GEO_HK_BUILDINGS.');
  }

  let osm = null;
  if (env.GEO_HK_OSM_BUILDINGS) {
    if (!exists(env.GEO_HK_OSM_BUILDINGS)) throw new Error(`GEO_HK_OSM_BUILDINGS not found: ${env.GEO_HK_OSM_BUILDINGS}`);
    osm = env.GEO_HK_OSM_BUILDINGS;
  } else if (exists(fullOsm)) {
    osm = fullOsm;
  }
  return { buildings, osm, usedSampleBuildings };
}

export function atGradeRoadPieces(pieces) {
  const roads = [];
  for (const piece of pieces || []) {
    if (!isAtGradeLevel(piece.level)) continue;
    const width = piece.w > 3 ? piece.w : 7.5;
    roads.push({
      x0: piece.x0,
      z0: piece.z0,
      x1: piece.x1,
      z1: piece.z1,
      r: width / 2,
      name: piece.name || ''
    });
  }
  return roads;
}

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function textProp(props, keys) {
  for (const key of keys) {
    const value = props?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
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

function worldRing(coords, toWorld) {
  const pts = [];
  for (const coord of coords || []) {
    if (!Array.isArray(coord) || coord.length < 2) continue;
    const [x, z] = toWorld(coord[0], coord[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(prev[0] - x, prev[1] - z) < 0.05) continue;
    pts.push([x, z]);
  }
  if (pts.length >= 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) pts.pop();
  }
  return pts.length >= 3 ? pts : null;
}

function polygonCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates || [];
  return [];
}

function footprintParts(geometry, toWorld) {
  const parts = [];
  for (const coords of polygonCoords(geometry)) {
    if (!Array.isArray(coords) || !coords.length) continue;
    const outer = worldRing(coords[0], toWorld);
    if (!outer) continue;
    const holes = [];
    for (let i = 1; i < coords.length; i++) {
      const hole = worldRing(coords[i], toWorld);
      if (hole) holes.push(hole);
    }
    parts.push({ outer, holes });
  }
  return parts;
}

function netArea(outer, holes) {
  let area = Math.abs(ringArea(outer));
  for (const hole of holes) area -= Math.abs(ringArea(hole));
  return area;
}

function orient(ring, positive) {
  const area = ringArea(ring);
  if (positive ? area < 0 : area > 0) return ring.slice().reverse();
  return ring;
}

function simplifyRing(ring) {
  if (ring.length < 6) return ring;
  const simplified = rdpRing(ring, 0.45);
  return simplified.length >= 3 ? simplified : ring;
}

const wrap90 = (a) => ((((a + Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;

function dominantPhi(ring) {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.5) continue;
    const phi = wrap90(Math.atan2(bz - az, bx - ax));
    sx += length * Math.cos(4 * phi);
    sy += length * Math.sin(4 * phi);
  }
  if (sx === 0 && sy === 0) return 0;
  return Math.atan2(sy, sx) / 4;
}

// One rectangular cover in the footprint's own edge direction. An L or a courtyard
// that the rectangle would badly overfill keeps the polygon and no lot rect.
function rectangularCover(ring, area) {
  const phi = dominantPhi(ring);
  const th = -phi;
  const [px, pz] = centroid(ring);
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [x, z] of ring) {
    const dx = x - px;
    const dz = z - pz;
    const u = px + dx * cs - dz * sn;
    const v = pz + dx * sn + dz * cs;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const rectArea = Math.max(0, u1 - u0) * Math.max(0, v1 - v0);
  const fill = rectArea > 0 ? area / rectArea : 0;
  const axis = Math.abs(phi) < FRAME_EPS;
  if (!(fill >= COVER_FILL)) {
    return { rect: false, rects: [], frames: null, fill: Q(fill) };
  }
  if (axis && fill > 0.985) {
    const box = bbox(ring);
    return {
      rect: true,
      rects: [[Q(box.x0), Q(box.x1), Q(box.z0), Q(box.z1)]],
      frames: null,
      fill: Q(fill)
    };
  }
  if (axis) return { rect: false, rects: [], frames: null, fill: Q(fill) };
  return {
    rect: false,
    rects: [],
    frames: [[Math.round(th * 1e4) / 1e4, Q(px), Q(pz), [[Q(u0), Q(u1), Q(v0), Q(v1)]]]],
    fill: Q(fill)
  };
}

function zoneOf(x, z, detail) {
  if (x < detail.x0 || x > detail.x1 || z > detail.z1) return 'out';
  if (z <= detail.cutZ) return 'carpet';
  return 'detail';
}

class RingIndex {
  constructor(cell = 80) {
    this.cell = cell;
    this.cells = new Map();
    this.rings = [];
  }

  add(ring) {
    const id = this.rings.length;
    this.rings.push(ring);
    const box = bbox(ring);
    const i0 = Math.floor(box.x0 / this.cell);
    const i1 = Math.floor(box.x1 / this.cell);
    const j0 = Math.floor(box.z0 / this.cell);
    const j1 = Math.floor(box.z1 / this.cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = i * 100003 + j;
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(id);
      }
    }
  }

  covers(x, z) {
    const list = this.cells.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!list) return false;
    for (const id of list) if (pointInRing(x, z, this.rings[id])) return true;
    return false;
  }
}

function interiorPoint(ring) {
  const [cx, cz] = centroid(ring);
  if (pointInRing(cx, cz, ring)) return [cx, cz];
  const box = bbox(ring);
  const z = (box.z0 + box.z1) / 2;
  const xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xa, za] = ring[j];
    const [xb, zb] = ring[i];
    if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
  }
  xs.sort((a, b) => a - b);
  let best = 0;
  let mid = cx;
  for (let n = 0; n + 1 < xs.length; n += 2) {
    const width = xs[n + 1] - xs[n];
    if (width > best) {
      best = width;
      mid = (xs[n] + xs[n + 1]) / 2;
    }
  }
  return [mid, z];
}

function isOsmBuilding(tags) {
  if (!tags || tags.building == null || tags.building === 'no') return false;
  if (tags.building === 'roof' || tags.building === 'bridge') return false;
  return true;
}

function osmHeight(tags) {
  const measured = finiteNumber(tags.height);
  if (measured != null && measured > 0 && measured < 600) {
    const minHeight = finiteNumber(tags.min_height);
    if (minHeight != null && measured > minHeight) return Q(measured - minHeight);
    return Q(measured);
  }
  const levels = finiteNumber(tags['building:levels']);
  if (levels != null && levels > 0 && levels < 200) return Q(levels * 3.2);
  return null;
}

function osmWayRing(element, toWorld) {
  if (Array.isArray(element.geometry) && element.geometry.length && element.geometry[0]?.lon != null) {
    return worldRing(element.geometry.map((point) => [point.lon, point.lat]), toWorld);
  }
  if (element.geometry?.type === 'LineString') return worldRing(element.geometry.coordinates, toWorld);
  return null;
}

function osmRecords(osm, toWorld) {
  const records = [];
  const elements = Array.isArray(osm?.elements) ? osm.elements : [];
  for (const element of elements) {
    const tags = element.tags || {};
    if (!isOsmBuilding(tags)) continue;
    if (element.type === 'way') {
      const outer = osmWayRing(element, toWorld);
      if (!outer) continue;
      records.push({ outer, holes: [], tags, name: textProp(tags, ['name']), kind: String(tags.building) });
    } else if (element.type === 'relation') {
      for (const member of element.members || []) {
        if (member.role && member.role !== 'outer') continue;
        const outer = osmWayRing(member, toWorld);
        if (!outer) continue;
        records.push({ outer, holes: [], tags, name: textProp(tags, ['name']), kind: String(tags.building) });
      }
    }
  }
  const features = Array.isArray(osm?.features) ? osm.features : [];
  for (const feature of features) {
    const tags = feature.properties || {};
    if (!isOsmBuilding(tags)) continue;
    for (const part of footprintParts(feature.geometry, toWorld)) {
      records.push({ ...part, tags, name: textProp(tags, ['name']), kind: String(tags.building) });
    }
  }
  return records;
}

function landsdRecords(buildings, toWorld) {
  const features = dedupeFeatures(Array.isArray(buildings?.features) ? buildings.features : []);
  const records = [];
  let skipped = 0;
  for (const feature of features) {
    const props = feature.properties || {};
    const status = props.Status ?? props.status;
    if (status != null && String(status).trim().toLowerCase() !== 'active') {
      skipped++;
      continue;
    }
    const parts = footprintParts(feature.geometry, toWorld);
    if (!parts.length) {
      skipped++;
      continue;
    }
    const name = textProp(props, ['BuildingNameEN', 'BuildingNameTC']);
    const kind = textProp(props, ['BuildingBlockType']);
    const height = extrusionHeight(props.BaseHeight ?? props.baseheight, props.TopHeight ?? props.topheight);
    const base = finiteNumber(props.BaseHeight ?? props.baseheight);
    const ref = featureKey(feature);
    for (const part of parts) {
      records.push({
        ...part,
        name,
        kind,
        height,
        base: base == null ? null : Q(base),
        ref,
        source: 'landsd'
      });
    }
  }
  return { records, skipped };
}

function outlineOf(record) {
  const outer = orient(simplifyRing(record.outer), false);
  const holes = record.holes
    .map((hole) => orient(simplifyRing(hole), true))
    .filter((hole) => Math.abs(ringArea(hole)) >= 1);
  return { outer, holes };
}

function placeRecord(record, blocks, lowDetail, detail, minArea, stats) {
  const area = netArea(record.outer, record.holes);
  if (!(area >= minArea)) {
    stats.droppedSpecks++;
    return;
  }
  const [x, z] = interiorPoint(record.outer);
  const zone = zoneOf(x, z, detail);
  if (zone === 'out') {
    stats.outOfExtent++;
    return;
  }
  const { outer, holes } = outlineOf(record);
  if (zone === 'carpet') {
    lowDetail.push({
      poly: outer,
      holes,
      area: Math.round(area),
      name: record.name || '',
      source: record.source
    });
    return;
  }
  const cover = rectangularCover(outer, area);
  const box = bbox(outer);
  blocks.push({
    id: blocks.length,
    poly: outer,
    holes,
    area: Math.round(area),
    bbox: [box.x0, box.x1, box.z0, box.z1],
    rect: cover.rect,
    rects: cover.rects,
    frames: cover.frames,
    fill: cover.fill,
    height: record.height,
    base: record.base ?? null,
    name: record.name || '',
    source: record.source,
    kind: record.kind || '',
    ref: record.ref || '',
    park: 0,
    parkName: ''
  });
}

export function buildHkBlocks({ buildings, osm = null, pieces = null, toWorld, bounds = null, minArea = HK_MIN_BLOCK_AREA, log = null } = {}) {
  if (typeof toWorld !== 'function') throw new Error('buildHkBlocks requires toWorld');
  const detail = bounds || hkDetailBounds(toWorld);
  const { records, skipped } = landsdRecords(buildings, toWorld);
  const coverage = new RingIndex();
  for (const record of records) coverage.add(record.outer);

  const blocks = [];
  const lowDetail = [];
  const stats = { droppedSpecks: 0, outOfExtent: 0 };
  let nullHeight = 0;
  for (const record of records) {
    const before = blocks.length;
    placeRecord(record, blocks, lowDetail, detail, minArea, stats);
    if (blocks.length > before && record.height == null) nullHeight++;
  }
  const landsdBlocks = blocks.length;

  const osmParts = osmRecords(osm, toWorld);
  let osmCovered = 0;
  let osmGapBlocks = 0;
  for (const record of osmParts) {
    const [x, z] = interiorPoint(record.outer);
    if (coverage.covers(x, z)) {
      osmCovered++;
      continue;
    }
    const height = osmHeight(record.tags || {});
    const before = blocks.length;
    placeRecord({
      ...record,
      height,
      base: null,
      ref: '',
      source: 'osm'
    }, blocks, lowDetail, detail, minArea, stats);
    if (blocks.length > before) {
      osmGapBlocks++;
      if (height == null) nullHeight++;
    }
  }

  const roads = atGradeRoadPieces(pieces);
  const extruded = blocks.filter((block) => block.height != null).length;
  const report = {
    landsdFootprints: records.length,
    skippedFeatures: skipped,
    landsdBlocks,
    extruded,
    nullHeight,
    droppedSpecks: stats.droppedSpecks,
    outOfExtent: stats.outOfExtent,
    osmCandidates: osmParts.length,
    osmCovered,
    osmGapBlocks,
    carpet: lowDetail.length,
    cutZ: detail.cutZ,
    buildingsFile: null,
    osmFile: null,
    usedSampleBuildings: false
  };
  if (log) {
    log(`${blocks.length} blocks from building footprints (${extruded} extruded, ${nullHeight} without height); ${stats.droppedSpecks} specks dropped; OSM gaps ${osmGapBlocks}; low-detail carpet ${lowDetail.length}`);
    log(`detail cut z>${detail.cutZ} (north of the v1 ridgeline). At-grade road pieces ${roads.length}. No hk-geodata module.`);
  }
  return { blocks, lowDetail, roads, cutZ: detail.cutZ, innerRing: [], report };
}
