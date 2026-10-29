// Hong Kong harbour stage. OSM coastline and water (q_hk_coast) become Hong Kong Island,
// the Kowloon opposite shore, and a Victoria Harbour water ring between them.
// OSM piers (q_hk_piers) stay piers. Parks and landmarks are optional fill.
// LandsD is not a shore source. iB1000 hydro is later.
// This module does not import tools/geo-base.mjs, so a Hong Kong run does not build Manhattan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrame, HK_ISLAND_KOWLOON_BBOX } from './geo-frame.mjs';

export const HK_PLACES = Object.freeze({
  central: { lon: 114.15979, lat: 22.28088, name: 'Central' },
  tst: { lon: 114.16938, lat: 22.29395, name: 'Tsim Sha Tsui' },
  admiralty: { lon: 114.16463, lat: 22.27935, name: 'Admiralty' }
});

// Mid-harbour, between Wan Chai and the TST east shore. The water flood starts here.
export const HARBOUR_SEED = Object.freeze({ lon: 114.1735, lat: 22.2915 });

const RES = 16; // metres. The v1 box is about 16 km by 19 km.
const SHORE_REACH = 1700; // a harbour cell is water within this of both shores
const GAP_CLOSE = 48; // join coastline ends this close, and pull a near end out to the box edge
const MIN_PIER_AREA = 80;
const MAX_PIER_AREA = 250000;

const EMPTY = 0;
const WATER = 1;
const BARRIER = 2;

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return area / 2;
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
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += c;
    cx += (ring[j][0] + ring[i][0]) * c;
    cz += (ring[j][1] + ring[i][1]) * c;
  }
  a *= 0.5;
  if (!a) {
    return [
      ring.reduce((t, p) => t + p[0], 0) / ring.length,
      ring.reduce((t, p) => t + p[1], 0) / ring.length
    ];
  }
  return [cx / (6 * a), cz / (6 * a)];
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
  if (ring.length < 8) return ring.slice();
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
  if (i1 === 0) return ring.slice();
  const a = rdp(ring.slice(i0, i1 + 1), eps);
  const b = rdp([...ring.slice(i1), ring[i0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function windNegative(ring) {
  const out = ring.slice();
  if (ringArea(out) > 0) out.reverse();
  return out;
}

function wayGeometry(element) {
  const geom = element.geometry;
  if (!Array.isArray(geom) || geom.length < 2) return null;
  const pts = [];
  for (const p of geom) {
    if (p && Number.isFinite(p.lon) && Number.isFinite(p.lat)) pts.push([p.lon, p.lat]);
  }
  return pts.length >= 2 ? pts : null;
}

function isCoast(tags) {
  return tags.natural === 'coastline';
}

function isWater(tags) {
  return tags.natural === 'water' || tags.waterway === 'riverbank' || tags.harbour === 'yes';
}

function isPier(tags) {
  return tags.man_made === 'pier' || tags.amenity === 'ferry_terminal';
}

// Coastline, water, and pier lines in world metres. Relation outers are rings of their own.
export function collectOsmLines(osm, toWorld, accept) {
  const lines = [];
  const elements = Array.isArray(osm?.elements) ? osm.elements : [];
  for (const element of elements) {
    const tags = element.tags || {};
    if (element.type === 'way') {
      if (!accept(tags)) continue;
      const ll = wayGeometry(element);
      if (!ll) continue;
      const ring = ll.map(([lon, lat]) => toWorld(lon, lat));
      lines.push({ name: tags.name || '', tags, ring, kind: element.type });
    } else if (element.type === 'relation') {
      if (!accept(tags)) continue;
      for (const member of element.members || []) {
        if (member.role && member.role !== 'outer') continue;
        const ll = wayGeometry(member);
        if (!ll) continue;
        const ring = ll.map(([lon, lat]) => toWorld(lon, lat));
        lines.push({ name: tags.name || member.tags?.name || '', tags, ring, kind: 'relation' });
      }
    }
  }
  return lines;
}

function worldBox(toWorld, box) {
  const corners = [
    toWorld(box.west, box.south),
    toWorld(box.east, box.south),
    toWorld(box.west, box.north),
    toWorld(box.east, box.north)
  ];
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of corners) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return { x0, x1, z0, z1 };
}

function snapCoastEnds(lines, box) {
  const ends = [];
  for (const line of lines) {
    ends.push(line.ring[0], line.ring[line.ring.length - 1]);
  }
  const pulled = lines.map((line) => ({ ...line, ring: line.ring.slice() }));
  for (const line of pulled) {
    for (const index of [0, line.ring.length - 1]) {
      const [x, z] = line.ring[index];
      let best = null;
      let bestD = GAP_CLOSE;
      for (const [ox, oz] of ends) {
        const d = Math.hypot(ox - x, oz - z);
        if (d > 0.5 && d < bestD) {
          bestD = d;
          best = [ox, oz];
        }
      }
      if (best) line.ring[index] = best;
      const [px, pz] = line.ring[index];
      if (px - box.x0 < GAP_CLOSE) line.ring[index] = [box.x0, pz];
      else if (box.x1 - px < GAP_CLOSE) line.ring[index] = [box.x1, pz];
      else if (pz - box.z0 < GAP_CLOSE) line.ring[index] = [px, box.z0];
      else if (box.z1 - pz < GAP_CLOSE) line.ring[index] = [px, box.z1];
    }
  }
  return pulled;
}

function makeRaster(box, res) {
  const x0 = Math.floor(box.x0 / res) * res;
  const z0 = Math.floor(box.z0 / res) * res;
  const w = Math.ceil((box.x1 - x0) / res) + 1;
  const h = Math.ceil((box.z1 - z0) / res) + 1;
  if (w * h > 4_000_000) throw new Error(`Hong Kong shore raster is ${w}x${h}, which is too large`);
  return { res, x0, z0, w, h, d: new Uint8Array(w * h) };
}

function paintSegment(ras, x0, z0, x1, z1, value) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (ras.res * 0.45)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const i = Math.floor((x0 + (x1 - x0) * t - ras.x0) / ras.res);
    const j = Math.floor((z0 + (z1 - z0) * t - ras.z0) / ras.res);
    if (i >= 0 && j >= 0 && i < ras.w && j < ras.h) ras.d[j * ras.w + i] = value;
  }
}

