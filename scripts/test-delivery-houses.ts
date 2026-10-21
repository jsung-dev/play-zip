import assert from "node:assert/strict";
import * as THREE from "three";
import { DELIVERY_HOUSE, DELIVERY_STOPS, getDeliveryHouseTransform, getRouteFrame } from "../data/delivery-map";
import { BUILDING_SCALE, resolveAdvertisements } from "../components/delivery/three/scene-layout";
import { STREET_BUILDINGS, adFootprint, advertisementSightlines, buildStreetLayout, buildingBlocksRay, buildingProfile, polygonGap, polygonsOverlap, rectangle, streetTransform, type StreetBuilding } from "../components/delivery/three/street-layout";

assert(Math.abs(DELIVERY_HOUSE.offset - (STREET_BUILDINGS.sidewalkOuterEdge + (4.8 / 2 + .9) * BUILDING_SCALE.depth + STREET_BUILDINGS.frontageSetback)) < .001, "House offset = sidewalk edge + front + setback");
const ads = resolveAdvertisements(), street = buildStreetLayout(ads), rays = advertisementSightlines(ads);
for (const [index, stop] of DELIVERY_STOPS.entries()) {
  const side = stop.side === "left" ? -1 : 1, { position, yaw } = getDeliveryHouseTransform(index);
  const p = buildingProfile({ type: "house", variant: index });
  const footprint = rectangle(position, yaw, -p.halfWidth, p.halfWidth, -p.back, p.front);
  const frame = getRouteFrame(stop.distance + DELIVERY_HOUSE.along);
  // Beside the road: its road-facing wall sits just behind the sidewalk, on the stop's own side.
  const lateral = footprint.map(v => (v.x - frame.position.x) * frame.lateral.x + (v.y - frame.position.z) * frame.lateral.z);
  assert(lateral.every(v => v * side > 0), `${index}: house on the ${stop.side} side`);
  assert(Math.min(...lateral.map(Math.abs)) >= STREET_BUILDINGS.sidewalkOuterEdge, `${index}: house stays off the sidewalk`);
  assert(Math.min(...lateral.map(Math.abs)) < STREET_BUILDINGS.sidewalkOuterEdge + 1.5, `${index}: house is next to the road, not set far back`);
  const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  assert(facing.dot(frame.lateral) * side < -.99, `${index}: door faces the road`);
  for (const ad of ads) assert(polygonGap(footprint, adFootprint(ad)) > .6, `${index}: ad ${ad.id} clear of house`);
  for (const b of street) assert(!polygonsOverlap(footprint, b.footprint, .3), `${index}: street building ${b.id} overlaps house`);
  // Conservative: tested with the larger street-lot profile so ad sightlines stay open.
  const item = { id: stop.id, distance: stop.distance + DELIVERY_HOUSE.along, side: stop.side, variant: index, type: "house", route: "main", offset: DELIVERY_HOUSE.offset, footprint, height: p.solidHeight } as StreetBuilding;
  assert(Math.abs(streetTransform(item).position.distanceTo(position)) < 1e-6);
  for (const ray of rays) assert(!buildingBlocksRay(item, ray.from, ray.to), `${index}: house hides ad ${ray.ad.id}`);
}
console.log("Houses: roadside placement, facing the road, clear of ads/sightlines/street lots verified.");
