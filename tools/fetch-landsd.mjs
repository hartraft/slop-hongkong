#!/usr/bin/env node
// Paginated CSDI FeatureServer fetch for LandsD Building and Road Centreline.
//
//   node tools/fetch-landsd.mjs --sample
//   node tools/fetch-landsd.mjs --out tools/data/hk
//   node tools/fetch-landsd.mjs --layer buildings --bbox 22.185,114.100,22.360,114.260
//
// The default bbox is Hong Kong Island + Kowloon + Victoria Harbour (tools/geo-frame.mjs).
// Full extracts are multi‑tens of MB. tools/fetch-hk.sh writes them under tools/data/hk/, which is gitignored.
// --sample refreshes the small Statue Square fixture that is safe to commit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HK_ISLAND_KOWLOON_BBOX, HK_SAMPLE_BBOX, LANDSD, layerBaseUrl } from './geo-frame.mjs';

export const USER_AGENT = 'slop-hongkong-geodata/1.0';
export const PAGE_CAP = 10000;
export const TILE_STEP_DEG = 0.04;
export const MAX_OFFSET = 9000;
export const MAX_DEPTH = 8;

const LAYERS = { buildings: LANDSD.buildings, roads: LANDSD.roads };

export function spanCount(span, step) {
  if (!(span > 0) || !(step > 0)) throw new Error('span and step must be positive');
  const nearest = Math.round(span / step);
  if (nearest >= 1 && Math.abs(span - nearest * step) <= step * 1e-6) return nearest;
  return Math.max(1, Math.ceil(span / step - 1e-9));
}

export function tileBbox(bounds, step) {
  const rows = spanCount(bounds.north - bounds.south, step);
  const cols = spanCount(bounds.east - bounds.west, step);
  const tiles = [];
  const latSpan = bounds.north - bounds.south;
  const lonSpan = bounds.east - bounds.west;
  for (let row = 0; row < rows; row++) {
    const south = bounds.south + (latSpan * row) / rows;
    const north = bounds.south + (latSpan * (row + 1)) / rows;
    for (let col = 0; col < cols; col++) {
      const west = bounds.west + (lonSpan * col) / cols;
      const east = bounds.west + (lonSpan * (col + 1)) / cols;
      tiles.push({ south, west, north, east });
    }
  }
  return tiles;
}

export function splitBbox(bounds) {
  const midLat = (bounds.south + bounds.north) / 2;
  const midLon = (bounds.west + bounds.east) / 2;
  return [
    { south: bounds.south, west: bounds.west, north: midLat, east: midLon },
    { south: bounds.south, west: midLon, north: midLat, east: bounds.east },
    { south: midLat, west: bounds.west, north: bounds.north, east: midLon },
    { south: midLat, west: midLon, north: bounds.north, east: bounds.east }
  ];
}

export function pageShouldContinue({ received, pageSize, exceeded }) {
  if (received <= 0) return false;
  if (received < pageSize) return false;
  if (exceeded === false) return false;
  return true;
}

export function featureKey(feature) {
  if (feature.id != null && feature.id !== '') return `id:${feature.id}`;
  const props = feature.properties || {};
  const oid = props.OBJECTID ?? props.objectid ?? props.ObjectId;
  if (oid != null) return `oid:${oid}`;
  return null;
}

export function mergeFeatures(features) {
  const byKey = new Map();
  const anonymous = [];
  for (const feature of features) {
    const key = featureKey(feature);
    if (key == null) anonymous.push(feature);
    else if (!byKey.has(key)) byKey.set(key, feature);
  }
  return [...byKey.values(), ...anonymous];
}

export function exceededFrom(payload) {
  if (typeof payload?.exceededTransferLimit === 'boolean') return payload.exceededTransferLimit;
  if (typeof payload?.properties?.exceededTransferLimit === 'boolean') return payload.properties.exceededTransferLimit;
  return undefined;
}

export function clampPageSize(requested, serverMax) {
  const server = Number.isFinite(serverMax) && serverMax > 0 ? serverMax : 3000;
  const asked = Number.isFinite(requested) && requested > 0 ? requested : server;
  return Math.max(1, Math.min(PAGE_CAP, server, asked));
}

