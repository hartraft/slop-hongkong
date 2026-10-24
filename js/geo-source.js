// js/geo-source.js
// Default boot stays the committed Manhattan scene. index.html?city=hk (or GEO_CITY=hk under Node)
// loads js/hk-geodata.js instead. The Hong Kong module is a dynamic import, so the NYC preload
// does not fetch it.

import { GEO as NYC_GEO } from './nyc-geodata.js';

export function resolveRuntimeCity(env = {}, search = '') {
  const query = new URLSearchParams(String(search).replace(/^\?/, '')).get('city') || '';
  const raw = (query || env.GEO_CITY || '').trim().toLowerCase();
  if (raw === 'hk' || raw === 'hongkong' || raw === 'hong-kong') return 'hk';
  return 'nyc';
}

const search = typeof location !== 'undefined' && location.search ? location.search : '';
const env = typeof process !== 'undefined' && process.env ? process.env : {};
export const RUNTIME_CITY = resolveRuntimeCity(env, search);
export const GEO = RUNTIME_CITY === 'hk' ? (await import('./hk-geodata.js')).GEO : NYC_GEO;
