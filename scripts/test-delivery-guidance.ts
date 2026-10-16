import assert from "node:assert/strict";
import * as THREE from "three";
import { DELIVERY_GAME_CONFIG as config } from "../data/delivery-game";
import { DELIVERY_STOPS, getDrivewayFrame, getDrivewayLength, getDeliveryHouseTransform, isAtDrivewayDelivery } from "../data/delivery-map";
import { deliveryArrivalInterval, deliveryGuidanceWaypoints, remainingDeliveryDistance } from "../components/delivery/delivery-guidance";
import { deliveryArrivalOutline, deliveryHouseAnchors } from "../components/delivery/three/route-guidance";
import { BUILDING_SCALE } from "../components/delivery/three/scene-layout";
import { buildingProfile } from "../components/delivery/three/street-layout";

const audit=[];
for(const [index,stop] of DELIVERY_STOPS.entries()) {
  const interval=deliveryArrivalInterval(index),length=getDrivewayLength(index);
  const entry={stopIndex:index,entryPosition:stop.distance,entryLaneX:(stop.side==='left'?-1:1)*config.laneSpacing};
  assert(interval.end<length);assert.equal(interval.end-interval.start,config.drivewayDeliveryDepth);
  for(const progress of [0,interval.start-.001,interval.start,interval.end]) {
    const state={position:stop.distance,stopIndex:index,driveway:{...entry,progress},laneX:0,detour:'main' as const};
    assert.equal(remainingDeliveryDistance(state)===0,isAtDrivewayDelivery(state.driveway,index),'distance zero agrees with unchanged arrival zone');
    for(const point of deliveryGuidanceWaypoints(state)){
      assert.equal(point.path,'driveway');assert(point.progress>progress&&point.progress<interval.start);
      assert(point.frame.position.distanceTo(getDrivewayFrame(index,point.progress,entry).position)<1e-9,'arrows are on navigable curve');
    }
  }
  const before={position:stop.distance-5,stopIndex:index,driveway:null,laneX:0,detour:'main' as const};
  assert.equal(remainingDeliveryDistance(before),5+interval.start);
  assert.equal(deliveryGuidanceWaypoints(before).length,3);
  assert(deliveryGuidanceWaypoints(before).some(p=>p.path==='road'),'unselected junction exposes straight as well as turning');
  const returning={...before,position:stop.distance,stopIndex:index+1,driveway:{...entry,progress:16}};
  assert(deliveryGuidanceWaypoints(returning).every(p=>!p.reverse&&p.progress>16),'exit arrows continue forward through the same alley');
  const outline=deliveryArrivalOutline(index),positions=outline.getAttribute('position');
  assert(positions.count>0);for(let i=0;i<positions.count;i++)assert(Math.abs(positions.getY(i)-.115)<1e-6);
  outline.dispose();

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
console.log('Guidance: world door anchors, all three routes, matching arrival intervals, remaining distance and forward exit arrows passed.');
