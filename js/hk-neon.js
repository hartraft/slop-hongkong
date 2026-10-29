// Dense Traditional Chinese neon on the opaque shopfront belt.
// Boards and strips stay under HK_RETAIL_BELT. They do not climb the glass.
// Real LandsD photos are left alone; signs hang on canyon gaps.

import {
  BLOCKS,
  HONG_KONG_ISLAND_COASTLINE,
  HK_CORE_WORLD,
  HK_RETAIL_BELT,
  ROADS
} from './city-config.js';
import { hkCanyonBuildings, planHkStreetCanyon } from './hk-ground-fill.js';

const DENSITY = Object.freeze({
  highway: { id: 'highway', blade: 0, fascia: 0, high: 0, rows: 0, skip: 1, highSkip: 1 },
  'des-voeux': { id: 'des-voeux', blade: 6.6, fascia: 5.2, high: 8.4, rows: 2, skip: 0.05, highSkip: 0.12 },
  side: { id: 'side', blade: 8.8, fascia: 7.0, high: 11, rows: 2, skip: 0.08, highSkip: 0.2 },
  shop: { id: 'shop', blade: 9.6, fascia: 7.6, high: 12, rows: 2, skip: 0.1, highSkip: 0.22 },
  other: { id: 'other', blade: 16, fascia: 13, high: 0, rows: 1, skip: 0.18, highSkip: 1 }
});

// Shop faces. Colours are the enamel and neon of a Central street: red, orange,
// green, blue, yellow. Each entry is one instanced texture.
export const HK_BLADE_COPY = Object.freeze([
  { text: '恒生', bg: '#c4162a', fg: '#ffe7a0' },
  { text: '茶居', bg: '#0c6b3c', fg: '#f4fff8' },
  { text: '金舖', bg: '#1a1208', fg: '#ffd56a' },
  { text: '涼茶', bg: '#e25a12', fg: '#fff6e0' },
  { text: '鐘錶', bg: '#123a8a', fg: '#e7f1ff' },
  { text: '珠寶', bg: '#6e1020', fg: '#f6e2a8' },
  { text: '酒樓', bg: '#8a1d2c', fg: '#ffd27a' },
  { text: '找換', bg: '#083830', fg: '#b8ffe6' },
  { text: '藥材', bg: '#5c1812', fg: '#f2d2a0' },
  { text: '燒味', bg: '#f0c431', fg: '#6a1020' },
  { text: '雲吞', bg: '#0e6b48', fg: '#e8ff8a' },
  { text: '冰室', bg: '#0c2c6e', fg: '#7fd4ff' },
  { text: '理髮', bg: '#2a0a22', fg: '#ffd0ea' },
  { text: '電器', bg: '#10243f', fg: '#d5e4ff' },
  { text: '眼鏡', bg: '#08324a', fg: '#ffb15a' },
  { text: '文具', bg: '#1a3a12', fg: '#e7ffb0' },
  { text: '洗衣', bg: '#14365c', fg: '#e8f4ff' },
  { text: '海味', bg: '#7a2e08', fg: '#ffe0b0' },
  { text: '茶葉', bg: '#145c28', fg: '#fff2a8' },
  { text: '餅店', bg: '#c45a18', fg: '#fff8e8' },
  { text: '麻雀', bg: '#101010', fg: '#3de07a' },
  { text: '酒吧', bg: '#a01828', fg: '#ffe8ea' },
  { text: '咖啡', bg: '#3a2414', fg: '#ffd9a0' },
  { text: '書店', bg: '#1a2744', fg: '#d7e4ff' },
  { text: '花店', bg: '#8a2048', fg: '#ffe0f0' },
  { text: '西藥', bg: '#0d5c45', fg: '#e7fff6' },
  { text: '當舖', bg: '#c9a227', fg: '#2a1408' },
  { text: '影印', bg: '#16324a', fg: '#d5f6ff' },
  { text: '銀號', bg: '#b11226', fg: '#ffe08a' },
  { text: '首飾', bg: '#4a1028', fg: '#ffd0a8' },
  { text: '參茸', bg: '#6a1c14', fg: '#f0d090' },
  { text: '粥麵', bg: '#d4521a', fg: '#fff4dc' },
  { text: '小廚', bg: '#0f4a38', fg: '#d8ffe8' },
  { text: '茶樓', bg: '#e8c43a', fg: '#24180a' },
  { text: '報攤', bg: '#1c2430', fg: '#f2f6ff' },
  { text: '鎖匙', bg: '#3a3020', fg: '#ffe7a8' },
  { text: '恒生銀行', bg: '#d01228', fg: '#ffe9b0' },
  { text: '周大福', bg: '#5c0e18', fg: '#f8e6b4' },
  { text: '六福珠寶', bg: '#140e0c', fg: '#f3e6c0' },
  { text: '參茸藥材', bg: '#6a1c14', fg: '#f6d7a4' },
  { text: '中環酒樓', bg: '#8a1d2c', fg: '#ffd27a' },
  { text: '港式茶樓', bg: '#c9a24a', fg: '#2a1608' },
  { text: '金銀首飾', bg: '#1a1208', fg: '#ffd56a' },
  { text: '海鮮酒家', bg: '#0c3a6e', fg: '#d7ecff' },
  { text: '鐘錶珠寶', bg: '#10243f', fg: '#d5e4ff' },
  { text: '萬寧藥房', bg: '#0c6b3c', fg: '#f4fff8' },
  { text: '屈臣氏', bg: '#0d5c45', fg: '#e7fff6' },
  { text: '惠康', bg: '#d01920', fg: '#ffffff' }
]);

