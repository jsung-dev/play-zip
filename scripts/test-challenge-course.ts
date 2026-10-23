import assert from "node:assert/strict";
import { OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { CHALLENGE_COURSE, challengeChunk, startChallengeCourse } from "../components/delivery/delivery-challenge-course";
import { MOVER_PLACEMENTS } from "../components/delivery/delivery-movers";
import { BOOSTERS, GAPS, RAMPS } from "../components/delivery/delivery-pickups";

const HARD = /^(slam-|geyser-|gate-|duckbar-|duckslide-|rhythm-)/;
const run = (seed: number) => {
  startChallengeCourse(seed);
  return Array.from({ length: 100 }, (_, i) => challengeChunk(i)); // 10 km
};
const busy = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
for (let seed = 1; seed <= 200; seed++) {
  const chunks = run(seed);
  const obstacles = chunks.flatMap(c => c.obstacles), movers = chunks.flatMap(c => c.movers), ramps = chunks.flatMap(c => c.ramps);
  assert.equal(OBSTACLE_PLACEMENTS.length, obstacles.length, "Live arrays carry exactly the generated chunks");
  assert.equal(MOVER_PLACEMENTS.length, movers.length);
  assert.equal(RAMPS.length, ramps.length);
  assert.equal(GAPS.length, ramps.length);
  assert.equal(new Set([...obstacles, ...movers].map(x => x.id)).size, obstacles.length + movers.length, "Ids stay unique");
  const hazards = [...obstacles, ...movers].map(x => x.distance);
  assert(Math.min(...hazards) >= CHALLENGE_COURSE.warmUp, "A quiet start");
  assert(ramps.every(r => r.distance >= CHALLENGE_COURSE.rampFrom), "No ramps before 1 km");
  assert(![...obstacles, ...movers].some(x => x.distance < 1_000 && HARD.test(x.id)), "Only singles in the first km");
  for (const r of ramps) assert(!hazards.some(h => h > r.distance && h < r.distance + 32), "Landing after a ramp stays clear");
  ramps.forEach((r, n) => assert(n === 0 || r.distance - ramps[n - 1].distance >= CHALLENGE_COURSE.rampSpacing, "Ramps stay 200 m apart"));
  for (const r of ramps) {
    const guards = obstacles.filter(o => o.distance >= r.distance - 11 && o.distance < r.distance);
    assert(guards.every(o => o.kind !== "cones"), "No cone funnel points at the ramp");
    if (r.distance - 11 < CHALLENGE_COURSE.rampGuardFrom) assert.equal(guards.length, 0, "Before 3 km the ramp stands alone");
    else assert.deepEqual(guards.map(o => o.lane).sort(), ([0, 1, 2] as const).filter(l => l !== r.lane), "After 3 km the other lanes are guarded");
  }
  for (const b of BOOSTERS) {
    assert(hazards.every(h => Math.abs(h - b.distance) >= 8), "Boosters sit clear of hazards");
    assert(!GAPS.some(g => b.distance > g.start - 3 && b.distance < g.end + 2), "No booster over a collapsed road");
  }
  chunks.forEach((c, i) => {
    assert.equal(c.ads.length, 1, "A roadside board every 100 m");
    assert.equal(c.overheads.length, i % 2 === 0 ? 1 : 0, "A road banner every 200 m");
  });
  assert(BOOSTERS.length >= 120, `Plenty of milk boosters (${BOOSTERS.length} in 10 km)`);
  const spots = BOOSTERS.map(b => b.distance);
  assert(spots.every((d, n) => n === 0 || d - spots[n - 1] >= 25), "Boosters stay 25 m apart");
  for (const x of [...obstacles, ...movers]) busy[Math.min(9, Math.floor(x.distance / 1_000))]++;
}
const first = JSON.stringify(run(77)), again = JSON.stringify(run(77));
assert.equal(first, again, "Same seed, same course");
assert(busy[5] > busy[0] * 1.3, `Later kilometres are busier (km0 ${busy[0]}, km5 ${busy[5]})`);
console.log(`Challenge course verified over 200 rides x 10 km; hazards per km: ${busy.map(n => (n / 200).toFixed(1)).join(" ")}.`);