function paintRing(ras, ring, value) {
  for (let i = 0; i + 1 < ring.length; i++) paintSegment(ras, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], value);
  const a = ring[ring.length - 1];
  const b = ring[0];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) paintSegment(ras, a[0], a[1], b[0], b[1], value);
}

function sealBorder(ras) {
  const { w, h, d } = ras;
  for (let i = 0; i < w; i++) {
    d[i] = BARRIER;
    d[(h - 1) * w + i] = BARRIER;
  }
  for (let j = 0; j < h; j++) {
    d[j * w] = BARRIER;
    d[j * w + w - 1] = BARRIER;
  }
}

function dilateBarriers(ras) {
  const { w, h, d } = ras;
  const next = d.slice();
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      if (d[j * w + i] !== BARRIER) continue;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) next[(j + dj) * w + i + di] = BARRIER;
      }
    }
  }
  ras.d = next;
}

function cellIndex(ras, x, z) {
  const i = Math.floor((x - ras.x0) / ras.res);
  const j = Math.floor((z - ras.z0) / ras.res);
  if (i < 0 || j < 0 || i >= ras.w || j >= ras.h) return -1;
  return j * ras.w + i;
}

function nearestOpen(ras, x, z, radius) {
  const i0 = Math.floor((x - ras.x0) / ras.res);
  const j0 = Math.floor((z - ras.z0) / ras.res);
  for (let r = 0; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i <= 0 || j <= 0 || i >= ras.w - 1 || j >= ras.h - 1) continue;
        const p = j * ras.w + i;
        if (ras.d[p] === EMPTY) return p;
      }
    }
  }
  return -1;
}

function flood(ras, seeds) {
  const { w, h, d } = ras;
  const queue = [];
  let head = 0;
  const push = (p) => {
    if (d[p] !== EMPTY) return;
    d[p] = WATER;
    queue.push(p);
  };
  for (const p of seeds) if (p >= 0) push(p);
  while (head < queue.length) {
    const p = queue[head++];
    const i = p % w;
    const j = (p - i) / w;
    if (i > 0) push(p - 1);
    if (i + 1 < w) push(p + 1);
    if (j > 0) push(p - w);
    if (j + 1 < h) push(p + w);
  }
}