export const HK_FASCIA_COPY = Object.freeze([
  { text: '恒生銀行', bg: '#c4162a', fg: '#ffe7a0' },
  { text: '周大福', bg: '#6e1020', fg: '#f6e2a8' },
  { text: '六福珠寶', bg: '#140e0c', fg: '#f3e6c0' },
  { text: '萬寧', bg: '#0c6b3c', fg: '#f4fff8' },
  { text: '屈臣氏', bg: '#0d5c45', fg: '#e7fff6' },
  { text: '惠康', bg: '#d01920', fg: '#ffffff' },
  { text: '茶餐廳', bg: '#f0c431', fg: '#6a1020' },
  { text: '參茸藥材', bg: '#6a1c14', fg: '#f0d090' },
  { text: '鐘錶行', bg: '#123a8a', fg: '#e7f1ff' },
  { text: '找換店', bg: '#083830', fg: '#b8ffe6' },
  { text: '中環酒樓', bg: '#8a1d2c', fg: '#ffd27a' },
  { text: '港式茶樓', bg: '#e8c43a', fg: '#24180a' },
  { text: '海鮮酒家', bg: '#0c3a6e', fg: '#d7ecff' },
  { text: '涼茶舖', bg: '#e25a12', fg: '#fff6e0' },
  { text: '燒味飯店', bg: '#c45a18', fg: '#fff3dc' },
  { text: '雲吞麵', bg: '#0e6b48', fg: '#e8ff8a' },
  { text: '金銀首飾', bg: '#1a1208', fg: '#ffd56a' },
  { text: '眼鏡公司', bg: '#08324a', fg: '#ffb15a' },
  { text: '文具圖書', bg: '#1a3a12', fg: '#e7ffb0' },
  { text: '理髮廳', bg: '#2a0a22', fg: '#ffd0ea' },
  { text: '洗衣店', bg: '#14365c', fg: '#e8f4ff' },
  { text: '電器行', bg: '#10243f', fg: '#d5e4ff' },
  { text: '地產代理', bg: '#0c2c6e', fg: '#d5ecff' },
  { text: '旅行社', bg: '#145c28', fg: '#fff2a8' },
  { text: '參茸海味', bg: '#7a2e08', fg: '#ffe0b0' },
  { text: '冰室', bg: '#0c2c6e', fg: '#7fd4ff' },
  { text: '粥麵', bg: '#d4521a', fg: '#fff4dc' },
  { text: '麻雀館', bg: '#101010', fg: '#3de07a' },
  { text: '酒吧', bg: '#a01828', fg: '#ffe8ea' },
  { text: '咖啡室', bg: '#3a2414', fg: '#ffd9a0' },
  { text: '書店', bg: '#1a2744', fg: '#d7e4ff' },
  { text: '西藥行', bg: '#0d5c45', fg: '#e7fff6' },
  { text: '影印中心', bg: '#16324a', fg: '#d5f6ff' },
  { text: '鎖匙店', bg: '#3a3020', fg: '#ffe7a8' },
  { text: '花店', bg: '#8a2048', fg: '#ffe0f0' },
  { text: '餅店', bg: '#c45a18', fg: '#fff8e8' },
  { text: '茶葉莊', bg: '#145c28', fg: '#fff2a8' },
  { text: '手機舖', bg: '#10243f', fg: '#9ad7ff' },
  { text: '保險行', bg: '#6e1020', fg: '#ffe7a0' }
]);

