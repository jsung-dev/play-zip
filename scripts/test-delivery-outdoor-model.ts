import assert from "node:assert/strict";
import * as THREE from "three";
import { OUTDOOR_ADS, OUTDOOR_AD_FORMATS, OVERHEAD_ADS } from "../data/delivery-outdoor-ads";
import { createSceneArt } from "../components/delivery/three/scene-art";
import { createOutdoorAdResources } from "../components/delivery/three/outdoor-ad-material";
import { createOutdoorAdvertisement, createOverheadAdvertisement } from "../components/delivery/three/outdoor-ad-model";
import { createAdvertisementBuilding } from "../components/delivery/three/advertisement-building";
import { getRouteFrame } from "../data/delivery-map";
import { buildStreetLayout, polygonsOverlap, rectangle, advertisementSightlines } from "../components/delivery/three/street-layout";
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
  if(corner){
    const host=createAdvertisementBuilding(ad,art);
    host.position.copy(transform.position);host.rotation.y=transform.yaw;host.updateMatrixWorld(true);
    for(const {from,to} of advertisementSightlines([ad])){
      const direction=to.clone().sub(from),ray=new THREE.Raycaster(from,direction.clone().normalize(),0,direction.length()-.05);
      assert.equal(ray.intersectObject(host,true).length,0,`${ad.id}: redesigned host must not hide the unchanged creative`);
    }
  }
}
for(const ad of OVERHEAD_ADS){
const overhead=createOverheadAdvertisement(ad,art,resources), frame=getRouteFrame(ad.distance,ad.route??"main");
assert(overhead.position.distanceTo(frame.position)<1e-8&&overhead.rotation.y===frame.yaw);
const panel=overhead.getObjectByName(`outdoor-ad:${ad.id}`) as THREE.Mesh;
assert.equal(panel.scale.x/panel.scale.y,4);
assert.equal((panel.material as THREE.Material).userData.state,"fallback");
assert.equal(panel.material,resources.material({id:"shared-banner",format:"banner",image:null}),"Overhead shares existing banner texture/material");
assert(overhead.userData.clearance>7,`${ad.id}: open span above camera and vehicles`);
assert(ad.supportSpan/2-.325>(ad.route?4.6:7.8),"Support feet outside riding (and main-road bus) lanes");
for(const side of [-1,1]){
  const p=frame.position.clone().addScaledVector(frame.lateral,side*ad.supportSpan/2);
  const footprint=rectangle(p,frame.yaw,-.325,.325,-.695,.055);
  for(const lot of buildStreetLayout())assert(!polygonsOverlap(footprint,lot.footprint),`${ad.id}: gantry support cannot intrude into ${lot.id}`);
}
overhead.position.set(0,0,0);overhead.rotation.set(0,0,0);overhead.updateMatrixWorld(true);
// A ray along each lane below the banner must not hit any support/frame.
const raycaster=new THREE.Raycaster();
for(const x of ad.route?[-4.2,-2.5,0,2.5,4.2]:[-6.1,-2.5,0,2.5,6.1])for(const y of [.5,2.5,5.7]){
  raycaster.set(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,-1));
  assert.equal(raycaster.intersectObject(overhead,true).length,0,`${ad.id}: road/camera corridor remains open`);
}
}
console.log(`Verified ${OUTDOOR_ADS.length} existing ads and ${OVERHEAD_ADS.length} 4:1 overhead banners: fallback, shared material, support clearance, unobstructed riding.`);
