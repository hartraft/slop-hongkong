import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BLOCKS, HK_GLTF_CAP, HK_GLTF_SHEET, ISLAND_BOUNDS } from './city-config.js';
import {
  formatGltfLog,
  hiddenExtrudeIds,
  hk80ToWorld,
  planGltfManifest,
  resolveHkGltfRequest
} from './hk-gltf-frame.js';

// One LandsD individualised sheet, capped. The default page does not fetch it.
// GLTFLoader is a static import. index.html pins that one addon file: the jsDelivr
// `@dev` alias currently answers 403 for GLTFLoader.js ("package size exceeded").

const position = new THREE.Vector3();
const normal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

function bakeMesh(mesh) {
  const geo = mesh.geometry.clone();
  const pos = geo.getAttribute('position');
  if (!pos) return null;
  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld;
  normalMatrix.getNormalMatrix(matrix);
  const baked = new Float32Array(pos.count * 3);
  let minH = Infinity;
  for (let i = 0; i < pos.count; i++) {
    position.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    const hkpd = position.y;
    const [x, , z] = hk80ToWorld(position.x, -position.z, hkpd);
    baked[i * 3] = x;
    baked[i * 3 + 1] = hkpd;
    baked[i * 3 + 2] = z;
    if (hkpd < minH) minH = hkpd;
  }
  const shift = ISLAND_BOUNDS.sidewalkHeight - minH;
  for (let i = 0; i < pos.count; i++) baked[i * 3 + 1] += shift;
  geo.setAttribute('position', new THREE.BufferAttribute(baked, 3));
  const srcNormal = geo.getAttribute('normal');
  if (srcNormal) {
    const bakedNormal = new Float32Array(srcNormal.count * 3);
    for (let i = 0; i < srcNormal.count; i++) {
      normal.fromBufferAttribute(srcNormal, i).applyMatrix3(normalMatrix).normalize();
      bakedNormal[i * 3] = normal.x;
      bakedNormal[i * 3 + 1] = normal.y;
      bakedNormal[i * 3 + 2] = normal.z;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(bakedNormal, 3));
  } else {
    geo.computeVertexNormals();
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function tintMaps(material) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    if (mat?.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  }
}

export async function prepareHkGltfSheet(href) {
  const request = resolveHkGltfRequest(href, { configured: HK_GLTF_SHEET, cap: HK_GLTF_CAP });
  if (!request) {
    console.info('[gltf] HK_GLTF_SHEET off; LandsD extrudes cover Central');
    return null;
  }
  const manifestUrl = `./hk-3d/${request.sheet}/manifest.json`;
  let manifest;
  try {
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(String(res.status));
    manifest = await res.json();
  } catch (err) {
    console.warn(`[gltf] sheet ${request.sheet} manifest not loaded (${err.message}); extrudes stay`);
    return null;
  }
  const plan = planGltfManifest(manifest, { cap: request.cap });
  const hidden = hiddenExtrudeIds(BLOCKS, plan.selected);
  return {
    ...plan,
    sheet: manifest.sheet || request.sheet,
    hiddenIds: new Set(hidden),
    selected: plan.selected.map((entry) => ({
      ...entry,
      url: `./hk-3d/${manifest.sheet || request.sheet}/${entry.file}`
    }))
  };
}

export async function mountHkGltfBuildings(scene, plan) {
  if (!plan) return { colliders: [], loaded: 0, failed: 0, group: null };
  const group = new THREE.Group();
  group.name = 'HkIndividualModels';
  const loader = new GLTFLoader();
  const colliders = [];
  let loaded = 0;
  let failed = 0;
  for (const entry of plan.selected) {
    try {
      const gltf = await loader.loadAsync(entry.url);
      gltf.scene.updateMatrixWorld(true);
      let meshes = 0;
      gltf.scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const geo = bakeMesh(obj);
        if (!geo) return;
        tintMaps(obj.material);
        const mesh = new THREE.Mesh(geo, obj.material);
        mesh.name = 'HkGltfBuilding';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        meshes++;
      });
      if (!meshes) throw new Error('no meshes');
      colliders.push({
        minX: entry.minX,
        maxX: entry.maxX,
        minZ: entry.minZ,
        maxZ: entry.maxZ,
        maxY: ISLAND_BOUNDS.sidewalkHeight + Math.max(0, entry.maxH - entry.minH)
      });
      loaded++;
    } catch (err) {
      failed++;
      console.warn(`[gltf] skip ${entry.file || entry.url}: ${err.message}`);
    }
  }
  if (group.children.length) scene.add(group);
  const skipped = plan.skippedSpeck + plan.skippedOutside + plan.skippedCap + failed;
  console.info(formatGltfLog({
    sheet: plan.sheet,
    loaded,
    skipped,
    skippedSpeck: plan.skippedSpeck,
    skippedOutside: plan.skippedOutside,
    skippedCap: plan.skippedCap,
    hidden: plan.hiddenIds ? plan.hiddenIds.size : 0,
    sidewalk: ISLAND_BOUNDS.sidewalkHeight
  }));
  if (plan.reason) console.info(`[gltf] ${plan.reason}`);
  return { colliders, loaded, failed, group };
}
