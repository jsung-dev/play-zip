import assert from "node:assert/strict";
import * as THREE from "three";
import { DELIVERY_STOPS, getDeliveryHouseTransform, getDrivewayDeliveryInterval } from "../data/delivery-map";
import { deliveryGuidanceWaypoints } from "../components/delivery/delivery-guidance";
import { deliveryHouseAnchors } from "../components/delivery/three/route-guidance";
import { BUILDING_SCALE } from "../components/delivery/three/scene-layout";
import { buildingProfile } from "../components/delivery/three/street-layout";

const audit=[];
for(const [index,stop] of DELIVERY_STOPS.entries()) {
  const interval=getDrivewayDeliveryInterval(index);
  // Reconstruct the model transform independently; the browser records the
  // anchor produced by the actual house mesh for comparison with this audit.
  const transform=getDeliveryHouseTransform(index),profile=buildingProfile({type:'house',variant:index});
  const house=new THREE.Group();house.name='delivery-house-'+stop.id;
  house.userData.entranceLocal=[0,1.3,profile.depth/2+.17];
  house.position.copy(transform.position);house.rotation.y=transform.yaw;
  house.scale.set(BUILDING_SCALE.width,BUILDING_SCALE.height,BUILDING_SCALE.depth);
  const box=new THREE.Mesh(new THREE.BoxGeometry(profile.width,profile.height,profile.depth));house.add(box);
  const anchors=deliveryHouseAnchors(house);
  const expected=new THREE.Vector3(0,1.3*BUILDING_SCALE.height,(profile.depth/2+.17)*BUILDING_SCALE.depth).applyAxisAngle(new THREE.Vector3(0,1,0),transform.yaw).add(transform.position);
  assert(anchors.door.distanceTo(expected)<1e-8,'door uses actual scaled facade, not neighbouring building');
  audit.push({id:stop.id,address:stop.address,side:stop.side,door:anchors.door.toArray().map(v=>+v.toFixed(4)),arrival:[+interval.start.toFixed(4),+interval.end.toFixed(4)]});
  box.geometry.dispose();(box.material as THREE.Material).dispose();
}
console.log(JSON.stringify(audit,null,2));
const ahead={position:100,stopIndex:0,laneX:0,detour:'main' as const};
assert.equal(deliveryGuidanceWaypoints(ahead).length,0,'No arrows unless the guide is replayed');
assert(deliveryGuidanceWaypoints(ahead,true).every(p=>p.path==='road'&&p.progress>100));
console.log('Guidance: world door anchors and replay arrows passed.');