function labelLand(ras) {
  // Unflooded open cells only. Barrier cells are the wall, including the box edge, so they must
  // not stitch Hong Kong Island to Kowloon into one component.
  const { w, h, d } = ras;
  const lab = new Int32Array(w * h);
  const comps = [];
  const stack = [];
  let cur = 0;
  for (let s = 0; s < w * h; s++) {
    if (d[s] !== EMPTY || lab[s]) continue;
    cur++;
    let n = 0;
    let si = 0;
    let sj = 0;
    stack.push(s);
    lab[s] = cur;
    while (stack.length) {
      const p = stack.pop();
      n++;
      const i = p % w;
      const j = (p - i) / w;
      si += i;
      sj += j;
      if (i > 0 && d[p - 1] === EMPTY && !lab[p - 1]) { lab[p - 1] = cur; stack.push(p - 1); }
      if (i + 1 < w && d[p + 1] === EMPTY && !lab[p + 1]) { lab[p + 1] = cur; stack.push(p + 1); }
      if (j > 0 && d[p - w] === EMPTY && !lab[p - w]) { lab[p - w] = cur; stack.push(p - w); }
      if (j + 1 < h && d[p + w] === EMPTY && !lab[p + w]) { lab[p + w] = cur; stack.push(p + w); }
    }
    comps.push({ id: cur, n, i: si / n, j: sj / n });
  }
  return { lab, comps };
}

function labelNear(ras, lab, x, z, radius) {
  const i0 = Math.floor((x - ras.x0) / ras.res);
  const j0 = Math.floor((z - ras.z0) / ras.res);
  for (let r = 0; r <= radius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= ras.w || j >= ras.h) continue;
        const id = lab[j * ras.w + i];
        if (id && ras.d[j * ras.w + i] !== WATER) return id;
      }
    }
  }
  return 0;
}

// Outer ring of one land (or water) label. Land stays on the right of the walk, matching tools/geo-base.mjs.
function traceLabel(ras, lab, id) {
  const { w, h, res, x0, z0 } = ras;
  const at = (i, j) => (i >= 0 && j >= 0 && i < w && j < h && lab[j * w + i] === id ? 1 : 0);
  let si = -1;
  let sj = -1;
  outer: for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) if (at(i, j)) { si = i; sj = j; break outer; }
  }
  if (si < 0) return [];
  const DX = [1, 0, -1, 0];
  const DZ = [0, 1, 0, -1];
  let cx = si;
  let cz = sj;
  let dir = 0;
  const start = `${cx},${cz},${dir}`;
  const pts = [];
  let guard = 0;
  do {
    pts.push([x0 + cx * res, z0 + cz * res]);
    cx += DX[dir];
    cz += DZ[dir];
    let left;
    let right;
    if (dir === 0) { left = at(cx, cz - 1); right = at(cx, cz); }
    else if (dir === 1) { left = at(cx, cz); right = at(cx - 1, cz); }
    else if (dir === 2) { left = at(cx - 1, cz); right = at(cx - 1, cz - 1); }
    else { left = at(cx - 1, cz - 1); right = at(cx, cz - 1); }
    if (left && right) dir = (dir + 3) % 4;
    else if (!left && right) { /* straight */ }
    else dir = (dir + 1) % 4;
    if (++guard > w * h * 8) throw new Error('Hong Kong shore trace did not close');
  } while (`${cx},${cz},${dir}` !== start);
  const corners = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i + pts.length - 1) % pts.length];
    const q = pts[i];
    const n = pts[(i + 1) % pts.length];
    if ((q[0] - p[0]) * (n[1] - q[1]) - (q[1] - p[1]) * (n[0] - q[0]) !== 0) corners.push(q);
  }
  return corners.map((q, i) => {
    const n = corners[(i + 1) % corners.length];
    return [(q[0] + n[0]) / 2, (q[1] + n[1]) / 2];
  });
}

function distanceTo(ras, lab, id, limitCells) {
  const { w, h } = ras;
  const dist = new Int16Array(w * h);
  dist.fill(-1);
  const queue = [];
  let head = 0;
  for (let p = 0; p < w * h; p++) {
    if (lab[p] !== id) continue;
    dist[p] = 0;
    queue.push(p);
  }
  while (head < queue.length) {
    const p = queue[head++];
    const step = dist[p] + 1;
    if (step > limitCells) continue;
    const i = p % w;
    const j = (p - i) / w;
    const look = (n) => {
      if (dist[n] >= 0) return;
      dist[n] = step;
      queue.push(n);
    };
    if (i > 0) look(p - 1);
    if (i + 1 < w) look(p + 1);
    if (j > 0) look(p - w);
    if (j + 1 < h) look(p + w);
  }
  return dist;
}