export function featureQueryUrl(layerUrl, { where, bbox, outFields = '*', pageSize, offset, objectIdField = 'OBJECTID' }) {
  const url = new URL(`${String(layerUrl).replace(/\/$/, '')}/query`);
  url.searchParams.set('f', 'geojson');
  url.searchParams.set('where', where);
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outFields', outFields);
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  url.searchParams.set('geometry', JSON.stringify({
    xmin: bbox.west,
    ymin: bbox.south,
    xmax: bbox.east,
    ymax: bbox.north,
    spatialReference: { wkid: 4326 }
  }));
  url.searchParams.set('orderByFields', `${objectIdField} ASC`);
  url.searchParams.set('resultOffset', String(offset));
  url.searchParams.set('resultRecordCount', String(pageSize));
  return url;
}

export async function readJson(fetchImpl, url, options = {}) {
  const tries = options.tries ?? 5;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/geo+json, application/json' };
  let lastError = new Error('FeatureServer request failed');
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetchImpl(String(url), { headers, signal: AbortSignal.timeout(120000) });
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      if (!response.ok || !payload || payload.error) {
        const message = payload?.error?.message || String(text).slice(0, 200);
        lastError = new Error(`FeatureServer HTTP ${response.status}: ${message}`);
      } else {
        return payload;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    if (attempt < tries) await sleep(attempt * 500);
  }
  throw lastError;
}

export async function fetchTile(bounds, fetchPage, opts, depth = 0) {
  const collected = [];
  let offset = 0;
  while (offset <= 100000) {
    const page = await fetchPage(bounds, offset, opts.pageSize);
    const received = page.features.length;
    const cont = pageShouldContinue({ received, pageSize: opts.pageSize, exceeded: page.exceeded });
    if (cont && offset + received >= opts.maxOffset && depth < opts.maxDepth) {
      const parts = [];
      for (const child of splitBbox(bounds)) parts.push(...await fetchTile(child, fetchPage, opts, depth + 1));
      return parts;
    }
    collected.push(...page.features);
    if (!cont) return collected;
    offset += received;
  }
  throw new Error('FeatureServer pagination exceeded 100000 features in one tile');
}

export async function collectTiles(bounds, fetchPage, opts) {
  const tiles = tileBbox(bounds, opts.tileStep);
  const all = [];
  for (let i = 0; i < tiles.length; i++) {
    if (opts.log) opts.log(`tile ${i + 1}/${tiles.length}`);
    all.push(...await fetchTile(tiles[i], fetchPage, opts, 0));
  }
  return mergeFeatures(all);
}

export function parseBbox(text) {
  const [south, west, north, east] = String(text).split(',').map(Number);
  if (![south, west, north, east].every(Number.isFinite) || !(south < north) || !(west < east)) {
    throw new Error('bbox must be south,west,north,east in WGS84 degrees');
  }
  return { south, west, north, east };
}

export function parseArgs(argv) {
  const opts = {
    layer: 'all',
    out: null,
    sample: false,
    bbox: null,
    pageSize: 0,
    delayMs: 150,
    tileStep: TILE_STEP_DEG,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sample') opts.sample = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--layer') opts.layer = required(argv, ++i, arg);
    else if (arg === '--out') opts.out = required(argv, ++i, arg);
    else if (arg === '--bbox') opts.bbox = parseBbox(required(argv, ++i, arg));
    else if (arg === '--page-size') opts.pageSize = Number(required(argv, ++i, arg));
    else if (arg === '--delay-ms') opts.delayMs = Number(required(argv, ++i, arg));
    else if (arg === '--tile-step') opts.tileStep = Number(required(argv, ++i, arg));
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!['all', 'buildings', 'roads'].includes(opts.layer)) throw new Error('--layer must be buildings, roads, or all');
  if (opts.sample) opts.delayMs = opts.delayMs === 150 ? 0 : opts.delayMs;
  return opts;
}

function required(argv, index, flag) {
  if (index >= argv.length) throw new Error(`${flag} needs a value`);
  return argv[index];
}

