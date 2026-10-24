import * as THREE from 'three/webgpu';

// Island and Kowloon coast meshes live in the city grid. This group stays empty.

function ridgeHeightAt() {
  return 0;
}

function landAt() {
  return null;
}

function buildHkHarbourLand(scene) {
  const group = new THREE.Group();
  group.name = 'Boroughs';
  scene.add(group);
  console.info('[boroughs] HK coast is the city-grid ground');
  return { group, ridgeHeightAt, landAt, colliders: [], update() {} };
}

function buildBoroughs(scene) {
  return buildHkHarbourLand(scene);
}

export { buildBoroughs, ridgeHeightAt, landAt as boroughLandAt };
