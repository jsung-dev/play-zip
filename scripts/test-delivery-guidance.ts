import assert from "node:assert/strict";
import * as THREE from "three";
import { DELIVERY_GAME_CONFIG as config } from "../data/delivery-game";
import { DELIVERY_STOPS, getDrivewayFrame, getDrivewayLength, isAtDrivewayDelivery } from "../data/delivery-map";
import { deliveryArrivalInterval, deliveryGuidanceWaypoints, remainingDeliveryDistance } from "../components/delivery/delivery-guidance";
import { deliveryArrivalOutline, deliveryHouseAnchors } from "../components/delivery/three/route-guidance";
import { BUILDING_SCALE } from "../components/delivery/three/scene-layout";
import { buildingProfile } from "../components/delivery/three/street-layout";

const audit=[];
for(const [index,stop] of DELIVERY_STOPS.entries()) {
  const interval=deliveryArrivalInterval(index),length=getDrivewayLength(index);
  const entry={stopIndex:index,entryPosition:stop.distance,entryLaneX:(stop.side==='left'?-1:1)*config.laneSpacing};
  assert.equal(interval.end,length);assert.equal(interval.start,length-config.drivewayDeliveryDepth);
  for(const progress of [0,interval.start-.001,interval.start,length]) {
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
  const returning={...before,position:stop.distance,stopIndex:index+1,driveway:{...entry,progress:16}};
  assert(deliveryGuidanceWaypoints(returning).every(p=>p.reverse&&p.progress<16),'return arrows follow old alley backwards');
  const outline=deliveryArrivalOutline(index),positions=outline.getAttribute('position');
  assert(positions.count>0);for(let i=0;i<positions.count;i++)assert(Math.abs(positions.getY(i)-.115)<1e-6);
  outline.dispose();

  // Reconstruct the model transform independently; the browser records the
  // anchor produced by the actual house mesh for comparison with this audit.
  const frame=getDrivewayFrame(index,length),profile=buildingProfile({type:'house',variant:index});
  const house=new THREE.Group();house.name='delivery-house-'+stop.id;
  house.userData.entranceLocal=[0,1.3,profile.depth/2+.17];
  house.position.copy(frame.position).addScaledVector(frame.tangent,7.8);house.rotation.y=frame.yaw;
  house.scale.set(BUILDING_SCALE.width,BUILDING_SCALE.height,BUILDING_SCALE.depth);
  const box=new THREE.Mesh(new THREE.BoxGeometry(profile.width,profile.height,profile.depth));house.add(box);
  const anchors=deliveryHouseAnchors(house);
  const expected=frame.position.clone().addScaledVector(frame.tangent,7.8-(profile.depth/2+.17)*BUILDING_SCALE.depth);expected.y=1.3*BUILDING_SCALE.height;
  assert(anchors.door.distanceTo(expected)<1e-8,'door uses actual scaled facade, not neighbouring building');
  audit.push({id:stop.id,address:stop.address,side:stop.side,door:anchors.door.toArray().map(v=>+v.toFixed(4)),arrival:[+interval.start.toFixed(4),+interval.end.toFixed(4)]});
  box.geometry.dispose();(box.material as THREE.Material).dispose();
}
console.log(JSON.stringify(audit,null,2));
console.log('Guidance: world door anchors, all three routes, unchanged arrival intervals, remaining distance and reverse arrows passed.');
