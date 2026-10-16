import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import * as THREE from "three";
import { DELIVERY_STOPS, getRouteFrame, getDrivewayFrame, getDrivewayLength, getDrivewayPavedWidth, getDrivewayDeliveryInterval, getDrivewayExitDistance, getDeliveryHouseTransform, isAtDrivewayDelivery } from "../data/delivery-map";
import { buildingProfile, rectangle, pointPolygonDistance, adFootprint } from "../components/delivery/three/street-layout";
import { resolveAdvertisements } from "../components/delivery/three/scene-layout";

for (const [index, stop] of DELIVERY_STOPS.entries()) {
  const side = stop.side === "left" ? -1 : 1;
  const main = getRouteFrame(stop.distance);
  const length = getDrivewayLength(index);
  const start = getDrivewayFrame(index, 0);
  assert(start.position.distanceTo(main.position.clone().addScaledVector(main.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing * 2)) < 1e-6);
  assert(start.tangent.dot(main.tangent) > .999, "Entrance changes direction abruptly");
  assert(length > 45 && length < 90, "Exit should stay within the local delivery block");
  const end = getDrivewayFrame(index, length);
  const exit = getRouteFrame(getDrivewayExitDistance(index));
  assert(end.position.distanceTo(exit.position.clone().addScaledVector(exit.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing * 2)) < 1e-6, "Exit does not join its extra lane");
  assert(end.tangent.dot(exit.tangent) > .999, "Exit changes direction abruptly");
  const zone = getDrivewayDeliveryInterval(index);
  const center = getDrivewayFrame(index, (zone.start + zone.end) / 2);
  assert(center.position.clone().sub(main.position).dot(main.lateral) * side > DELIVERY_GAME_CONFIG.roadWidth, "Delivery pad is still on the main road");
  const house = getDeliveryHouseTransform(index), p = buildingProfile({type: "house", variant: index});
  const footprint = rectangle(house.position, house.yaw, -p.halfWidth, p.halfWidth, -p.back, p.front);
  const entry = { entryPosition: stop.distance + .5, entryLaneX: side * (DELIVERY_GAME_CONFIG.laneSpacing * 2 - .3) };
  const lateMain = getRouteFrame(entry.entryPosition);
  assert(getDrivewayFrame(index, 0, entry).position.distanceTo(lateMain.position.addScaledVector(lateMain.lateral, entry.entryLaneX)) < 1e-6, "Late entry teleports");
  for (let p = .25; p <= length; p += .25) {
    assert(getDrivewayFrame(index, p, entry).position.distanceTo(getDrivewayFrame(index, p - .25, entry).position) < .65, "Driveway has a jump");
    // Reverse uses the exact same frame, not a flipped camera direction.
    assert(getDrivewayFrame(index, p).tangent.dot(getDrivewayFrame(index, p - .25).tangent) > .98);
    const point = getDrivewayFrame(index, p).position, point2 = new THREE.Vector2(point.x, point.z);
    assert(pointPolygonDistance(point2, footprint) > getDrivewayPavedWidth(index,p) / 2 + .4, `Delivery house blocks through-route ${index}/${p}`);
    for (const ad of resolveAdvertisements()) assert(pointPolygonDistance(point2, adFootprint(ad)) > getDrivewayPavedWidth(index,p) / 2 + .3, `Ad blocks alley ${index}/${ad.id}`);
  }
  assert(!isAtDrivewayDelivery(null, index), "Main-road stopping counted as delivery");
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: 0, ...entry }, index));
  assert(isAtDrivewayDelivery({ stopIndex: index, progress: zone.start, ...entry }, index));
  assert(isAtDrivewayDelivery({ stopIndex: index, progress: zone.end, ...entry }, index));
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: zone.end + .001, ...entry }, index));
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: length, ...entry }, index));
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: length, ...entry }, index + 1), "Completed driveway can deliver the next stop");
}
console.log("All 3 through-alleys: continuous entry/exit, smooth turns, house/ad clearance and bounded delivery pads verified.");
