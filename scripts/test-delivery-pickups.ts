import assert from "node:assert/strict";
import { OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE } from "../data/delivery-map";
import { DROPS, RAMPS, collectDrops, rampHit } from "../components/delivery/delivery-pickups";
import { jumpHeightAt, jumpDuration, RAMP_POWER, clearsObstacle, obstacleCenterX } from "../components/delivery/delivery-jump";

assert(DROPS.length > 100, "Enough drops to build combos");
for (const d of DROPS) {
  assert(d.distance > 95 && d.distance < 945, "Drops stay off the start and the final approach");
  if (!d.branch) assert(d.distance < ROAD_CLOSURE.junctionDistance || d.distance > ROAD_CLOSURE.mergeEnd, "Main-road drops avoid the closed road");
  for (const stop of DELIVERY_STOPS) assert(Math.abs(d.distance - stop.distance) > 6 || d.x > 0 === (stop.side === "left"), "Drops never sit in the alley mouth's lane");
}
// Ground pickup: riding straight through the first row collects it.
const first = collectDrops(99, 101, 0, 0, "main", new Set());
assert.equal(first.length, 1);
assert.deepEqual(collectDrops(99, 101, 2.5, 0, "main", new Set()), [], "Other lanes are not collected");
assert.deepEqual(collectDrops(99, 101, 0, 0, "main", new Set(first)), [], "A drop is collected once");
// Air drops need a jump: the arc over the 118 plank is only reachable in the air.
const arcIndex = DROPS.findIndex(d => d.distance > 115 && d.distance < 121 && d.y > 1.6);
assert(arcIndex >= 0);
const a = DROPS[arcIndex];
assert.deepEqual(collectDrops(a.distance - .5, a.distance + .5, a.x, 0, "main", new Set()), [], "Air drops are out of reach on the ground");
assert(collectDrops(a.distance - .5, a.distance + .5, a.x, a.y - .9, "main", new Set()).includes(arcIndex), "Jumping collects air drops");
// Branch drops exist only on their branch.
const left = DROPS.findIndex(d => d.branch === "left");
assert.deepEqual(collectDrops(DROPS[left].distance - .5, DROPS[left].distance + .5, DROPS[left].x, 0, "right", new Set()).filter(i => i === left), []);
// Ramps launch over the obstacle right after them.
for (const ramp of RAMPS) {
  assert(rampHit(ramp.distance - .4, ramp.distance + .4, (ramp.lane - 1) * 2.5, ramp.branch ?? "main", false), "Ramp launches on contact");
  assert.equal(rampHit(ramp.distance - .4, ramp.distance + .4, (ramp.lane - 1) * 2.5, ramp.branch ?? "main", true), null, "No relaunch while airborne");
  const air = jumpDuration(RAMP_POWER) * 20;
  for (const o of OBSTACLE_PLACEMENTS.filter(o => (o.branch ?? undefined) === ramp.branch && o.distance > ramp.distance && o.distance < ramp.distance + air)) {
    if (Math.abs(obstacleCenterX(o) - (ramp.lane - 1) * 2.5) > 2.6) continue;
    const t = (o.distance - ramp.distance) / 20;
    assert(clearsObstacle(o.kind, jumpHeightAt(t, RAMP_POWER)), `Ramp at ${ramp.distance} clears ${o.id}`);
  }
}
console.log(`Pickups: ${DROPS.length} drops, ground/air/branch rules, ${RAMPS.length} ramps clearing their obstacles verified.`);
