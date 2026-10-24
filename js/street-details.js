import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { HK_CORE_BBOX, hkCentralSignSites } from './city-config.js';

// Central shop fascias, vertical blades, and bilingual street plates inside the CBD box.

const HK_SIGN_FONT = '"PingFang HK","PingFang TC","Microsoft JhengHei","Noto Sans CJK TC","Noto Sans TC","WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif';

function createHkSignTexture(site) {
  const vertical = site.kind === 'blade';
  const plate = site.kind === 'plate';
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 128 : 512;
  canvas.height = vertical ? 512 : plate ? 160 : 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = site.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = plate ? '#1a1a1a' : site.fg;
  ctx.lineWidth = plate ? 10 : 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = site.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.font = `700 72px ${HK_SIGN_FONT}`;
    const chars = Array.from(site.text);
    const gap = (canvas.height - 36) / Math.max(1, chars.length);
    chars.forEach((ch, i) => ctx.fillText(ch, canvas.width / 2, 22 + gap * (i + 0.5)));
  } else if (plate) {
    ctx.font = `700 54px ${HK_SIGN_FONT}`;
    ctx.fillText(site.text, canvas.width / 2, 62);
    ctx.font = `600 26px ${HK_SIGN_FONT}`;
    ctx.fillText(site.sub || '', canvas.width / 2, 114);
  } else {
    ctx.font = `700 58px ${HK_SIGN_FONT}`;
    ctx.fillText(site.text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildStreetDetails(scene) {
  const group = new THREE.Group();
  group.name = 'HongKongStreetDetails';
  const sites = hkCentralSignSites();
  const byKey = new Map();
  const poles = [];
  for (const site of sites) {
    const key = `${site.kind}|${site.text}|${site.sub || ''}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(site);
    if (site.kind === 'blade') poles.push(site);
  }
  const dummy = new THREE.Object3D();
  const plane = new THREE.PlaneGeometry(1, 1);
  for (const bucket of byKey.values()) {
    const sample = bucket[0];
    const map = createHkSignTexture(sample);
    const mat = new THREE.MeshStandardNodeMaterial({
      map,
      emissive: new THREE.Color(sample.fg),
      emissiveMap: map,
      emissiveIntensity: sample.kind === 'plate' ? 0.18 : 0.9,
      roughness: 0.4,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    mat.toneMapped = sample.kind === 'plate';
    const mesh = new THREE.InstancedMesh(plane, mat, bucket.length);
    mesh.name = sample.kind === 'plate' ? 'HkStreetPlates' : 'HkShopSigns';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    for (let i = 0; i < bucket.length; i++) {
      const site = bucket[i];
      dummy.position.set(site.x, site.y, site.z);
      dummy.rotation.set(0, site.rotY, 0);
      dummy.scale.set(site.w, site.h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (poles.length) {
    const poleMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a3036, roughness: 0.46, metalness: 0.72 });
    const poleGeo = new THREE.BoxGeometry(1, 1, 1);
    poleGeo.translate(0, 0.5, 0);
    const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, poles.length);
    poleMesh.name = 'HkSignPoles';
    for (let i = 0; i < poles.length; i++) {
      const site = poles[i];
      const bottom = site.y - site.h * 0.5;
      const poleH = Math.max(0.3, bottom - 0.25);
      dummy.position.set(site.x, 0.25, site.z);
      dummy.rotation.set(0, site.rotY, 0);
      dummy.scale.set(0.12, poleH, 0.12);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);
    }
    poleMesh.instanceMatrix.needsUpdate = true;
    poleMesh.computeBoundingSphere();
    group.add(poleMesh);
  }
  scene.add(group);
  const blades = sites.filter((site) => site.kind === 'blade').length;
  const plates = sites.filter((site) => site.kind === 'plate').length;
  console.info(
    `[streetDetails] Central signs ${sites.length} (blades ${blades}, plates ${plates}) ` +
    `inside ${HK_CORE_BBOX.south},${HK_CORE_BBOX.west},${HK_CORE_BBOX.north},${HK_CORE_BBOX.east}`
  );
  return { group, footprints: [], signalClock: uniform(0), audioSignals: [], update() {} };
}

export { buildStreetDetails };
