// tools/geo-frame.mjs
// City frame constants for the geodata tools. 1 unit = 1 m, x = axis east, z = axis south (north = -z).
// GEO_CITY selects the frame. The default stays New York so the committed boot geodata can still be rebuilt.
// Hong Kong numbers match docs/HK_ORIGIN.md.

export const HK_LAT0 = 22.28088;
export const HK_LON0 = 114.15979;
export const HK_THETA_DEG = 0;

export const NYC_LAT0 = 40.75318;
export const NYC_LON0 = -73.98185;
export const NYC_THETA_DEG = 29.017;

// Hong Kong Island, Kowloon (up to the Lion Rock / Kowloon Peak ridgeline), and Victoria Harbour.
// WGS84 degrees. The box keeps Green Island, Cape D'Aguilar, Stanley, and Stonecutters inside, and
// leaves out most of Lamma, Lantau, and the New Territories. A sliver of northern Lamma and Tseung Kwan O
// can still intersect the edges. Probe on 2026-10-24: about 70,247 Active buildings and 15,227 road
// centreline parts (counts, not a committed extract).
export const HK_ISLAND_KOWLOON_BBOX = Object.freeze({
  south: 22.185,
  west: 114.100,
  north: 22.360,
  east: 114.260
});

// Small window on the origin used for the committed fixture. South, west, north, east.
export const HK_SAMPLE_BBOX = Object.freeze({
  south: 22.2802,
  west: 114.1591,
  north: 22.2816,
  east: 114.1605,
  name: 'Statue Square–Chater'
});

export const LANDSD_ATTRIBUTION = 'Lands Department via CSDI Portal / DATA.GOV.HK';

export const LANDSD = Object.freeze({
  portal: 'https://portal.csdi.gov.hk/server/rest/services/common',
  attribution: LANDSD_ATTRIBUTION,
  // Page size is whatever the layer reports (3,000 on the 2026-10-24 probe) and never above 10,000.
  buildings: Object.freeze({
    key: 'buildings',
    id: 'landsd_rcd_1637211194312_35158',
    layer: 0,
    where: "Status='Active'",
    file: 'landsd-buildings.geojson',
    sampleFile: 'statue-square-buildings.geojson',
    note: 'Building polygons. BaseHeight and TopHeight are metres on Hong Kong Principal Datum. Cut 3 extrudes TopHeight - BaseHeight and skips a null pair.'
  }),
  roads: Object.freeze({
    key: 'roads',
    id: 'landsd_rcd_1637310758814_80061',
    layer: 0,
    where: '1=1',
    file: 'landsd-roads.geojson',
    sampleFile: 'statue-square-roads.geojson',
    note: 'Road Centreline. Annotation-grade stand-in for CSCL. The street graph pairs it with OSM highways for class, lanes, width, and gaps.'
  })
});

const A = 6378137.0;
const E2 = 6.69437999014e-3;

export function resolveCity(raw) {
  const value = raw == null || String(raw).trim() === '' ? 'nyc' : String(raw).trim().toLowerCase();
  if (value === 'nyc' || value === 'newyork' || value === 'new-york') return 'nyc';
  if (value === 'hk' || value === 'hongkong' || value === 'hong-kong') return 'hk';
  throw new Error(`Unknown GEO_CITY=${raw} (expected nyc or hk)`);
}

export function cityFrame(id) {
  if (id === 'hk') {
    return {
      id: 'hk',
      label: 'Hong Kong',
      originLabel: 'Central / Statue Square–Chater',
      LAT0: HK_LAT0,
      LON0: HK_LON0,
      thetaDeg: HK_THETA_DEG,
      refineBearing: false
    };
  }
  if (id === 'nyc') {
    return {
      id: 'nyc',
      label: 'New York',
      originLabel: '5th Ave & 42nd St (centreline)',
      LAT0: NYC_LAT0,
      LON0: NYC_LON0,
      thetaDeg: NYC_THETA_DEG,
      refineBearing: true
    };
  }
  throw new Error(`Unhandled city ${id}`);
}

export function projection(lat0, lon0) {
  const phi0 = (lat0 * Math.PI) / 180;
  const sin0 = Math.sin(phi0);
  const nrad = A / Math.sqrt(1 - E2 * sin0 * sin0);
  const mrad = (A * (1 - E2)) / Math.pow(1 - E2 * sin0 * sin0, 1.5);
  return {
    phi0,
    KX: (Math.PI / 180) * nrad * Math.cos(phi0),
    KY: (Math.PI / 180) * mrad,
    lon0
  };
}

// thetaRad and origin are mutable. The NYC builder refines them from the street centreline.
export function createFrame(id) {
  const spec = cityFrame(id);
  const proj = projection(spec.LAT0, spec.LON0);
  const state = {
    ...spec,
    KX: proj.KX,
    KY: proj.KY,
    thetaRad: (spec.thetaDeg * Math.PI) / 180,
    origin: [0, 0]
  };
  state.enu = (lon, lat) => [(lon - state.LON0) * state.KX, (lat - state.LAT0) * state.KY];
  state.gridUV = (lon, lat) => {
    const [e, n] = state.enu(lon, lat);
    const c = Math.cos(state.thetaRad);
    const s = Math.sin(state.thetaRad);
    return [e * c - n * s, -(e * s + n * c)];
  };
  state.toWorld = (lon, lat) => {
    const [u, v] = state.gridUV(lon, lat);
    return [u - state.origin[0], v - state.origin[1]];
  };
  return state;
}

export function layerBaseUrl(layer) {
  return `${LANDSD.portal}/${layer.id}/FeatureServer/${layer.layer}`;
}
