import assert from "node:assert/strict";
import { DELIVERY_GAME_CONFIG } from "../data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE } from "../data/delivery-map";
import { DRIVE_BY, houseDistance } from "../components/delivery/delivery-driveby";
import { BOOM_CYCLE, DROP, GATE_CYCLE, GEYSER_CYCLE, MOVER_PLACEMENTS, MOVER_SHAPE, TIMED, moverCollides, moverPose, snapToLane } from "../components/delivery/delivery-movers";

const lanes = [-1, 0, 1].map(n => n * DELIVERY_GAME_CONFIG.laneSpacing);
const find = (kind: string) => MOVER_PLACEMENTS.find(m => m.kind === kind)!;
for (const m of MOVER_PLACEMENTS.filter(m => moverCollides(m.kind))) {
  // Triggered hazards wake far enough ahead to be read (≥ 1.4 s at top speed).
  if (!TIMED.has(m.kind)) assert(m.distance - m.trigger >= 28, `${m.id} needs a visible lead-in`);
  for (const i of DELIVERY_STOPS.keys()) assert(Math.abs(m.distance - houseDistance(i)) > DRIVE_BY.protect, `${m.id} clear of the delivery zone ${i}`);
  if (!m.branch) assert(m.distance < ROAD_CLOSURE.junctionDistance - 20 || m.distance > ROAD_CLOSURE.mergeEnd + 5, `${m.id} clear of the fork`);
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

// Lane gates: each lane has its own timer, and some lane is always open.
const gates = MOVER_PLACEMENTS.filter(m => m.kind === "lanegate");
assert.equal(gates.length % 3, 0, "Gates come in sets of three lanes");
for (const distance of new Set(gates.map(g => g.distance))) {
  const set = gates.filter(g => g.distance === distance);
  assert.deepEqual(set.map(g => g.lane).sort(), [0, 1, 2]);
  const period = GATE_CYCLE.down + GATE_CYCLE.rise + GATE_CYCLE.up + GATE_CYCLE.lower;
  for (let t = 0; t < 2 * period; t += .02) assert(set.some(g => !moverPose(g, t).live), `A lane gate set at ${distance} is open somewhere at ${t.toFixed(2)}s`);
  for (const g of set) assert(Math.abs(moverPose(g, 1).x - lanes[g.lane! as 0 | 1 | 2]) < 1e-9, "A gate stays in its own lane");
}
assert(MOVER_SHAPE.lanegate.halfWidth + .7 < DELIVERY_GAME_CONFIG.laneSpacing, "A closed gate never catches the next lane");
// Steam vents: warn first, never all three lanes blasting together, and a blast is a jumpable ~1 s window.
const vents = MOVER_PLACEMENTS.filter(m => m.kind === "geyser");
const ventPeriod = GEYSER_CYCLE.rest + GEYSER_CYCLE.warn + GEYSER_CYCLE.blast + GEYSER_CYCLE.settle;
for (const [distance, branch] of new Set(vents.map(v => `${v.distance}|${v.branch ?? ""}`)).values().map(k => k.split("|"))) {
  const set = vents.filter(v => v.distance === Number(distance) && (v.branch ?? "") === branch);
  assert.deepEqual(set.map(v => v.lane).sort(), [0, 1, 2]);
  let liveSamples = 0, samples = 0;
  for (let t = 0; t < 3 * ventPeriod; t += .02) {
    const live = set.filter(v => moverPose(v, t).live).length;
    assert(live <= 2, `Steam vents at ${distance} never block all lanes (${live} at ${t.toFixed(2)}s)`);
    liveSamples += live; samples += 3;
  }
  assert(liveSamples / samples > .2 && liveSamples / samples < .5, "Each vent blasts a fair share of the time");
  for (const v of set) {
    let warned = false, wasLive = true, blasts = 0;
    for (let t = 0; t < 3 * ventPeriod; t += .02) {
      const p = moverPose(v, t);
      if (p.y > 0 && !p.live) warned = true;
      if (p.live && !wasLive) { assert(warned, "A vent warns before it blasts"); blasts++; }
      if (!p.live && wasLive) warned = false;
      wasLive = p.live;
    }
    assert(blasts >= 2, "A vent keeps cycling");
  }
}
assert(MOVER_SHAPE.geyser.clearance! < 1.5, "A steam blast can be jumped");
// Runaway cart: kerb to kerb, jumpable.
const cartXs = Array.from({ length: 300 }, (_, n) => moverPose(find("cart"), n * .1).x);
assert(Math.min(...cartXs) < lanes[0] - 1.5 && Math.max(...cartXs) > lanes[2] + 1.5, "The cart crosses every lane");
// Falling things: fixed-lane ones fall in their lane, staggered by `delay`; aimed ones follow the rider.
for (const d of MOVER_PLACEMENTS.filter(m => m.kind === "dropper")) {
  const start = 10, delay = d.delay ?? 0;
  assert(!moverPose(d, start + delay + .1, start, 0).live, `${d.id} is still in the air just after waking`);
  assert(moverPose(d, start + delay + DROP.seconds, start, 0).live, `${d.id} has landed after the fall`);
  if (d.lane !== undefined) assert.equal(moverPose(d, start, start, lanes[1]).x, lanes[d.lane], `${d.id} falls in its own lane`);
  else assert.equal(moverPose(d, start, start, lanes[2]).x, lanes[2], `${d.id} is aimed at the rider's lane`);
}
assert(MOVER_PLACEMENTS.filter(m => m.kind === "dropper").length >= 4, "Plenty of things fall from the sky");
assert(MOVER_PLACEMENTS.some(m => m.kind === "dropper" && m.look === "pot") && MOVER_PLACEMENTS.some(m => m.kind === "dropper" && m.look === "melon"), "Falling things come in different kinds");
// The two detours get different hazards.
const kindsOf = (branch: string) => new Set(MOVER_PLACEMENTS.filter(m => m.branch === branch).map(m => m.kind));
assert.notDeepEqual([...kindsOf("left")].sort(), [...kindsOf("right")].sort(), "Left and right detours differ");
console.log("Movers: timed cat/ducks/boom/slider/cart/gates/steam, falling things, drums, bus verified.");
