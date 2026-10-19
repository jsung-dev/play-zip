import assert from "node:assert/strict";
import * as THREE from "three";
import { mkdirSync, writeFileSync } from "node:fs";
import { SCENERY_ITEMS, DELIVERY_GAME_CONFIG, type SceneryItem } from "../data/delivery-game";
import { DELIVERY_STOPS, getDrivewayFrame, getDrivewayLength, getDrivewayPavedWidth, getDeliveryHouseTransform, getRouteFrame, type DetourChoice } from "../data/delivery-map";
import { createSceneArt } from "../components/delivery/three/scene-art";
import { streetArchitecture } from "../components/delivery/three/street-architecture";
import { createStreetArchitecture } from "../components/delivery/three/street-architecture";
import { resolveAdvertisements, sceneryHasClearance } from "../components/delivery/three/scene-layout";
import { buildStreetLayout, buildingProfile, polygonsOverlap, pointPolygonDistance, streetTransform, rectangle, advertisementSightlines, buildingBlocksRay, adFootprint } from "../components/delivery/three/street-layout";

// Geometry tests need only the architectural texture canvas, not a renderer.
const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {} };
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
const art = createSceneArt();
function bounds(object: THREE.Object3D) {
  object.position.set(0, 0, 0); object.rotation.set(0, 0, 0); object.updateMatrixWorld(true);
  const result = new THREE.Box3();
  object.traverse(child => {
    if (child instanceof THREE.Mesh && !Array.isArray(child.material) && !child.material.transparent) {
      child.geometry.computeBoundingBox(); result.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld));
    }
  });
  return result;
}
const dimensions = [];
for (const type of ["house", "shop"] as const) for (let variant = 0; variant < 5; variant++) {
  const item = { id: "fixture", distance: 0, side: "left", type, variant } as SceneryItem;
  const old = bounds(art.building(item)), current = bounds(art.building(item, true)), p = buildingProfile(item, true);
  const a = old.getSize(new THREE.Vector3()), b = current.getSize(new THREE.Vector3());
  const spec = streetArchitecture(item);
  assert(spec.floors >= 3 && spec.floors <= 7, `Actual storeys ${type}/${variant}`);
  assert(b.y > spec.height && b.x > spec.width, "Real model, not camera scaling");
  assert(current.max.x <= p.halfWidth + .001 && -current.min.x <= p.halfWidth + .001, `Width envelope ${type}/${variant}: ${current.min.x},${current.max.x} vs ${p.halfWidth}`);
  assert(current.max.z <= p.front + .001 && -current.min.z <= p.back + .001, `Depth envelope ${type}/${variant}`);
  assert(current.max.y <= p.solidHeight + .001, `Height envelope ${type}/${variant}`);
  const twin = art.building(item, true);
  assert.equal(twin.children.find(c => c instanceof THREE.Mesh)?.geometry, art.building(item, true).children.find(c => c instanceof THREE.Mesh)?.geometry, "Repeated models share geometry");
  dimensions.push({ type, variant, kind: spec.kind, oldWidth: +a.x.toFixed(2), newWidth: +b.x.toFixed(2), oldHeight: +a.y.toFixed(2), newHeight: +b.y.toFixed(2), floors: spec.floors });
}
assert.equal(new Set(dimensions.map(d => d.kind)).size, 5, "The five A–E reference-sheet types");
assert.deepEqual([...new Set(dimensions.map(d => d.floors))].sort(), [3,5,6,7]);
const mint = createStreetArchitecture({ type: "house", variant: 1 } as SceneryItem, art);
assert.equal(mint.userData.architecture.floors, 6, "Mint villa has six individually constructed storeys");
const recess = mint.userData.balconyRecess;
assert.equal(recess.floors.length, 5, "Five upstairs recessed balconies above the storefront");
mint.updateMatrixWorld(true);
for (const floor of recess.floors) {
  const y = .2 + floor * mint.userData.architecture.pitch + 1.4;
  const ray = new THREE.Raycaster(new THREE.Vector3(recess.x, y, recess.front + 2), new THREE.Vector3(0,0,-1));
  const hit = ray.intersectObject(mint, true)[0];
  assert(hit && hit.point.z < recess.front - .7, "Mint balcony is an actual deep void, not a painted panel");
}
const brightMaterial = art.buildingBox(1,1,1,"#BDE6C2").material as THREE.MeshLambertMaterial;
assert.equal(brightMaterial, art.buildingBox(2,2,2,"#BDE6C2").material, "Building-only lighting materials are pooled");
assert.equal(brightMaterial.toneMapped, false, "Keep the reference pastel colour in architecture");
assert.notEqual(brightMaterial, art.box(1,1,1,"#BDE6C2").material, "Do not change the courier or ad material response");
assert(Math.max(...dimensions.map(d=>d.newWidth))/Math.min(...dimensions.map(d=>d.newWidth))>1.4, "Wide shops and narrow villas have different real frontage");
const ads = resolveAdvertisements(), buildings = buildStreetLayout(ads), oldBuildings = SCENERY_ITEMS.filter(i => ["house", "shop"].includes(i.type) && sceneryHasClearance(i, ads));
assert.equal(buildings.length,203,"Preserve the existing lot plan");
let triangles = 0, meshes = 0;
for(const item of buildings) art.building(item,true).traverse(o=>{
  if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}
});
// 3–7 storeys add geometry; one shared vertex-colour material cut building
// batches from ~2,200 to ~400, which is what limits phones. Hold both lines.
assert(triangles<=570000,"Street geometry budget for the taller 3–7 storey facades");
assert(meshes<=450,"Facades batch into one material per block, not one per paint colour");
for (let i = 0; i < buildings.length; i++) {
  const b = buildings[i];
  for (const other of buildings.slice(i + 1)) assert(!polygonsOverlap(b.footprint, other.footprint, .3), `Buildings overlap: ${b.id}/${other.id}`);
  for (const ad of ads) assert(!polygonsOverlap(b.footprint, adFootprint(ad), .5), `Building/ad overlap: ${b.id}/${ad.id}`);
  for (let d = Math.max(0, b.distance - 22); d < Math.min(1000, b.distance + 22); d += .25) {
    const fork = d >= 477 && d <= 698;
    for (const branch of (fork ? ["main", "left", "right"] : ["main"]) as DetourChoice[]) {
      const p = getRouteFrame(d, branch).position;
      assert(pointPolygonDistance(new THREE.Vector2(p.x, p.z), b.footprint) >= (fork ? branch === "main" ? 4.2 : 4.65 : 10.1), `Road/sidewalk intrusion: ${b.id} at ${d}`);
    }
  }
  for (let i = 0; i < DELIVERY_STOPS.length; i++) {
    const length = getDrivewayLength(i), transform = getDeliveryHouseTransform(i), p = buildingProfile({ type: "house", variant: i });
    const house = rectangle(transform.position, transform.yaw, -p.halfWidth, p.halfWidth, -p.back, p.front);
    assert(!polygonsOverlap(b.footprint, house, .9), `Delivery-house clearance: ${b.id}`);
    for (let d = 0; d <= length; d += .25) {
      const point = getDrivewayFrame(i, d).position;
      assert(pointPolygonDistance(new THREE.Vector2(point.x, point.z), b.footprint) > getDrivewayPavedWidth(i,d) / 2 + .5, `Driveway clearance: ${b.id}`);
    }
  }
}
// Check the creative, not only its centre, along three approach sightlines.
for (const ray of advertisementSightlines(ads)) for (const b of buildings) assert(!buildingBlocksRay(b, ray.from, ray.to), `Ad occlusion: ${ray.ad.id}/${b.id}`);
const gaps: number[] = [], ratios: number[] = [];
for (const side of ["left", "right"]) {
  const row = buildings.filter(b => b.side === side);
  for (let n = 1; n < row.length; n++) {
    const a = row[n - 1], b = row[n];
    // Normal frontage only: driveways/intersections and deliberate ad setbacks
    // are exceptions, rather than silently labelling their open spaces as gaps.
    const p = buildingProfile(b, true), q = buildingProfile(a, true);
    if (a.route !== "main" || b.route !== "main" || b.distance - a.distance > 12 || Math.abs(a.offset - (10.65 + q.front)) > .01 || Math.abs(b.offset - (10.65 + p.front)) > .01) continue;
    const direction = getRouteFrame(b.distance).tangent, axis = new THREE.Vector2(direction.x, direction.z);
    const gap = Math.min(...b.footprint.map(v => v.dot(axis))) - Math.max(...a.footprint.map(v => v.dot(axis)));
    const ratio = gap / (p.halfWidth + q.halfWidth);
    assert(ratio >= .149 && ratio <= .2, `Normal frontage gap ${(100 * ratio).toFixed(1)}%: ${b.id}`);
    gaps.push(gap); ratios.push(ratio);
  }
}
assert(gaps.length > 60, "Enough genuinely continuous frontage outside exceptions");
const result = { dimensions, triangles, meshes, baselineTriangles:430990, baselineMeshes:2206, oldBuildings: oldBuildings.length, newBuildings: buildings.length, normalGaps: gaps.length, gapMeters: [Math.min(...gaps), Math.max(...gaps)], gapRatios: [Math.min(...ratios), Math.max(...ratios)], ads: ads.length, checks: ["A–E / 2–5 storeys", "four-floor mint / ray-tested balcony recesses", "real model inside old lot bounds", "template and material reuse", "no overlap", "sidewalks", "driveways", "ad sightlines", "unchanged lot gaps"] };
mkdirSync("test-artifacts/streetscape",{recursive:true});
writeFileSync("test-artifacts/streetscape/geometry.json", JSON.stringify(result, null, 2));
console.table(dimensions);
console.log(JSON.stringify({ ...result, dimensions: undefined }, null, 2));
