import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG, OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE } from "../data/delivery-map";
import { BOOSTERS, GAPS, GAP_LENGTH, RAMPS, RAMP_MAX_SPEED, RAMP_MIN_SPEED, boosterHit, gapUnder, rampFlight, rampHit } from "../components/delivery/delivery-pickups";
import { jumpDuration } from "../components/delivery/delivery-jump";
import { MOVER_PLACEMENTS, moverPose } from "../components/delivery/delivery-movers";

const top = DELIVERY_GAME_CONFIG.forwardSpeedPerSecond;
// The gap really needs the ramp: a normal jump at top speed falls short, a ramp flight clears it.
assert(jumpDuration() * top < GAP_LENGTH, "A normal jump cannot cross a collapsed road");
assert(rampFlight(RAMP_MIN_SPEED) > GAP_LENGTH + 1.5, "A ramp flight always clears the gap with a margin");

for (const [i, ramp] of RAMPS.entries()) {
  const gap = GAPS[i], x = (ramp.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing, route = ramp.branch ?? "main";
  assert(rampHit(ramp.distance - .4, ramp.distance + .4, x, route, false), "Ramp launches on contact");
  assert.equal(rampHit(ramp.distance - .4, ramp.distance + .4, x + 2.5, route, false), null, "Only the ramp's lane launches");
  assert(gapUnder(gap.start + 1, route, false), "Riding into the gap falls");
  assert.equal(gapUnder(gap.start + 1, route, true), null, "Flying over does not fall");
  if (ramp.branch) assert.equal(gapUnder(gap.start + 1, "main", false), null, "Detour gaps are not on the (closed) main road");
  // The flight must not skip other hazards: nothing from the ramp to 8 m past landing.
  const clearUntil = ramp.distance + rampFlight(RAMP_MAX_SPEED) + 8;
  for (const o of OBSTACLE_PLACEMENTS.filter(o => o.branch === ramp.branch || (!o.branch && !ramp.branch)))
    assert(o.distance < ramp.distance - 3 || o.distance > clearUntil, `${o.id} is jumped over by the ramp at ${ramp.distance}`);
  for (const m of MOVER_PLACEMENTS) for (const t of [0, 1, 2, 3, 4]) {
    const d = moverPose(m, t).distance;
    if (!ramp.branch) assert(d < ramp.distance - 3 || d > clearUntil || moverPose(m, t).done, `${m.id} overlaps the ramp/gap at ${ramp.distance}`);
  }
  // Clear of alleys and the fork split.
  for (const stop of DELIVERY_STOPS) assert(Math.abs(ramp.distance - stop.distance) > 40, "Ramp clear of alley entrances");
  if (!ramp.branch) assert(ramp.distance < ROAD_CLOSURE.junctionDistance - 40 || ramp.distance > ROAD_CLOSURE.mergeEnd + 10);
}

assert(BOOSTERS.length >= 4 && BOOSTERS.length <= 8, "A handful of boosters, not a trail");
const taken = new Set<number>();
for (const [i, b] of BOOSTERS.entries()) {
  const x = (b.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing, route = b.branch ?? "main";
  assert.equal(boosterHit(b.distance - .5, b.distance + .5, x, route, taken), i, "Riding through a booster collects it");
  assert.equal(boosterHit(b.distance - .5, b.distance + .5, x + 2.5, route, taken), -1, "Other lanes miss it");
  taken.add(i);
  assert.equal(boosterHit(b.distance - .5, b.distance + .5, x, route, taken), -1, "Collected once");
  for (const gap of GAPS) assert(b.distance < gap.start - 5 || b.distance > gap.end + 3 || b.branch !== gap.branch, "No booster inside a gap");
}
console.log(`Gaps need the ramp (normal jump ${(jumpDuration() * top).toFixed(1)} m < ${GAP_LENGTH} m < ramp ${rampFlight(RAMP_MIN_SPEED).toFixed(1)} m); ramps skip no hazards; ${BOOSTERS.length} boosters verified.`);
