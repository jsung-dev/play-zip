import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, TURN_LANE } from "../data/delivery-map";
import { MOVER_PLACEMENTS, MOVER_SHAPE, moverPose } from "../components/delivery/delivery-movers";

const lanes = [-1, 0, 1].map(n => n * DELIVERY_GAME_CONFIG.laneSpacing);
for (const m of MOVER_PLACEMENTS) {
  const start = moverPose(m, 0);
  assert(m.trigger < m.distance, `${m.id} wakes before the rider reaches it`);
  // Readable: visible at least ~1.5 s at top speed before it reaches the rider's path.
  assert(start.distance - m.trigger >= 25, `${m.id} needs a visible lead-in`);
  assert(!start.done, `${m.id} starts on screen`);
  // Never parked inside an alley approach or the detour fork.
  for (const stop of DELIVERY_STOPS) assert(Math.abs(start.distance - stop.distance) > TURN_LANE.approach / 2, `${m.id} clear of ${stop.id} entrance`);
  assert(start.distance < ROAD_CLOSURE.junctionDistance - 50 || start.distance > ROAD_CLOSURE.mergeEnd + 5, `${m.id} clear of the fork`);
}
const cat = MOVER_PLACEMENTS.find(m => m.kind === "cat")!;
assert(moverPose(cat, 0).x < lanes[0] - 2, "Cat starts on the kerb, off the lanes");
assert(lanes.every(x => [0, 1, 2, 3, 4, 5, 6].some(t => Math.abs(moverPose(cat, t).x - x) < .6)), "Cat crosses every lane");
assert(moverPose(cat, 7).done, "Cat leaves the road");
const bus = MOVER_PLACEMENTS.find(m => m.kind === "bus")!;
assert(moverPose(bus, 1).x > lanes[2] + 2, "Bus waits at the kerb while its indicator blinks");
assert(Math.abs(moverPose(bus, 6).x - lanes[2]) < .01, "Bus settles into the right lane only");
assert(moverPose(bus, 30).x > lanes[2] + 2, "Bus leaves the lanes again before later obstacles");
assert.equal(MOVER_SHAPE.bus.clearance, null, "A bus cannot be jumped");
assert(MOVER_SHAPE.cat.clearance! < 1 && MOVER_SHAPE.ball.clearance! < 1, "Cat and ball can be jumped");
const ball = MOVER_PLACEMENTS.find(m => m.kind === "ball")!;
assert(moverPose(ball, 2).distance < moverPose(ball, 0).distance, "Ball rolls toward the rider");
console.log("Movers: readable lead-in, clear of alleys/fork, cat crossing, bus merge, ball roll verified.");
