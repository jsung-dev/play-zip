import assert from "node:assert/strict";
import * as THREE from "three";
import { DRIVE_BY, driveByPhase, hasArrived, houseDistance, metersToStop } from "../components/delivery/delivery-driveby";
import { laneTargetX, nextDeliveryLane, settledDeliveryLane } from "../components/delivery/delivery-turns";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDeliveryHouseTransform, getRouteFrame } from "../data/delivery-map";
import { DELIVERY_GAME_CONFIG as config } from "../data/delivery-game";

for (const [i] of DELIVERY_STOPS.entries()) {
  const h = houseDistance(i);
  // The stop point really is beside the house.
  const house = getDeliveryHouseTransform(i).position;
  let best = 0, bestD = Infinity;
  for (let d = h - 40; d <= h + 40; d += .5) { const dist = getRouteFrame(d).position.distanceTo(house); if (dist < bestD) { bestD = dist; best = d; } }
  assert(Math.abs(best - h) <= 5, `${i}: house at ${best}, stop point ${h}`);
  assert.equal(driveByPhase(h - DRIVE_BY.warnAhead - 1, i), "far");
  assert.equal(driveByPhase(h - DRIVE_BY.warnAhead + 1, i), "warn");
  assert.equal(driveByPhase(h + DRIVE_BY.windowBehind + .1, i), "passed");
  assert(!hasArrived(h - 20, i, 0), "Not arrived far from the stop point");
  assert(!hasArrived(h, i, 10), "Not arrived while still rolling fast");
  assert(hasArrived(h - 1, i, .3));

  // Same braking rule as the game tick: from full speed the bike halts on the stop point, without overshoot.
  let position = h - DRIVE_BY.warnAhead - 10, speed: number = config.forwardSpeedPerSecond, t = 0;
  const dt = 1 / 60;
  while (!hasArrived(position, i, speed) && t < 20) {
    speed = Math.min(config.forwardSpeedPerSecond, speed + config.accelerationPerSecond * dt);
    if (driveByPhase(position, i) === "warn") speed = Math.min(speed, Math.sqrt(2 * config.deliveryAutoBrakePerSecond * metersToStop(position, i)));
    position += speed * dt; t += dt;
  }
  assert(t < 20, `${i}: bike stops (${t.toFixed(1)}s)`);
  assert(position <= h + .5 && position >= h - DRIVE_BY.stopWithin, `${i}: stopped at ${position.toFixed(2)} (house ${h})`);
}
assert.equal(driveByPhase(0, 99), "far");
for (let i = 0; i < DELIVERY_STOPS.length; i++) { const h = houseDistance(i); assert(h + 5 < ROAD_CLOSURE.junctionDistance - 60 || h - DRIVE_BY.warnAhead > ROAD_CLOSURE.mergeEnd); }
assert.equal(nextDeliveryLane(190, 0, -1), 0); assert.equal(nextDeliveryLane(190, 2, 1), 2); assert.equal(nextDeliveryLane(190, 1, 1), 2);
assert.equal(settledDeliveryLane(190, 3), 2); assert.equal(laneTargetX(-1, 190), -config.laneSpacing);
const gate = getRouteFrame(ROAD_CLOSURE.distance), after = getRouteFrame(ROAD_CLOSURE.distance + 30);
assert(gate.position.distanceTo(after.position) > 25 && new THREE.Vector3().subVectors(after.position, gate.position).dot(gate.tangent) > 0);
console.log("Drive-by stop: phases, stop point beside each house, braking to a halt, three lanes, open center road verified.");
