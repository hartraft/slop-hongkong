import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ISLAND_BOUNDS,
  PLAY_BOUNDS,
  HONG_KONG_ISLAND_COASTLINE,
  KOWLOON_COASTLINE,
  BLOCKS,
  ROADS
} from './city-config.js';
import {
  createRoadSurfaceMaterial,
  createSidewalkMaterial,
  createWaterMaterial
} from './tsl-materials.js';
import { GEO } from './geo-source.js';

// Hong Kong coast, Victoria Harbour, and centreline ribbons. Lots stay in buildings.js.

/**
 * Merges static non-instanced THREE.Mesh objects sharing the same material into a single
 * batched BufferGeometry per material to minimize WebGPU render & shadow pass draw calls.
 */
function batchStaticGroupMeshes(rootGroup, excludeMaterials = null) {
  if (!mergeGeometries) return;
  rootGroup.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
  const buckets = new Map();

  rootGroup.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || !obj.geometry || !obj.material) return;
    if (excludeMaterials && excludeMaterials.has(obj.material)) return;
    const attrs = obj.geometry.attributes;
    if (!attrs.position || !attrs.normal || !attrs.uv) return;
    if (!buckets.has(obj.material)) {
      buckets.set(obj.material, []);
    }
    buckets.get(obj.material).push(obj);
  });

  for (const [mat, meshes] of buckets.entries()) {
    if (meshes.length < 2) continue;
    const geos = [];
    let anyCast = false;
    let anyReceive = false;

    for (const m of meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const key of Object.keys(g.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') {
          g.deleteAttribute(key);
        }
      }
      const relMat = new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld);
      g.applyMatrix4(relMat);
      geos.push(g);
      if (m.castShadow) anyCast = true;
      if (m.receiveShadow) anyReceive = true;
      if (m.parent) m.parent.remove(m);
    }

    const merged = mergeGeometries(geos, false);
    if (merged) {
      const batchedMesh = new THREE.Mesh(merged, mat);
      batchedMesh.castShadow = anyCast;
      batchedMesh.receiveShadow = anyReceive;
      rootGroup.add(batchedMesh);
    }
  }
}

/**
 * Helper to convert an array of world {x, z} polygon vertices into a horizontal THREE.Shape
 * in (x, -z) space so that rotating by rotateX(-Math.PI / 2) maps (x, -z, 0) -> (x, 0, z)
 * with an upward (+Y) surface normal.
 */
function createWorldXZShape(pts) {
  const shape = new THREE.Shape();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  }
  shape.closePath();
  return shape;
}

function createExtrudedPolygonMesh(pts, bottomY, height, material, receiveShadow = true, castShadow = false) {
  const shape = createWorldXZShape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bottomY, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = receiveShadow;
  mesh.castShadow = castShadow;
  return mesh;
}

function addHkRibbonMesh(group, mat, segs, y, height, name) {
  if (!segs.length) return null;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, segs.length);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    dummy.position.set(s.x, y, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(s.w, height, s.len);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

// Asphalt and sidewalks from the Hong Kong centreline only. GEO.roads is the merged
// LandsD + OSM carriageway. GEO.roadGraph is that same at-grade graph for traffic
// (road-network.js). Drawing the graph on top of the merged lines would stack two decks.
function buildHkRoadRibbons(group, roadMat, sidewalkMat) {
  const sw = (GEO.frame && GEO.frame.sidewalk) || 4.6;
  const asphaltMat = roadMat || new THREE.MeshStandardNodeMaterial({ color: 0x2c3136, roughness: 0.92, metalness: 0.02 });
  asphaltMat.name = 'hkRoadCentreline';
  const roads = [];
  const walks = [];
  for (const road of ROADS) {
    const width = Math.max(4.5, road.w || 8);
    const pts = road.pts || [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      const yaw = Math.atan2(dx, dz);
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const rx = -dz / len;
      const rz = dx / len;
      roads.push({
        x: mx,
        z: mz,
        w: width,
        len: len + Math.min(width * 0.28, 4),
        yaw
      });
      const side = width * 0.5 + sw * 0.45;
      const slab = len + Math.min(sw, 2.5);
      walks.push({ x: mx + rx * side, z: mz + rz * side, w: sw * 0.9, len: slab, yaw });
      walks.push({ x: mx - rx * side, z: mz - rz * side, w: sw * 0.9, len: slab, yaw });
    }
  }
  addHkRibbonMesh(group, asphaltMat, roads, 0.02, 0.04, 'HkRoadCentrelines');
  if (sidewalkMat) addHkRibbonMesh(group, sidewalkMat, walks, 0.012, 0.1, 'HkSidewalks');
  const graphLinks = GEO.roadGraph && GEO.roadGraph.links ? GEO.roadGraph.links.length : 0;
  console.info(`[roads] HK centreline ribbons ${roads.length} sidewalks ${walks.length} roadGraph links ${graphLinks}`);
}

function buildHkPierDecks(group) {
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x8d8880, roughness: 0.82, metalness: 0.04 });
  mat.name = 'hkPierDeck';
  const geos = [];
  for (const p of GEO.piers || []) {
    const ring = p.ring;
    if (!ring || ring.length < 6) continue;
    const pts = [];
    for (let i = 0; i < ring.length; i += 2) pts.push({ x: ring[i], z: ring[i + 1] });
    if (pts.length < 3) continue;
    try {
      geos.push(createExtrudedPolygonMesh(pts, 0.02, 0.32, mat, true, false).geometry);
    } catch {
      // A bad ring must not drop the rest of the harbour decks.
    }
  }
  if (!geos.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
  mesh.name = 'HkPierDecks';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
}

