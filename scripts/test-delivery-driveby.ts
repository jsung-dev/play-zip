import assert from "node:assert/strict";
import * as THREE from "three";
import { DRIVE_BY, driveByPhase, driveByRing, houseDistance, throwGrade } from "../components/delivery/delivery-driveby";
import { laneTargetX, nextDeliveryLane, settledDeliveryLane } from "../components/delivery/delivery-turns";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDeliveryHouseTransform, getRouteFrame } from "../data/delivery-map";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";

for (const [i] of DELIVERY_STOPS.entries()) {
  const h = houseDistance(i);
  // The window really is beside the house: nearest route point to the house is inside it.
  const house = getDeliveryHouseTransform(i).position;
  let best = 0, bestD = Infinity;
  for (let d = h - 40; d <= h + 40; d += .5) { const dist = getRouteFrame(d).position.distanceTo(house); if (dist < bestD) { bestD = dist; best = d; } }
  assert(best >= h - DRIVE_BY.windowAhead && best <= h + DRIVE_BY.windowBehind, `${i}: house at ${best} is inside the throw window (${h})`);
  assert.equal(driveByPhase(h - DRIVE_BY.warnAhead - 1, i), "far");
  assert.equal(driveByPhase(h - DRIVE_BY.warnAhead + 1, i), "warn");
  assert.equal(driveByPhase(h - DRIVE_BY.windowAhead + .1, i), "window");
  assert.equal(driveByPhase(h + DRIVE_BY.windowBehind, i), "window");
  assert.equal(driveByPhase(h + DRIVE_BY.windowBehind + .1, i), "passed");
  const c = h - DRIVE_BY.perfectCenter;
  assert.equal(throwGrade(c, i, true), "perfect"); assert.equal(throwGrade(c + DRIVE_BY.perfectHalf + .1, i, true), "good");
  assert.equal(throwGrade(h - DRIVE_BY.windowAhead + .1, i, true), "good", "Early jump is still a throw");
  assert.equal(throwGrade(h - DRIVE_BY.warnAhead, i, true), null, "Jumping early does nothing");
  assert.equal(throwGrade(c, i, false), null, "No jump yet: keep waiting");
  assert.equal(throwGrade(h + DRIVE_BY.autoBehind, i, false), "auto", "Never jumped: parcel is thrown anyway, quiz still opens");
  assert(h + DRIVE_BY.autoBehind <= h + DRIVE_BY.windowBehind, "Auto throw happens before the stop would be skipped");
  assert.equal(driveByRing(h - DRIVE_BY.warnAhead - 1, i), null);
  assert.equal(driveByRing(h - DRIVE_BY.warnAhead, i)!.fill, 0);
  assert.equal(driveByRing(h - DRIVE_BY.windowAhead, i)!.fill, 1, "Ring is full when the window opens");
  const mid = driveByRing(h - (DRIVE_BY.warnAhead + DRIVE_BY.windowAhead) / 2, i)!; assert(mid.fill > .45 && mid.fill < .55 && mid.phase === "warn");
  assert(driveByRing(c, i)!.perfect && !driveByRing(h - DRIVE_BY.windowAhead, i)!.perfect);
  assert(DRIVE_BY.windowAhead / DELIVERY_GAME_CONFIG.forwardSpeedPerSecond >= .9, "Window lasts about a second at riding speed");
}
assert.equal(driveByPhase(0, 99), "far");
// Delivery windows stay clear of the fork (guidance text must not collide with fork signs).
for (let i = 0; i < DELIVERY_STOPS.length; i++) { const h = houseDistance(i); assert(h + 5 < ROAD_CLOSURE.junctionDistance - 60 || h - DRIVE_BY.warnAhead > ROAD_CLOSURE.mergeEnd); }
// Lanes: three only, no turn lane to wander into.
assert.equal(nextDeliveryLane(190, 0, -1), 0); assert.equal(nextDeliveryLane(190, 2, 1), 2); assert.equal(nextDeliveryLane(190, 1, 1), 2);
assert.equal(settledDeliveryLane(190, 3), 2); assert.equal(laneTargetX(-1, 190), -DELIVERY_GAME_CONFIG.laneSpacing);
// Fork: the closed main road is gone, so the center line carries on past the old gate.
const gate = getRouteFrame(ROAD_CLOSURE.distance), after = getRouteFrame(ROAD_CLOSURE.distance + 30);
assert(gate.position.distanceTo(after.position) > 25 && new THREE.Vector3().subVectors(after.position, gate.position).dot(gate.tangent) > 0);
console.log("Drive-by: phases, throw window beside each house, three lanes, open center road verified.");
