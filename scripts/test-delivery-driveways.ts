import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import { DELIVERY_STOPS, getRouteFrame, getDrivewayFrame, getDrivewayLength, isAtDrivewayDelivery } from "../data/delivery-map";

for (const [index, stop] of DELIVERY_STOPS.entries()) {
  const side = stop.side === "left" ? -1 : 1;
  const main = getRouteFrame(stop.distance);
  const length = getDrivewayLength(index);
  const start = getDrivewayFrame(index, 0);
  assert(start.position.distanceTo(main.position.clone().addScaledVector(main.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing)) < 1e-6);
  assert(start.tangent.dot(main.tangent) > .999, "Entrance changes direction abruptly");
  assert(length > 20 && length < 40, "Driveway is no longer a short visit");
  const end = getDrivewayFrame(index, length);
  assert(end.position.clone().sub(main.position).dot(main.lateral) * side > DELIVERY_GAME_CONFIG.roadWidth, "Delivery pad is still on the main road");
  const entry = { entryPosition: stop.distance + 4, entryLaneX: side * (DELIVERY_GAME_CONFIG.laneSpacing - .3) };
  const lateMain = getRouteFrame(entry.entryPosition);
  assert(getDrivewayFrame(index, 0, entry).position.distanceTo(lateMain.position.addScaledVector(lateMain.lateral, entry.entryLaneX)) < 1e-6, "Late entry teleports");
  for (let p = .25; p <= length; p += .25) {
    assert(getDrivewayFrame(index, p, entry).position.distanceTo(getDrivewayFrame(index, p - .25, entry).position) < .65, "Driveway has a jump");
    // Reverse uses the exact same frame, not a flipped camera direction.
    assert(getDrivewayFrame(index, p).tangent.dot(getDrivewayFrame(index, p - .25).tangent) > .98);
  }
  assert(!isAtDrivewayDelivery(null, index), "Main-road stopping counted as delivery");
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: 0, ...entry }, index));
  assert(isAtDrivewayDelivery({ stopIndex: index, progress: length, ...entry }, index));
  assert(!isAtDrivewayDelivery({ stopIndex: index, progress: length, ...entry }, index + 1), "Completed driveway can deliver the next stop");
}
console.log("All 3 driveways: continuous entry, short path, forward-facing reverse and separate delivery pads verified.");
