// Central city floor from the OSM coast ring already in GEO.
// The coast plate is the whole island. This clip keeps only land inside the
// Central box, so Victoria Harbour (water outside the ring, including the
// north edge of the box) stays water. Gardens and large parks become lawns.
// Promenades, the pier waterfront, and Statue Square stay paved.

// Just above the coast plate (y = 0) and below the asphalt ribbon, which
// starts at y = 0.02. The deck, curb, and sidewalk stay the surfaces you drive.
export const HK_CITY_FLOOR_Y = 0.012;
// Above the floor, still below the asphalt top (0.02 + 0.055).
export const HK_CITY_LAWN_Y = 0.04;

const LAWN_MIN_AREA = 80;

function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 1e-3 && Math.abs(prev.z - p.z) < 1e-3) continue;
    out.push({ x: p.x, z: p.z });
  }
  if (out.length >= 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3) out.pop();
  }
  return out;
}

export function asRing(ring) {
  if (!ring || !ring.length) return [];
  if (typeof ring[0] === 'number') {
    const pts = [];
    for (let i = 0; i + 1 < ring.length; i += 2) pts.push({ x: ring[i], z: ring[i + 1] });
    return cleanRing(pts);
  }
  return cleanRing(ring);
}

export function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  }
  return area * 0.5;
}

export function pointInRing(x, z, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function clipAgainst(pts, inside, cross) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) {
        const hit = cross(prev, cur);
        if (hit) out.push(hit);
      }
      out.push(cur);
    } else if (prevIn) {
      const hit = cross(prev, cur);
      if (hit) out.push(hit);
    }
  }
  return cleanRing(out);
}

function crossAt(a, b, axis, limit) {
  const delta = b[axis] - a[axis];
  if (Math.abs(delta) < 1e-9) return null;
  const t = (limit - a[axis]) / delta;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return lerpPoint(a, b, Math.min(1, Math.max(0, t)));
}

// Sutherland–Hodgman against an axis-aligned box. The clip window is convex,
// so a concave coastline still comes back as one ring.
export function clipRingToBox(ring, box) {
  if (!box) return null;
  let pts = asRing(ring);
  if (pts.length < 3) return null;
  const edges = [
    [(p) => p.x >= box.minX, (a, b) => crossAt(a, b, 'x', box.minX)],
    [(p) => p.x <= box.maxX, (a, b) => crossAt(a, b, 'x', box.maxX)],
    [(p) => p.z >= box.minZ, (a, b) => crossAt(a, b, 'z', box.minZ)],
    [(p) => p.z <= box.maxZ, (a, b) => crossAt(a, b, 'z', box.maxZ)]
  ];
  for (const [inside, cross] of edges) {
    pts = clipAgainst(pts, inside, cross);
    if (pts.length < 3) return null;
  }
  return pts;
}

export function isCityLawn(park) {
  if (!park) return false;
  const name = String(park.name || '');
  if (/海濱|promenade|waterfront|廣場|statue square|摩天輪|observation wheel/i.test(name)) return false;
  const acres = Number(park.acres);
  if (park.cat === 'garden') return true;
  if (park.cat === 'park' && Number.isFinite(acres) && acres >= 3) return true;
  return false;
}

function ringCentroid(ring) {
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-6) {
    let x = 0;
    let z = 0;
    for (const p of ring) {
      x += p.x;
      z += p.z;
    }
    return { x: x / ring.length, z: z / ring.length };
  }
  let x = 0;
  let z = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j].x * ring[i].z - ring[i].x * ring[j].z;
    x += (ring[j].x + ring[i].x) * cross;
    z += (ring[j].z + ring[i].z) * cross;
  }
  return { x: x / (6 * area), z: z / (6 * area) };
}

export function planHkGroundFill({ island, parks, core } = {}) {
  const floor = clipRingToBox(island, core);
  const lawns = [];
  if (!floor) return { floor: null, lawns };
  for (const park of parks || []) {
    if (!isCityLawn(park)) continue;
    const rings = park.rings || [];
    for (const raw of rings) {
      const clipped = clipRingToBox(raw, core);
      if (!clipped || clipped.length < 3) continue;
      if (Math.abs(ringArea(clipped)) < LAWN_MIN_AREA) continue;
      const center = ringCentroid(clipped);
      if (!pointInRing(center.x, center.z, island)) continue;
      if (!pointInRing(center.x, center.z, floor)) continue;
      lawns.push({ name: park.name || '', ring: clipped });
    }
  }
  return { floor, lawns };
}