export function hkNeonHash(x, z, salt) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

export function hkNeonDensity(raw, { highway = false, narrow = false } = {}) {
  if (highway) return DENSITY.highway;
  const n = String(raw || '').toUpperCase();
  if (n.includes('DES VOEUX')) return DENSITY['des-voeux'];
  if (/\b(STREET|LANE|TERRACE|STRAND)\b/.test(n) || (!n && narrow)) return DENSITY.side;
  if (n.includes("QUEEN'S ROAD") || n.includes('HOLLYWOOD') || n.includes('BONHAM')) return DENSITY.shop;
  return DENSITY.other;
}

// Unit normal from the wall centre toward the carriageway.
export function hkWallStreetNormal(wall) {
  const side = wall.side || 1;
  return { nx: -wall.rx * side, nz: -wall.rz * side };
}

// Point `out` metres proud of the street face, `along` metres from the wall centre.
export function hkNeonPoint(wall, along, out) {
  const face = wall.depth * 0.5;
  const n = hkWallStreetNormal(wall);
  return {
    x: wall.x + wall.dx * along + n.nx * (face + out),
    z: wall.z + wall.dz * along + n.nz * (face + out)
  };
}

function rowStations(len, spacing) {
  const margin = 1.25;
  const usable = len - margin * 2;
  if (!(usable >= 2.2) || !(spacing > 0)) return [];
  const count = Math.max(1, Math.floor(usable / spacing));
  const step = usable / count;
  const start = -len / 2 + margin + step * 0.5;
  const stations = [];
  for (let i = 0; i < count; i++) stations.push({ along: start + i * step, step, i, count });
  return stations;
}

function pickCopy(catalog, x, z, salt, prev) {
  let i = Math.floor(hkNeonHash(x, z, salt) * catalog.length) % catalog.length;
  if (prev >= 0 && (i === prev || catalog[i].bg === catalog[prev].bg)) {
    i = (i + 1 + Math.floor(hkNeonHash(x, z, salt + 4) * 6)) % catalog.length;
  }
  return i;
}

function clampSignY(y, h) {
  const top = y + h * 0.5;
  const beltTop = HK_RETAIL_BELT - 0.25;
  if (top > beltTop) return y - (top - beltTop);
  return y;
}

function clampAlong(len, along, halfW) {
  const limit = len / 2 - 0.55 - halfW;
  if (!(limit > 0)) return null;
  if (along < -limit || along > limit) return null;
  return along;
}

function placeBlades(wall, density, signs, arms) {
  const stations = rowStations(wall.len, density.blade);
  let prev = -1;
  let kept = 0;
  for (const station of stations) {
    const h = hkNeonHash(wall.x + station.i * 0.17, wall.z, 5);
    if (station.count >= 3 && h < density.skip) continue;
    const copyIndex = pickCopy(HK_BLADE_COPY, wall.x + station.along, wall.z, 11 + station.i, prev);
    const copy = HK_BLADE_COPY[copyIndex];
    const n = Array.from(copy.text).length;
    const sizeH = Math.min(3.4, (n >= 4 ? 2.8 : 2.4) + h * 0.6);
    const sizeW = (n >= 4 ? 0.72 : 0.86) + hkNeonHash(wall.x, wall.z + station.i, 13) * 0.26;
    const jitter = (hkNeonHash(wall.x, station.along, 17) - 0.5) * Math.min(0.65, station.step * 0.12);
    const along = clampAlong(wall.len, station.along + jitter, 0.12);
    if (along == null) continue;
    const bottom = 3.15 + h * 0.35;
    const y = clampSignY(bottom + sizeH * 0.5, sizeH);
    const out = sizeW * 0.5 + 0.06;
    const pos = hkNeonPoint(wall, along, out);
    signs.push({
      kind: 'blade',
      text: copy.text,
      bg: copy.bg,
      fg: copy.fg,
      x: pos.x,
      y,
      z: pos.z,
      rotY: wall.yaw + Math.PI,
      w: sizeW,
      h: sizeH,
      tier: density.id
    });
    const armLen = out;
    const arm = hkNeonPoint(wall, along, armLen * 0.5);
    arms.push({
      x: arm.x,
      y: y + sizeH * 0.5 - 0.05,
      z: arm.z,
      rotY: wall.yaw,
      len: armLen
    });
    prev = copyIndex;
    kept++;
  }
  return kept;
}