export function featureCollection({ layer, bbox, pageSize, features }) {
  const body = {
    type: 'FeatureCollection',
    name: layer.key,
    attribution: LANDSD.attribution,
    crs: 'EPSG:4326',
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
    query: {
      serviceId: layer.id,
      layer: layer.layer,
      where: layer.where,
      pageSize,
      note: layer.note
    },
    fetchedAt: new Date().toISOString(),
    features
  };
  if (layer.key === 'buildings') body.height = { datum: 'HKPD', units: 'm', extrude: 'TopHeight - BaseHeight' };
  return body;
}

function help() {
  return `Usage: node tools/fetch-landsd.mjs [--sample] [--layer buildings|roads|all] [--out dir]
       [--bbox south,west,north,east] [--page-size n] [--tile-step deg] [--delay-ms n]

Default bbox (Island + Kowloon + Victoria Harbour):
  ${HK_ISLAND_KOWLOON_BBOX.south},${HK_ISLAND_KOWLOON_BBOX.west},${HK_ISLAND_KOWLOON_BBOX.north},${HK_ISLAND_KOWLOON_BBOX.east}

Services:
  buildings  ${LANDSD.buildings.id}  where ${LANDSD.buildings.where}
  roads      ${LANDSD.roads.id}  where ${LANDSD.roads.where}

Attribution: ${LANDSD.attribution}
`;
}

async function layerMeta(layerUrl, fetchImpl) {
  const url = new URL(layerUrl);
  url.searchParams.set('f', 'json');
  const data = await readJson(fetchImpl, url);
  return {
    maxRecordCount: data.maxRecordCount,
    objectIdField: data.objectIdField || 'OBJECTID'
  };
}

function makeFetchPage({ layerUrl, where, objectIdField, fetchImpl }) {
  return async (bbox, offset, pageSize) => {
    const url = featureQueryUrl(layerUrl, { where, bbox, pageSize, offset, objectIdField });
    const data = await readJson(fetchImpl, url);
    return {
      features: Array.isArray(data.features) ? data.features : [],
      exceeded: exceededFrom(data)
    };
  };
}

export async function fetchLayer(layer, { bbox, pageSize, tileStep, delayMs, fetchImpl, log }) {
  const layerUrl = layerBaseUrl(layer);
  const meta = await layerMeta(layerUrl, fetchImpl);
  const size = clampPageSize(pageSize, meta.maxRecordCount);
  const rawPage = makeFetchPage({ layerUrl, where: layer.where, objectIdField: meta.objectIdField, fetchImpl });
  const fetchPage = async (tile, offset, count) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return rawPage(tile, offset, count);
  };
  if (log) log(`${layer.key}: page ${size}, oid ${meta.objectIdField}, ${layerUrl}`);
  const features = await collectTiles(bbox, fetchPage, {
    pageSize: size,
    tileStep,
    maxOffset: MAX_OFFSET,
    maxDepth: MAX_DEPTH,
    log
  });
  return { features, pageSize: size, meta };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(help());
    return;
  }
  const bbox = opts.bbox || (opts.sample ? HK_SAMPLE_BBOX : HK_ISLAND_KOWLOON_BBOX);
  const outDir = opts.out || fileURLToPath(new URL(opts.sample ? 'data/hk/samples/' : 'data/hk/', import.meta.url));
  fs.mkdirSync(outDir, { recursive: true });
  const keys = opts.layer === 'all' ? ['buildings', 'roads'] : [opts.layer];
  const log = (...parts) => console.log('[landsd]', ...parts);
  log(`bbox S${bbox.south} W${bbox.west} N${bbox.north} E${bbox.east}`);
  for (const key of keys) {
    const layer = LAYERS[key];
    const { features, pageSize } = await fetchLayer(layer, {
      bbox,
      pageSize: opts.pageSize,
      tileStep: opts.tileStep,
      delayMs: opts.delayMs,
      fetchImpl: globalThis.fetch,
      log
    });
    const file = path.join(outDir, opts.sample ? layer.sampleFile : layer.file);
    const body = featureCollection({ layer, bbox, pageSize, features });
    fs.writeFileSync(file, `${JSON.stringify(body)}\n`);
    log(`wrote ${file} (${features.length} features, ${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('[landsd]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