function orientedBox(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length < 1) continue;
    const ux = (x1 - x0) / length;
    const uz = (z1 - z0) / length;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, z] of ring) {
      const a = x * ux + z * uz;
      const b = -x * uz + z * ux;
      a0 = Math.min(a0, a);
      a1 = Math.max(a1, a);
      b0 = Math.min(b0, b);
      b1 = Math.max(b1, b);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uz, a0, a1, b0, b1 };
  }
  if (!best) return null;
  const { ux, uz, a0, a1, b0, b1 } = best;
  const ca = (a0 + a1) / 2;
  const cb = (b0 + b1) / 2;
  let len = a1 - a0;
  let wid = b1 - b0;
  let ang = Math.atan2(uz, ux);
  if (wid > len) {
    [len, wid] = [wid, len];
    ang += Math.PI / 2;
  }
  return { cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, len, wid, ang };
}

function finishRing(ring, eps) {
  if (!ring || ring.length < 4) return null;
  const simplified = windNegative(rdpRing(ring, eps));
  if (simplified.length < 4 || Math.abs(ringArea(simplified)) < 400) return null;
  return simplified;
}

function harbourMaskTrace(ras, lab, islandId, kowloonId, seedIndex, shoreReach) {
  const limit = Math.ceil(shoreReach / ras.res);
  const toIsland = distanceTo(ras, lab, islandId, limit);
  const toKowloon = distanceTo(ras, lab, kowloonId, limit);
  const { w, h, d } = ras;
  const mask = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (d[p] !== WATER) continue;
    if (toIsland[p] > 0 && toIsland[p] <= limit && toKowloon[p] > 0 && toKowloon[p] <= limit) mask[p] = 1;
  }
  // Keep the connected band that holds the harbour seed; otherwise the largest band.
  const seen = new Int32Array(w * h);
  let best = null;
  let bestN = 0;
  let seedComp = 0;
  const stack = [];
  let comp = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    comp++;
    let n = 0;
    stack.push(s);
    seen[s] = comp;
    while (stack.length) {
      const p = stack.pop();
      n++;
      const i = p % w;
      const j = (p - i) / w;
      const look = (nidx) => {
        if (mask[nidx] && !seen[nidx]) {
          seen[nidx] = comp;
          stack.push(nidx);
        }
      };
      if (i > 0) look(p - 1);
      if (i + 1 < w) look(p + 1);
      if (j > 0) look(p - w);
      if (j + 1 < h) look(p + w);
    }
    if (seedIndex >= 0 && seen[seedIndex] === comp) seedComp = comp;
    if (n > bestN) {
      bestN = n;
      best = comp;
    }
  }
  const keep = seedComp || best;
  if (!keep) return [];
  for (let p = 0; p < w * h; p++) mask[p] = seen[p] === keep ? keep : 0;
  return traceLabel(ras, mask, keep);
}

