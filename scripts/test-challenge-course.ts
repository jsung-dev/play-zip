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
  for (const b of BOOSTERS) {
    assert(hazards.every(h => Math.abs(h - b.distance) >= 8), "Boosters sit clear of hazards");
    assert(!GAPS.some(g => b.distance > g.start - 3 && b.distance < g.end + 2), "No booster over a collapsed road");
  }
  chunks.forEach((c, i) => assert.equal(c.ads.length, i % 3 === 2 ? 1 : 0, "An ad every 300 m"));
  for (const x of [...obstacles, ...movers]) busy[Math.min(9, Math.floor(x.distance / 1_000))]++;
}
const first = JSON.stringify(run(77)), again = JSON.stringify(run(77));
assert.equal(first, again, "Same seed, same course");
assert(busy[5] > busy[0] * 1.3, `Later kilometres are busier (km0 ${busy[0]}, km5 ${busy[5]})`);
console.log(`Challenge course verified over 200 rides x 10 km; hazards per km: ${busy.map(n => (n / 200).toFixed(1)).join(" ")}.`);
