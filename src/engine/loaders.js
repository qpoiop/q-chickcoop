import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Deep-clone a model, correctly rebinding skinned meshes to a cloned skeleton.
// Plain Object3D.clone(true) shares/breaks the skeleton → skinned clones render
// collapsed or invisible; SkeletonUtils.clone is the correct path.
export function cloneSkinned(root) { return skeletonClone(root); }

// Shared GLTF loader + helpers. Async loads never block the game loop; the
// world renders primitive fallbacks until real meshes arrive, then swaps in.

// City map ships meshopt-compressed (EXT_meshopt_compression) — the decoder is a
// pure-JS module, no external wasm to host.
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** Load a GLB. Resolves with { scene, animations } or null on failure.
 *  onProg(loaded, total) reports download bytes for boot progress UI. */
export function loadGLB(url, onProg) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }),
      onProg ? (e) => onProg(e.loaded || 0, e.total || 0) : undefined,
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
  const box = characterBox(object3d);
  const size = new THREE.Vector3();
  box.getSize(size);
  return targetH / (size.y || 1);
}

/**
 * Bounding box of a character. Skinned meshes MUST be measured via skeleton
 * bones — their geometry bbox is the collapsed bind pose, which makes a naive
 * setFromObject fit blow the scale up ~100×. Static meshes use the mesh bbox.
 */
export function characterBox(root) {
  let sk = null;
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) sk = o; });
  if (sk && sk.skeleton.bones.length) {
    root.updateWorldMatrix(true, true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    sk.skeleton.bones.forEach((bo) => { bo.getWorldPosition(v); b.expandByPoint(v.clone()); });
    if (!b.isEmpty()) return b;
  }
  return new THREE.Box3().setFromObject(root);
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
