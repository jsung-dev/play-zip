import assert from "node:assert/strict";
import * as THREE from "three";
import { writeFileSync } from "node:fs";
import { SCENERY_ITEMS, DELIVERY_GAME_CONFIG, type SceneryItem } from "../data/delivery-game";
import { DELIVERY_STOPS, getDrivewayFrame, getDrivewayLength, getDeliveryHouseTransform, getRouteFrame, type DetourChoice } from "../data/delivery-map";
import { createSceneArt } from "../components/delivery/three/scene-art";
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
  assert(b.y / a.y >= 1.6 && b.y / a.y <= 2, `Actual height ratio ${type}/${variant}`);
  assert(b.x / a.x >= 1.2 && b.x / a.x <= 1.4, `Actual frontage ratio ${type}/${variant}`);
  assert(current.max.x <= p.halfWidth + .001 && -current.min.x <= p.halfWidth + .001, `Width envelope ${type}/${variant}: ${current.min.x},${current.max.x} vs ${p.halfWidth}`);
  assert(current.max.z <= p.front + .001 && -current.min.z <= p.back + .001, `Depth envelope ${type}/${variant}`);
  assert(current.max.y <= p.solidHeight + .001, `Height envelope ${type}/${variant}`);
  const twin = art.building(item, true);
  assert.equal(twin.children.find(c => c instanceof THREE.Mesh)?.geometry, art.building(item, true).children.find(c => c instanceof THREE.Mesh)?.geometry, "Repeated models share geometry");
  dimensions.push({ type, variant, oldWidth: +a.x.toFixed(2), newWidth: +b.x.toFixed(2), oldHeight: +a.y.toFixed(2), newHeight: +b.y.toFixed(2), floors: p.floors });
}
const ads = resolveAdvertisements(), buildings = buildStreetLayout(ads), oldBuildings = SCENERY_ITEMS.filter(i => ["house", "shop"].includes(i.type) && sceneryHasClearance(i, ads));
assert(buildings.length > 150 && buildings.length < 240, "Dense but bounded world population");
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
      assert(pointPolygonDistance(new THREE.Vector2(point.x, point.z), b.footprint) > DELIVERY_GAME_CONFIG.drivewayWidth / 2 + .5, `Driveway clearance: ${b.id}`);
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
const result = { dimensions, oldBuildings: oldBuildings.length, newBuildings: buildings.length, normalGaps: gaps.length, gapMeters: [Math.min(...gaps), Math.max(...gaps)], gapRatios: [Math.min(...ratios), Math.max(...ratios)], ads: ads.length, checks: ["real model bounds", "template reuse", "no overlap", "sidewalks", "driveways", "ad sightlines", "10–20% normal gaps"] };
writeFileSync("test-artifacts/streetscape/geometry.json", JSON.stringify(result, null, 2));
console.table(dimensions);
console.log(JSON.stringify({ ...result, dimensions: undefined }, null, 2));