function createFlatPolygonMesh(pts, y, material, receiveShadow = true) {
  const shape = createWorldXZShape(pts);
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function buildCityGrid(scene) {
  return buildHkCityGrid(scene);
}

// Coast rings become land. Carriageways and sidewalks are ribbons on GEO.roads.
// Victoria Harbour water uses PLAY_BOUNDS (Island + Kowloon + harbour).
function buildHkCityGrid(scene) {
  const group = new THREE.Group();
  group.name = 'HongKongCityGrid';

  const play = PLAY_BOUNDS || ISLAND_BOUNDS;
  const waterMat = createWaterMaterial();
  const pad = 3200;
  const waterGeo = new THREE.PlaneGeometry(
    (play.maxX - play.minX) + pad * 2,
    (play.maxZ - play.minZ) + pad * 2,
    1,
    1
  );
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'VictoriaHarbourWater';
  waterMesh.position.set((play.minX + play.maxX) * 0.5, play.waterLevel, (play.minZ + play.maxZ) * 0.5);
  group.add(waterMesh);

  const landMat = new THREE.MeshStandardNodeMaterial({
    color: 0x6a7264,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide
  });
  landMat.name = 'hkCoastLand';
  const seawallMat = new THREE.MeshStandardNodeMaterial({
    color: 0x5c5a55,
    roughness: 0.82,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  for (const ring of [HONG_KONG_ISLAND_COASTLINE, KOWLOON_COASTLINE]) {
    if (!ring || ring.length < 3) continue;
    const land = createFlatPolygonMesh(ring, 0.0, landMat, true);
    land.name = 'HongKongCoastGround';
    group.add(land);
    const wall = createExtrudedPolygonMesh(ring, -2.35, 2.31, seawallMat, true, false);
    wall.name = 'HongKongCoastSeawall';
    group.add(wall);
  }

  const roadMat = createRoadSurfaceMaterial();
  const sidewalkMat = createSidewalkMaterial();
  buildHkRoadRibbons(group, roadMat, sidewalkMat);
  buildHkPierDecks(group);

  const roadSidewalks = [];
  for (const b of BLOCKS) {
    if (b.park > 0.6 || b.median) continue;
    if (b.maxX - b.minX < 0.5 || b.maxZ - b.minZ < 0.5) continue;
    roadSidewalks.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
  }


  batchStaticGroupMeshes(group, new Set([waterMat, roadMat, sidewalkMat, landMat]));
  scene.add(group);
  console.info(`[ground] HK coast rings ${HONG_KONG_ISLAND_COASTLINE.length}+${KOWLOON_COASTLINE.length} water ${play.minX.toFixed(0)}..${play.maxX.toFixed(0)} x ${play.minZ.toFixed(0)}..${play.maxZ.toFixed(0)}`);
  return { group, sidewalks: roadSidewalks, footprints: [], highwayLanes: [], colliders: [] };
}

export { buildCityGrid, batchStaticGroupMeshes };