export function buildHkHarbour({
  coast = null,
  piers = null,
  parks = null,
  toWorld,
  box = HK_ISLAND_KOWLOON_BBOX,
  res = RES,
  seed: seedLonLat = HARBOUR_SEED,
  shoreReach = SHORE_REACH,
  log = null
} = {}) {
  if (typeof toWorld !== 'function') throw new Error('buildHkHarbour requires toWorld');
  const bounds = worldBox(toWorld, box);
  const coastLines = snapCoastEnds(collectOsmLines(coast, toWorld, isCoast), bounds);
  const waterLines = collectOsmLines(coast, toWorld, isWater);
  if (!coastLines.length && !waterLines.length) {
    throw new Error('Hong Kong coast file has no coastline or water. Fetch with: bash tools/fetch-hk.sh --osm-only');
  }
  const ras = makeRaster(bounds, res);
  for (const line of coastLines) paintRing(ras, line.ring, BARRIER);
  sealBorder(ras);
  dilateBarriers(ras);
  const [sx, sz] = toWorld(seedLonLat.lon, seedLonLat.lat);
  const seed = nearestOpen(ras, sx, sz, 40);
  if (seed < 0) throw new Error('Victoria Harbour seed fell on the coastline. Check the coast extract.');
  flood(ras, [seed]);
  const { lab } = labelLand(ras);
  const [cx, cz] = toWorld(HK_PLACES.central.lon, HK_PLACES.central.lat);
  const [tx, tz] = toWorld(HK_PLACES.tst.lon, HK_PLACES.tst.lat);
  const islandId = labelNear(ras, lab, cx, cz, 40);
  const kowloonId = labelNear(ras, lab, tx, tz, 50);
  if (!islandId || !kowloonId || islandId === kowloonId) {
    const at = (x, z) => {
      const p = cellIndex(ras, x, z);
      return p < 0 ? 'out' : ras.d[p] === WATER ? 'water' : ras.d[p] === BARRIER ? 'barrier' : 'land';
    };
    throw new Error(`Hong Kong Island and Kowloon did not separate across Victoria Harbour (Central ${at(cx, cz)}, TST ${at(tx, tz)}, labels ${islandId}/${kowloonId}). The coast extract is incomplete.`);
  }
  const island = finishRing(traceLabel(ras, lab, islandId), 10);
  const kowloon = finishRing(traceLabel(ras, lab, kowloonId), 12);
  const harbourRing = finishRing(harbourMaskTrace(ras, lab, islandId, kowloonId, seed, shoreReach), 14);
  if (!island || !kowloon || !harbourRing) throw new Error('Hong Kong shore trace was empty');
  if (!pointInRing(cx, cz, island)) throw new Error('Central is not inside the Hong Kong Island ring');
  if (!pointInRing(tx, tz, kowloon)) throw new Error('Tsim Sha Tsui is not inside the Kowloon ring');

  const named = [];
  for (const line of waterLines) {
    if (line.ring.length < 4) continue;
    const area = Math.abs(ringArea(line.ring));
    if (area < 20000) continue;
    const [mx, mz] = centroid(line.ring);
    const name = line.name || '';
    const calledHarbour = /victoria harbour|victoria harbor/i.test(name);
    if (!calledHarbour && (mz > cz + 400 || mz < tz - 400)) continue;
    const finished = finishRing(line.ring, 12);
    if (!finished) continue;
    if (pointInRing(cx, cz, finished) || pointInRing(tx, tz, finished)) continue;
    named.push({ name: name || 'Victoria Harbour', ring: finished, area, calledHarbour });
  }
  named.sort((a, b) => (b.calledHarbour - a.calledHarbour) || (b.area - a.area));
  const harbourRings = [harbourRing];
  for (const water of named) {
    if (harbourRings.some((ring) => Math.abs(Math.abs(ringArea(ring)) - water.area) < water.area * 0.05)) continue;
    harbourRings.push(water.ring);
    if (harbourRings.length >= 4) break;
  }

  const shores = [island, kowloon];
  function nearShore(x, z) {
    let best = Infinity;
    for (const ring of shores) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xa, za] = ring[j];
        const [xb, zb] = ring[i];
        const dx = xb - xa;
        const dz = zb - za;
        const L2 = dx * dx + dz * dz || 1e-9;
        let t = ((x - xa) * dx + (z - za) * dz) / L2;
        t = Math.max(0, Math.min(1, t));
        best = Math.min(best, Math.hypot(xa + t * dx - x, za + t * dz - z));
      }
    }
    return best;
  }
  const pierLines = collectOsmLines(piers, toWorld, isPier);
  const piersOut = [];
  for (const pier of pierLines) {
    if (pier.ring.length < 4) continue;
    const area = Math.abs(ringArea(pier.ring));
    if (area < MIN_PIER_AREA || area > MAX_PIER_AREA) continue;
    const box = orientedBox(pier.ring);
    if (!box || box.len < 8 || box.wid < 3) continue;
    if (nearShore(box.cx, box.cz) > 90) continue;
    const ring = finishRing(pier.ring, 1.5) || windNegative(pier.ring);
    piersOut.push({ name: pier.name, ...box, area: Math.round(area), ring });
  }
  piersOut.sort((a, b) => b.area - a.area);
  const pierKept = [];
  for (const pier of piersOut) {
    if (pierKept.some((other) => Math.hypot(other.cx - pier.cx, other.cz - pier.cz) < 12 && other.name === pier.name)) continue;
    pierKept.push(pier);
  }

  const parkLines = parks ? collectOsmLines(parks, toWorld, (tags) => tags.leisure === 'park' || tags.leisure === 'garden' || tags.boundary === 'national_park' || tags.leisure === 'nature_reserve') : [];
  const parkShapes = [];
  for (const park of parkLines) {
    const area = Math.abs(ringArea(park.ring));
    if (area < 800 || park.ring.length < 4) continue;
    const ring = finishRing(park.ring, 2);
    if (!ring) continue;
    parkShapes.push({ name: park.name, cat: park.tags.leisure || park.tags.boundary || '', acres: Math.round(area / 4046.86 * 10) / 10, rings: [ring] });
  }

  const islands = {};
  const [ax, az] = toWorld(HK_PLACES.admiralty.lon, HK_PLACES.admiralty.lat);
  const report = {
    coastWays: coastLines.length,
    waterRings: named.length,
    islandPts: island.length,
    kowloonPts: kowloon.length,
    harbourPts: harbourRing.length,
    harbourRings: harbourRings.length,
    piers: pierKept.length,
    parks: parkShapes.length,
    islandKm2: Math.abs(ringArea(island)) / 1e6,
    kowloonKm2: Math.abs(ringArea(kowloon)) / 1e6,
    harbourKm2: Math.abs(ringArea(harbourRing)) / 1e6,
    centralInsideIsland: pointInRing(cx, cz, island),
    tstInsideKowloon: pointInRing(tx, tz, kowloon),
    admiraltyInsideIsland: pointInRing(ax, az, island)
  };
  if (log) {
    log(`Victoria Harbour ${report.harbourKm2.toFixed(2)} km² (${report.harbourRings} rings, ${report.harbourPts} pts) between Island ${report.islandKm2.toFixed(2)} km² and Kowloon ${report.kowloonKm2.toFixed(2)} km²`);
    log(`piers ${report.piers}, parks ${report.parks}, coastline pieces ${report.coastWays}`);
  }
  return {
    island,
    kowloon,
    harbourRings,
    harbourName: named.find((w) => w.calledHarbour)?.name || 'Victoria Harbour',
    islands,
    piers: pierKept,
    parks: parkShapes,
    places: {
      central: [cx, cz],
      tst: [tx, tz],
      admiralty: [ax, az]
    },
    report
  };
}

