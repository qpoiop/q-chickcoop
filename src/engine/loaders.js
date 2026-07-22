import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Shared GLTF loader + helpers. Async loads never block the game loop; the
// world renders primitive fallbacks until real meshes arrive, then swaps in.

const loader = new GLTFLoader();

/** Load a GLB. Resolves with { scene, animations } or null on failure. */
export function loadGLB(url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }),
      undefined,
      (err) => { console.warn('[assets] load failed:', url, err); resolve(null); },
    );
  });
}

/** Uniform scale factor so a model's largest axis equals `targetLen`. */
export function fitScale(object3d, targetLen) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  box.getSize(size);
  return targetLen / (Math.max(size.x, size.y, size.z) || 1);
}

/** Fit by height only (characters), returns scale to reach `targetH`. */
export function fitHeight(object3d, targetH) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  box.getSize(size);
  return targetH / (size.y || 1);
}

/** Clamp metalness across a subtree so bloom/lighting reads consistently. */
export function tuneMaterials(root, { metalness = 0.3, shadow = true, additive = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.frustumCulled = false;
    if (shadow) o.castShadow = true;
    if (!o.material) return;
    if (additive) {
      o.material.transparent = true;
      o.material.depthWrite = false;
      o.material.blending = THREE.AdditiveBlending;
    } else if (o.material.metalness !== undefined) {
      o.material.metalness = Math.min(o.material.metalness ?? metalness, metalness);
    }
  });
}
