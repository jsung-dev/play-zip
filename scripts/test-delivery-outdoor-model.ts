import assert from "node:assert/strict";
import * as THREE from "three";
import { OUTDOOR_ADS, OUTDOOR_AD_FORMATS } from "../data/delivery-outdoor-ads";
import { createSceneArt } from "../components/delivery/three/scene-art";
import { createOutdoorAdResources } from "../components/delivery/three/outdoor-ad-material";
import { createOutdoorAdvertisement } from "../components/delivery/three/outdoor-ad-model";
import { advertisementTransform, isLandmark } from "../components/delivery/three/scene-layout";
const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillText() {}, measureText: (s: string) => ({ width: s.length * 40 }) };
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
const art = createSceneArt(), resources = createOutdoorAdResources();
for (const ad of OUTDOOR_ADS) {
  const group = createOutdoorAdvertisement(ad, art, resources), transform = advertisementTransform(ad);
  assert(group.position.distanceTo(transform.position) < 1e-8 && group.rotation.y === transform.yaw, `${ad.id}: placement`);
  const panel = group.getObjectByName(`outdoor-ad:${ad.id}`) as THREE.Mesh;
  assert(panel && Math.abs(panel.scale.x / panel.scale.y - OUTDOOR_AD_FORMATS[ad.format].ratio) < 1e-10, `${ad.id}: rendered ratio`);
  assert(panel.scale.x === ad.width && panel.position.y === ad.height, `${ad.id}: configured dimensions`);
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  group.traverse(child => {
    if (child instanceof THREE.Mesh && !Array.isArray(child.material) && !child.material.transparent) {
      child.geometry.computeBoundingBox(); bounds.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld));
    }
  });
  const corner = isLandmark(ad), halfWidth = (ad.width + (corner ? 1.85 : 1.1)) / 2;
  assert(bounds.min.x >= -halfWidth - .001 && bounds.max.x <= halfWidth + .001, `${ad.id}: width envelope`);
  assert(bounds.min.z >= (corner ? -6.5 : -1.25) - .001 && bounds.max.z <= (corner ? 1.2 : 1.05) + .001, `${ad.id}: depth envelope`);
}
console.log(`Verified actual geometry, frame/footprint envelope and exact planes for all ${OUTDOOR_ADS.length} installations.`);
