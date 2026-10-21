import assert from "node:assert/strict";
import * as THREE from "three";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import { DELIVERY_STOPS, TURN_LANE } from "../data/delivery-map";
import { createSceneArt, TOWN_COLORS } from "../components/delivery/three/scene-art";
import { createRoad, createDeliveryStop } from "../components/delivery/three/scene-builders";
import { ROAD_SURFACE, applyRoadSurfaceUV, createRoadSurfaceMaterial } from "../components/delivery/three/road-surface";

const context = { createRadialGradient: () => ({addColorStop(){}}), fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, fill(){}, stroke(){}, arcTo(){}, fillText(){}, measureText: (s:string) => ({width:s.length*40}) };
Object.assign(globalThis, {document:{createElement:()=>({width:0,height:0,getContext:()=>context})}, Image:class {src="";}});
const road=createRoadSurfaceMaterial(), art=createSceneArt(), ground=createRoad(art,road);
assert.equal(road.color.getHexString(),"929a9c");assert.equal(road.toneMapped,false);assert.equal(road.fog,true);
assert.equal(TOWN_COLORS.lawn,"#b8d998","Existing grass color unchanged");
assert.equal(TOWN_COLORS.pavement,"#ecdfc9","Building foundations are not recolored with sidewalks");
assert.equal(ROAD_SURFACE.sidewalk,"#F5F0E5");
const meshes:THREE.Mesh[]=[];
const markers=DELIVERY_STOPS.map(stop=>createDeliveryStop(stop,art,DELIVERY_BRANDS.seoul,road).marker);
for(const marker of markers){
  const rim=marker.children[0] as THREE.Mesh;
  assert(Array.isArray(rim.material));assert.equal(rim.material[0],road);
  assert.equal(rim.geometry.groups[0].materialIndex,0,"Entrance rim cannot leave an ivory seam across asphalt");
  assert.equal(rim.geometry.groups.at(-1)!.materialIndex,0,"Exit rim cannot leave an ivory seam across asphalt");
  assert(rim.geometry.groups.some(group=>group.materialIndex===1),"Alley-side ivory edging remains outside joins");
  const asphalt=marker.children[1] as THREE.Mesh;
  const vertices=asphalt.geometry.getAttribute("position");
  for(const n of [0,vertices.count-2]){
    const a=new THREE.Vector3().fromBufferAttribute(vertices,n),b=new THREE.Vector3().fromBufferAttribute(vertices,n+1);
    assert(Math.abs(a.distanceTo(b)-TURN_LANE.halfWidth*2)<.00005,"Alley mouth meets extra lane without a flare across the sidewalk");
  }
}
for(const group of [ground,...markers])group.traverse(object=>{
  if(object instanceof THREE.Mesh&&object.material===road)meshes.push(object);
});
assert.equal(meshes.length,6,"Main + two bypasses + three driveways share one material");
const restricted=ground.children.filter((m):m is THREE.Mesh=>m instanceof THREE.Mesh&&!Array.isArray(m.material)&&m.material.name==="non-drivable-stone");
assert.equal(restricted.length,4,"Four bus-only shoulders are visually distinct; the main road stays open through the fork");
assert(!ground.getObjectByName("closed-main-road"),"No closed main-road ribbon");
for(const mesh of restricted){
  const material=mesh.material as THREE.MeshBasicMaterial;
  assert.equal(material.color.getHexString(),ROAD_SURFACE.restricted.slice(1).toLowerCase());
  assert.equal(material.map,road.map,"Reuse the neutral texture");
  assert.equal(material.toneMapped,false);
}
for(const mesh of meshes){
  const positions=mesh.geometry.getAttribute("position"),uv=mesh.geometry.getAttribute("uv");
  assert.equal(positions.count,uv.count);
  for(let i=0;i<positions.count;i++){
    assert(Math.abs(uv.getX(i)-positions.getX(i)/4)<.00002);
    assert(Math.abs(uv.getY(i)-positions.getZ(i)/4)<.00002);
  }
  const original=Array.from(positions.array),indices=Array.from(mesh.geometry.index!.array);
  applyRoadSurfaceUV(mesh.geometry);
  assert.deepEqual(Array.from(positions.array),original,"Appearance must not alter the road shape");
  assert.deepEqual(Array.from(mesh.geometry.index!.array),indices,"Triangle connectivity is preserved");
}
const strips=ground.children.filter((m):m is THREE.InstancedMesh=>m instanceof THREE.InstancedMesh);
assert.equal(strips.length,1);assert(strips[0].count>100,"Original white lane markings retained");
assert(road.map instanceof THREE.DataTexture);
const pixels=road.map.image.data as Uint8Array;
for(let i=0;i<pixels.length;i+=4){assert(pixels[i]>=252);assert.equal(pixels[i],pixels[i+1]);assert.equal(pixels[i],pixels[i+2]);}
road.map!.dispose();road.dispose();
console.log("6 driveable surfaces share #929A9C; 4 inaccessible surfaces use stone color. Geometry/markings, ivory sidewalks and green grass preserved.");
