// js/geo-source.js
// The shipped page is Hong Kong only. js/hk-geodata.js is a static import so index.html can
// preload it. There is no second-city boot path and no ?city= switch.

import { GEO } from './hk-geodata.js';

export function resolveRuntimeCity() {
  return 'hk';
}

export const RUNTIME_CITY = 'hk';
export { GEO };
