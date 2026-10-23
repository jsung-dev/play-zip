import assert from "node:assert/strict";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDrivewayExitDistance } from "../data/delivery-map";
import { DRIVE_BY, houseDistance } from "../components/delivery/delivery-driveby";
import { OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { SECTIONS } from "../components/delivery/delivery-course";
import { GAP_LENGTH, RAMPS, RAMP_MAX_SPEED, rampFlight } from "../components/delivery/delivery-pickups";
import { moverCollides } from "../components/delivery/delivery-movers";
import { MAX_GAP, MIN_MOVERS, STRETCHES, TARGET_COST, applyCourse, generateCourse, restoreDefaultCourse } from "../components/delivery/delivery-random-course";

// Every generated ride must keep the course rules. Sweep many seeds.
const SEEDS = 3000, budget = TARGET_COST;
const rampLanes = new Set<number>(), layouts = new Set<string>();
const inStretch = (d: number) => STRETCHES.some(s => d >= s.from && d <= s.to + 48);
for (let seed = 1; seed <= SEEDS; seed++) {
  const c = generateCourse(seed);
  assert.deepEqual(generateCourse(seed), c, `seed ${seed}: deterministic`);
  assert(c.cost > 0, `seed ${seed}: generated, not the fallback`);
  assert(c.cost >= budget - 6 && c.cost <= budget + 6, `seed ${seed}: difficulty ${c.cost} near ${budget}`);
  const obs = c.obstacles.filter(o => !o.branch), movers = c.movers.filter(m => !m.branch), ramps = c.ramps.filter(r => !r.branch);
  const hazards = [...obs.map(o => ({ d: o.distance, what: o.kind, lane: o.lane, span: o.span ?? 1 })), ...movers.map(m => ({ d: m.distance, what: m.kind, lane: m.lane ?? -1, span: m.lane === undefined ? 3 : 1 }))];
  // Kept clear (same zones as the jump/movers/pickups tests): delivery zones, fork approach, merge, finish.
  for (const h of hazards) {
    for (const i of DELIVERY_STOPS.keys()) assert(h.d < houseDistance(i) - DRIVE_BY.protect || h.d > houseDistance(i) + DRIVE_BY.protect, `seed ${seed}: ${h.what}@${h.d} clear of delivery ${i}`);
    const fixed = obs.some(o => o.distance === h.d && o.kind === h.what);
    if (fixed) assert(!(h.d >= ROAD_CLOSURE.junctionDistance - 20 && h.d <= 505) && !(h.d >= 700 - 10 && h.d < 700) && h.d < 940, `seed ${seed}: ${h.what}@${h.d} in a reserved zone`);
    else assert(h.d < ROAD_CLOSURE.junctionDistance - 20 || h.d > ROAD_CLOSURE.mergeEnd + 5 || (h.d > 505 && h.d < 700), `seed ${seed}: ${h.what}@${h.d} clear of the fork`);
    assert(h.d <= 975, `seed ${seed}: ${h.what}@${h.d} clear of the finish`);
  }
  for (const r of ramps) for (const i of DELIVERY_STOPS.keys()) { const exit = getDrivewayExitDistance(i); assert(r.distance < exit - 40 || r.distance > exit + 35, `seed ${seed}: ramp ${r.distance} near alley exit ${exit}`); }
  // As busy as the authored ride (the course test asks for >= 20 main-road hazards).
  const busy = obs.filter(o => o.kind !== "signbeam").length + movers.filter(m => moverCollides(m.kind) && m.kind !== "drum").length + ramps.length;
  assert(busy >= 20, `seed ${seed}: busy enough (${busy})`);
  // Variety: at least MIN_MOVERS kinds of moving hazard in the random stretches.
  const movingKinds = new Set(movers.filter(m => inStretch(m.distance)).map(m => m.kind));
  assert(movingKinds.size >= MIN_MOVERS, `seed ${seed}: ${movingKinds.size} moving kinds`);
  // Dense: inside a stretch, no run longer than MAX_GAP without a hazard (a ramp's flight and landing excepted).
  for (const st of STRETCHES) {
    const inside = [...new Set([...hazards.map(h => h.d), ...ramps.map(r => r.distance)])].filter(x => x >= st.from && x <= st.to).sort((a, b) => a - b);
    for (let i = 1; i < inside.length; i++) {
      const afterRamp = ramps.some(r => inside[i - 1] >= r.distance - 11 && inside[i - 1] <= r.distance);
      assert(inside[i] - inside[i - 1] <= MAX_GAP + (afterRamp ? 32 + 10 : 0), `seed ${seed}: empty run ${inside[i - 1]} -> ${inside[i]}`);
    }
  }
  // Mandatory sets.
  const slams = obs.filter(o => o.kind === "plank" && o.span === 3 && obs.some(b => b.kind === "signbeam" && b.distance - o.distance === 9));
  assert(slams.length >= 2, `seed ${seed}: >= 2 jump-then-slam sets`);
  assert(obs.some(o => o.kind === "overhead"), `seed ${seed}: a duck beam`);
  assert.equal(ramps.length, 2, `seed ${seed}: two main-road ramps`);
  // Spacing: at least 10 m apart (combos step 12-14 m; patterns themselves 20-30 m), except jump-slam and ramp funnels.
  const events = [...new Set(hazards.filter(h => inStretch(h.d)).map(h => h.d)), ...ramps.map(r => r.distance)].sort((a, b) => a - b);
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i], gap = b - a;
    const pair = gap === 9 && obs.some(o => o.kind === "plank" && o.distance === a) && obs.some(o => o.kind === "signbeam" && o.distance === b)
      || gap === 11 && ramps.some(r => r.distance === b);
    assert(gap >= 10 || pair, `seed ${seed}: ${a} -> ${b} too close`);
  }
  // Ramps: approach lane clear for 25 m, nothing in the gap or the 10 m landing.
  for (const r of ramps) {
    rampLanes.add(r.lane);
    for (const h of hazards) {
      const covers = h.lane < 0 || (r.lane >= h.lane && r.lane < h.lane + h.span);
      assert(!(covers && h.d > r.distance - 25 && h.d < r.distance), `seed ${seed}: ramp ${r.distance} lane ${r.lane} approach blocked by ${h.what}@${h.d}`);
      assert(!(h.d >= r.distance - 3 && h.d <= r.distance + rampFlight(RAMP_MAX_SPEED) + 8), `seed ${seed}: ${h.what}@${h.d} skipped by the ramp ${r.distance} flight`);
    }
  }
  // Always a way through: barriers never close all three lanes at one spot.
  for (const d of new Set(obs.map(o => o.distance))) {
    const walls = new Set(obs.filter(o => o.distance === d && o.kind === "barrier").map(o => o.lane));
    assert(walls.size < 3, `seed ${seed}: barriers close the road at ${d}`);
  }
  // Boosters: a handful, out of gaps and off hazards.
  const boosters = c.boosters.filter(b => !b.branch);
  assert(boosters.length === 4, `seed ${seed}: 4 main boosters`);
  for (const b of boosters) {
    assert(!ramps.some(r => b.distance > r.distance - 2 && b.distance < r.distance + 3 + GAP_LENGTH), `seed ${seed}: booster ${b.distance} not in a gap`);
    assert(!hazards.some(h => Math.abs(h.d - b.distance) < 8), `seed ${seed}: booster ${b.distance} off hazards`);
  }
  assert(c.sections.some(s => s.from === 70) && c.sections.every((s, i, all) => i === 0 || s.from >= all[i - 1].from), `seed ${seed}: sections kept in order`);
  if (seed <= 200) layouts.add(JSON.stringify([obs, movers, ramps]));
}
assert.equal(rampLanes.size, 3, "Ramps show up in every lane across rides");
assert(layouts.size >= 195, `Rides differ (${layouts.size}/200 unique)`);

// applyCourse swaps the live arrays in place; restore brings back the authored ride.
const before = OBSTACLE_PLACEMENTS.length, c = generateCourse(42);
applyCourse(c);
assert.equal(OBSTACLE_PLACEMENTS.length, c.obstacles.length);
assert.deepEqual(RAMPS, c.ramps);
assert.deepEqual(SECTIONS, c.sections);
restoreDefaultCourse();
assert.equal(OBSTACLE_PLACEMENTS.length, before);
console.log(`Random course: ${SEEDS} rides keep the rules; difficulty ~${budget}; ramp lanes ${[...rampLanes].sort().join(",")}; ${layouts.size}/200 unique.`);