export function resolveHkExtraInputs({ env = process.env, moduleDir, exists = fs.existsSync } = {}) {
  if (!moduleDir) throw new Error('moduleDir is required');
  const dataRoot = env.GEO_DATA || path.join(moduleDir, 'data');
  const hkDir = env.GEO_HK_DATA || path.join(dataRoot, 'hk');
  const sampleCoast = path.join(moduleDir, 'data', 'hk', 'samples', 'harbour-coast.json');
  const samplePiers = path.join(moduleDir, 'data', 'hk', 'samples', 'harbour-piers.json');
  const fullCoast = path.join(hkDir, 'osm_coast.json');
  const fullPiers = path.join(hkDir, 'osm_piers.json');
  const fullParks = path.join(hkDir, 'osm_parks.json');

  let coast;
  let usedSampleCoast = false;
  if (env.GEO_HK_COAST) {
    coast = env.GEO_HK_COAST;
    if (!exists(coast)) throw new Error(`GEO_HK_COAST not found: ${coast}`);
  } else if (exists(fullCoast)) coast = fullCoast;
  else if (exists(sampleCoast)) {
    coast = sampleCoast;
    usedSampleCoast = true;
  } else throw new Error('Hong Kong coast file not found. Run bash tools/fetch-hk.sh --osm-only');

  let pierFile = null;
  if (env.GEO_HK_PIERS) {
    if (!exists(env.GEO_HK_PIERS)) throw new Error(`GEO_HK_PIERS not found: ${env.GEO_HK_PIERS}`);
    pierFile = env.GEO_HK_PIERS;
  } else if (exists(fullPiers)) pierFile = fullPiers;
  else if (exists(samplePiers)) pierFile = samplePiers;

  let parkFile = null;
  if (exists(fullParks)) parkFile = fullParks;
  return { coast, pierFile, parkFile, usedSampleCoast };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && process.argv[1].endsWith('geo-hk-extra.mjs')) {
  const frame = createFrame('hk');
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const inputs = resolveHkExtraInputs({ moduleDir });
  const built = buildHkHarbour({
    coast: readJson(inputs.coast),
    piers: inputs.pierFile ? readJson(inputs.pierFile) : null,
    parks: inputs.parkFile ? readJson(inputs.parkFile) : null,
    toWorld: frame.toWorld,
    log: console.log
  });
  console.log(`coast ${inputs.coast}${inputs.usedSampleCoast ? ' (sample)' : ''}`);
  console.log(`piers ${inputs.pierFile || '(none)'}`);
  console.log(`Central ${built.places.central.map((v) => v.toFixed(1))}  TST ${built.places.tst.map((v) => v.toFixed(1))}  Admiralty ${built.places.admiralty.map((v) => v.toFixed(1))}`);
}
