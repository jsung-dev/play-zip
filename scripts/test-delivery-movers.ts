import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, TURN_LANE } from "../data/delivery-map";
import { BOOM_CYCLE, DROP, MOVER_PLACEMENTS, MOVER_SHAPE, TIMED, moverCollides, moverPose, snapToLane } from "../components/delivery/delivery-movers";

const lanes = [-1, 0, 1].map(n => n * DELIVERY_GAME_CONFIG.laneSpacing);
const find = (kind: string) => MOVER_PLACEMENTS.find(m => m.kind === kind)!;
for (const m of MOVER_PLACEMENTS.filter(m => moverCollides(m.kind))) {
  // Triggered hazards wake far enough ahead to be read (≥ 1.4 s at top speed).
  if (!TIMED.has(m.kind)) assert(m.distance - m.trigger >= 28, `${m.id} needs a visible lead-in`);
  for (const stop of DELIVERY_STOPS) assert(Math.abs(m.distance - stop.distance) > TURN_LANE.approach / 2, `${m.id} clear of ${stop.id} entrance`);
  if (!m.branch) assert(m.distance < ROAD_CLOSURE.junctionDistance - 50 || m.distance > ROAD_CLOSURE.mergeEnd + 5, `${m.id} clear of the fork`);
}
// Timed hazards keep moving whatever the rider does: they must be timed, not out-waited by luck.
const cat = find("cat"), ducks = find("ducks");
for (const m of [cat, ducks]) {
  const xs = Array.from({ length: 200 }, (_, n) => moverPose(m, n * .1).x);
  assert(Math.min(...xs) < lanes[0] - 2 && Math.max(...xs) > lanes[2] + 2, `${m.id} paces kerb to kerb`);
  assert(lanes.every(x => xs.some(v => Math.abs(v - x) < .3)), `${m.id} crosses every lane`);
}
const boom = find("boom"), period = BOOM_CYCLE.down + BOOM_CYCLE.rise + BOOM_CYCLE.up + BOOM_CYCLE.lower;
const open = Array.from({ length: 100 }, (_, n) => moverPose(boom, n * period / 100).live).filter(live => !live).length;
assert(open > 30 && open < 70, "Boom gate is open roughly half the time");
assert(MOVER_SHAPE.boom.clearance! < 1.5, "A down boom can be jumped");
const slider = find("slider"), sweep = Array.from({ length: 80 }, (_, n) => moverPose(slider, n * .05).x);
assert(lanes.every(x => sweep.some(v => Math.abs(v - x) < .4)), "Slider sweeps all three lanes");
assert.equal(MOVER_SHAPE.slider.clearance, null, "The sliding barrier cannot be jumped");
// Falling parcel lands in the lane captured at wake-up, and only hits near the ground.
const drop = find("dropper");
assert.equal(moverPose(drop, 10, 10, snapToLane(2.3)).x, lanes[2]);
assert(!moverPose(drop, 10.3, 10, 0).live && moverPose(drop, 10 + DROP.seconds, 10, 0).live);
const bus = find("bus");
assert(moverPose(bus, 1, 0).x > lanes[2] + 2, "Bus waits at the kerb while its indicator blinks");
assert(Math.abs(moverPose(bus, 6, 0).x - lanes[2]) < .01, "Bus settles into the right lane only");
assert(moverPose(bus, 30, 0).x > lanes[2] + 2, "Bus leaves the lanes again before later obstacles");
for (const drum of MOVER_PLACEMENTS.filter(m => m.kind === "drum")) assert(moverPose(drum, 3, 0).distance < drum.distance && drum.lane !== 1, "Drums roll toward the rider in the side lanes");
assert(MOVER_PLACEMENTS.filter(m => m.kind === "pigeons").every(m => !moverCollides(m.kind)), "Pigeons are scenery only");
console.log("Movers: timed cat/ducks/boom/slider, aimed parcel, drums, bus verified.");