function placeStrips(wall, density, signs, high) {
  const spacing = high ? density.high : density.fascia;
  if (!(spacing > 0)) return 0;
  const stations = rowStations(wall.len, spacing);
  let prev = -1;
  let kept = 0;
  for (const station of stations) {
    const salt = high ? 29 : 9;
    const h = hkNeonHash(wall.x + station.i * 0.23, wall.z, salt);
    const drop = high ? density.highSkip : density.skip;
    if ((high || station.count >= 3) && h < drop) continue;
    const phase = high ? station.step * 0.42 : 0;
    const copyIndex = pickCopy(HK_FASCIA_COPY, wall.x + station.along, wall.z, salt + station.i, prev);
    const copy = HK_FASCIA_COPY[copyIndex];
    const chars = Array.from(copy.text).length;
    const maxW = Math.max(2.15, station.step * 0.74);
    const w = Math.min(maxW, 1.15 + chars * 0.7 + h * 0.22);
    const jitter = (hkNeonHash(wall.x, station.along, salt + 2) - 0.5) * Math.min(0.45, station.step * 0.08);
    const along = clampAlong(wall.len, station.along + phase + jitter, w * 0.5);
    if (along == null) continue;
    const height = high ? 0.7 + h * 0.26 : 0.86 + h * 0.32;
    const y = clampSignY((high ? 6.15 : 3.45) + (h - 0.5) * (high ? 0.28 : 0.2), height);
    const pos = hkNeonPoint(wall, along, 0.16);
    const n = hkWallStreetNormal(wall);
    signs.push({
      kind: 'fascia',
      text: copy.text,
      bg: copy.bg,
      fg: copy.fg,
      x: pos.x,
      y,
      z: pos.z,
      rotY: Math.atan2(n.nx, n.nz),
      w,
      h: height,
      tier: density.id
    });
    prev = copyIndex;
    kept++;
  }
  return kept;
}

export function planHkCanyonNeon(walls) {
  const signs = [];
  const arms = [];
  let used = 0;
  let desVoeux = 0;
  let side = 0;
  let shop = 0;
  let other = 0;
  for (const wall of walls || []) {
    if (!wall || !(wall.len >= 4.8) || !(wall.depth > 0)) continue;
    if (!Number.isFinite(wall.dx) || !Number.isFinite(wall.side)) continue;
    const density = hkNeonDensity(wall.raw, { highway: wall.highway, narrow: wall.narrow });
    if (!density.rows) continue;
    const before = signs.length;
    placeBlades(wall, density, signs, arms);
    placeStrips(wall, density, signs, false);
    if (density.rows > 1) placeStrips(wall, density, signs, true);
    const added = signs.length - before;
    if (!added) continue;
    used++;
    if (density.id === 'des-voeux') desVoeux += added;
    else if (density.id === 'side') side += added;
    else if (density.id === 'shop') shop += added;
    else other += added;
  }
  return { signs, arms, walls: used, desVoeux, side, shop, other };
}

export function centralCanyonWalls() {
  return planHkStreetCanyon({
    roads: ROADS,
    buildings: hkCanyonBuildings(BLOCKS, HK_CORE_WORLD),
    core: HK_CORE_WORLD,
    island: HONG_KONG_ISLAND_COASTLINE
  }).walls;
}
