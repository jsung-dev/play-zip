import * as THREE from "three";
import { DELIVERY_STOPS, getDrivewayFrame } from "@/data/delivery-map";
import { deliveryArrivalInterval, deliveryGuidanceWaypoints, type GuidanceState } from "../delivery-guidance";
import type { DeliveryWorld } from "./scene-builders";

export function deliveryHouseAnchors(house: THREE.Group, side = 0) {
  const local = house.userData.entranceLocal as [number, number, number] | undefined;
  if (!local) throw new Error(`Missing actual entrance on ${house.name}`);
  house.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(house);
  const roofLocal = house.userData.roofMarkerLocal as [number, number, number] | undefined;
  return {
    door: house.localToWorld(new THREE.Vector3(...local)),
    roof: roofLocal ? house.localToWorld(new THREE.Vector3(-side * roofLocal[0], roofLocal[1], roofLocal[2])) : new THREE.Vector3(house.position.x, bounds.max.y + .25, house.position.z),
    front: new THREE.Vector3(0, 0, 1).transformDirection(house.matrixWorld),
  };
}

function markerTexture(label: string, pinX: number) {
  const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 320;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.strokeStyle = "#00c58e"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(5, 5, 374, 100, 48); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#142e2a"; ctx.font = '800 60px "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, 192, 53);
  ctx.beginPath(); ctx.moveTo(pinX, 312); ctx.bezierCurveTo(pinX-18, 276, pinX-54, 222, pinX-54, 189);
  ctx.bezierCurveTo(pinX-54, 116, pinX+54, 116, pinX+54, 189); ctx.bezierCurveTo(pinX+54, 222, pinX+18, 276, pinX, 312);
  ctx.fillStyle = "#00c58e"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 9; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(pinX, 184, 20, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** An outline of the exact navigable arrival interval, not a circle on another house. */
export function deliveryArrivalOutline(index: number) {
  const { start, end, width } = deliveryArrivalInterval(index);
  const vertices: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    for (const p of [a,b,c,b,d,c]) vertices.push(p.x, .115, p.z);
  };
  const point = (progress: number, offset: number) => {
    const frame = getDrivewayFrame(index, progress);
    return frame.position.addScaledVector(frame.lateral, offset);
  };
  for (const side of [-1, 1]) for (let n = 0; n < 16; n++) {
    const a = start + (end - start) * n / 16, b = start + (end - start) * (n + 1) / 16;
    quad(point(a, side * width / 2), point(a, side * (width / 2 - .10)), point(b, side * width / 2), point(b, side * (width / 2 - .10)));
  }
  for (const p of [start, end - .1]) quad(point(p,-width/2),point(p,width/2),point(p+.1,-width/2),point(p+.1,width/2));
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals(); return geometry;
}

export function createRouteGuidance(world: DeliveryWorld) {
  const group = new THREE.Group(); group.name = "current-delivery-guidance"; world.root.add(group);
  const targets = [...world.deliveryStops.map(stop => stop.house), world.destination].map((house,index) => {
    const anchors=deliveryHouseAnchors(house,world.deliveryStops[index]?.side);
    return {...anchors,doorKey:anchors.door.toArray().map(n=>n.toFixed(4)).join(","),houseId:house.name||"final-destination"};
  });
  // Label alignment can change, but its pin tip stays on the SAME world anchor.
  const alignments = [64,192,320];
  const houseMaps=alignments.map(x=>markerTexture("배달할 집",x)),doorMaps=alignments.map(x=>markerTexture("배달 입구",x));
  const material = new THREE.SpriteMaterial({ map: houseMaps[1], toneMapped: false, depthTest: false, depthWrite: false });
  const pin = new THREE.Sprite(material); pin.center.set(.5, 0); group.add(pin);
  const mint = new THREE.MeshBasicMaterial({ color: "#00c58e", side: THREE.DoubleSide, toneMapped: false });
  const white = new THREE.MeshBasicMaterial({ color: "#fff", side: THREE.DoubleSide, toneMapped: false });
  const shape = new THREE.Shape(); shape.moveTo(0,.9); shape.lineTo(.6,.1); shape.lineTo(.24,.22); shape.lineTo(.24,-.75); shape.lineTo(-.24,-.75); shape.lineTo(-.24,.22); shape.lineTo(-.6,.1); shape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(shape);
  const arrows = Array.from({length:3},()=>{
    const arrow = new THREE.Group();
    const border = new THREE.Mesh(arrowGeometry,white); border.rotation.x=-Math.PI/2; border.scale.setScalar(1.16); border.position.y=.12;
    const fill = new THREE.Mesh(arrowGeometry,mint); fill.rotation.x=-Math.PI/2; fill.position.y=.13;
    arrow.add(border,fill); group.add(arrow); return arrow;
  });
  const rings = DELIVERY_STOPS.map((_,index)=>{const ring=new THREE.Mesh(deliveryArrivalOutline(index),mint); ring.visible=false; group.add(ring); return ring;});
  const ray = new THREE.Raycaster(); let cachedDoorVisible=false,cachedRoofVisible=false,lastVisibilityCheck=-Infinity,previousIndex=-1;
  const update = (state: GuidanceState, camera: THREE.PerspectiveCamera, height: number, highlighted: boolean, timestamp: number, enabled: boolean) => {
    group.visible=enabled;
    const index=Math.min(state.stopIndex,targets.length-1), target=targets[index];
    const near=index<DELIVERY_STOPS.length?Math.abs(state.position-DELIVERY_STOPS[index].distance)<100:state.position>880;
    const inAlley=state.driveway?.stopIndex===index;
    const close=inAlley ? Math.abs(deliveryArrivalInterval(index).end-state.driveway!.progress)<=14 : index===DELIVERY_STOPS.length && state.position>975;
    if(!close) cachedDoorVisible=false;
    if(enabled&&near&&(timestamp-lastVisibilityCheck>140||index!==previousIndex)){
      lastVisibilityCheck=timestamp;previousIndex=index;
      const projected=target.door.clone().project(camera);
      const direction=target.door.clone().sub(camera.position), distance=direction.length();
      const facing=target.front.dot(camera.position.clone().sub(target.door))>0;
      ray.set(camera.position,direction.normalize());ray.far=Math.max(0,distance-.3);
      const ownHouse=index<world.deliveryStops.length?world.deliveryStops[index].house:world.destination;
      const blockers=world.worldObjects.filter(object=>object!==ownHouse&&object.visible);
      cachedDoorVisible=close&&facing&&Math.abs(projected.x)<.90&&Math.abs(projected.y)<.92&&projected.z>-1&&projected.z<1&&!ray.intersectObjects(blockers,true).length;
      const roofProjection=target.roof.clone().project(camera),roofRay=target.roof.clone().sub(camera.position);
      ray.set(camera.position,roofRay.clone().normalize());ray.far=Math.max(0,roofRay.length()-.2);
      cachedRoofVisible=Math.abs(roofProjection.x)<.94&&roofProjection.y>-.9&&roofProjection.y<.85&&roofProjection.z>-1&&roofProjection.z<1&&!ray.intersectObjects(blockers,true).length;
    }
    const entrance=close&&cachedDoorVisible;
    pin.position.copy(entrance?target.door:target.roof);
    if(entrance)pin.position.y+=1.5;
    const projectedPin=pin.position.clone().project(camera);
    const alignment=projectedPin.x<-.65?0:projectedPin.x>.65?2:1;
    pin.material.map=(entrance?doorMaps:houseMaps)[alignment];pin.center.x=alignments[alignment]/384;
    const distance=camera.position.distanceTo(pin.position);
    const unitsPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    const size=Math.min(6.5,unitsPerPixel*(highlighted?88:76));
    pin.scale.set(size*1.2,size,1);
    pin.visible=near&&(entrance||cachedRoofVisible);
    rings.forEach((ring,i)=>{ring.visible=near&&entrance&&i===index;});
    const points=deliveryGuidanceWaypoints(state,highlighted);
    arrows.forEach((arrow,i)=>{
      const sample=points[i]; arrow.visible=!!sample;
      if(sample){arrow.position.copy(sample.frame.position);arrow.position.y=0;arrow.rotation.y=sample.frame.yaw+(sample.reverse?Math.PI:0);arrow.scale.setScalar(highlighted?1.12:1);
        (arrow.children[0] as THREE.Mesh).material=sample.selected===false?mint:white;
        (arrow.children[1] as THREE.Mesh).material=sample.selected===false?white:mint;
      }
    });
    return {target: index<DELIVERY_STOPS.length?DELIVERY_STOPS[index].id:"final",house:target.houseId,door:target.doorKey,mode:enabled&&pin.visible?(entrance?"entrance":"house"):"hidden",arrows:enabled?points.length:0,highlighted:enabled&&highlighted,ring:enabled&&entrance&&index<rings.length};
  };
  return {update,dispose:()=>{for(const map of [...houseMaps,...doorMaps])map.dispose();}};
}
