import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG, OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { DELIVERY_STOPS, DRIVEWAY_ROUTE, ROAD_CLOSURE, TURN_LANE, getDrivewayExitDistance } from "../data/delivery-map";
import { JUMP_CONFIG, OBSTACLE_CLEARANCE, clearsObstacle, jumpHeightAt, obstacleCenterX, obstacleHitHalfWidth } from "../components/delivery/delivery-jump";

assert.equal(jumpHeightAt(null), 0);
assert.equal(jumpHeightAt(JUMP_CONFIG.seconds), 0);
assert(Math.abs(jumpHeightAt(JUMP_CONFIG.seconds / 2) - JUMP_CONFIG.height) < 1e-9);
assert(!clearsObstacle("barrier", 99), "Fences cannot be jumped");
assert(!clearsObstacle("plank", 0), "Grounded bike still collides");

const spacing = DELIVERY_GAME_CONFIG.laneSpacing;
for (const o of OBSTACLE_PLACEMENTS) {
  const clearance = OBSTACLE_CLEARANCE[o.kind];
  if (clearance !== null) {
    // At full speed the press timing must allow at least 0.2s of slack.
    const p = (1 - Math.sqrt(1 - clearance / JUMP_CONFIG.height)) / 2;
    const crossing = 2 * DELIVERY_GAME_CONFIG.collisionHalfLength / DELIVERY_GAME_CONFIG.forwardSpeedPerSecond;
    assert((1 - 2 * p) * JUMP_CONFIG.seconds - crossing >= 0.2, `${o.id} jump timing window too short`);
  }
  if ((o.span ?? 1) === 3) {
    for (const lane of [0, 1, 2]) assert(Math.abs((lane - 1) * spacing - obstacleCenterX(o)) < obstacleHitHalfWidth(o), `${o.id} blocks lane ${lane}`);
  }
  assert(o.lane + (o.span ?? 1) - 1 <= 2, `${o.id} stays on the three through lanes`);
}

// Jump obstacles avoid the start, the last 30 m before each alley, alley exits, the detour and the final approach.
const blocked: [number, number][] = [[0, 70], [ROAD_CLOSURE.junctionDistance - 60, ROAD_CLOSURE.mergeEnd + 10], [940, 1000]];
for (const [i, stop] of DELIVERY_STOPS.entries()) {
  blocked.push([stop.distance - 30, stop.distance + TURN_LANE.tail]);
  const exit = getDrivewayExitDistance(i);
  // Only the merge itself; reversing back into an exit is rare, so obstacles may follow it.
  blocked.push([exit - DRIVEWAY_ROUTE.passMargin, exit + 15]);
}
for (const o of OBSTACLE_PLACEMENTS) {
  if (o.branch) {
    // Detour obstacles sit on the fully offset part of their branch only.
    assert(o.distance > ROAD_CLOSURE.junctionDistance + ROAD_CLOSURE.rampMeters && o.distance < ROAD_CLOSURE.mergeStart, `${o.id} on the straight detour section`);
    continue;
  }
  for (const [from, to] of blocked) assert(o.distance < from || o.distance > to, `${o.id} sits in a reserved zone ${from}-${to}`);
}
assert(OBSTACLE_PLACEMENTS.filter(o => o.span === 3).length >= 2, "Has must-jump obstacles");
console.log("Jump arc, clearance, lane coverage and reserved-zone placement verified.");
