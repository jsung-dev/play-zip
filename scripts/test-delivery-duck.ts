import assert from "node:assert/strict";
import { DUCK, duckPose, duckWalkSeconds, meetPoint, type DuckPhaseInput } from "../components/delivery/three/duck-resident";

const rest = { u: DUCK.restU, v: 0 }, door = { u: 11, v: 0 }, base: DuckPhaseInput = { waving: false, arrived: 0, delivered: null, rest, meet: meetPoint(0, 1), door };
const dist = (a: { u: number; v: number }, b: { u: number; v: number }) => Math.hypot(a.u - b.u, a.v - b.v);

// Waits on the sidewalk, waves when the bike is near.
assert.deepEqual(duckPose(base).at, rest); assert.equal(duckPose(base).anim, "idle");
assert.equal(duckPose({ ...base, waving: true }).anim, "wave");
// Walks to the bike from any lane: arrives beside it, on the house side, never inside the bike lane.
for (const bikeU of [-2.5, 0, 2.5]) {
  const meet = meetPoint(bikeU, 1), s = { ...base, meet };
  assert.equal(duckPose({ ...s, arrived: .01 }).anim, "walk");
  assert(dist(duckPose({ ...s, arrived: duckWalkSeconds(rest.u, meet.u) }).at, meet) < 1e-9, "Reaches the bike");
  assert(meet.u - bikeU >= 1.2, "Stands beside the bike, not on it");
  assert(duckWalkSeconds(rest.u, meet.u) <= 3, `far lane ${bikeU}: waits at most 3 s for the duck`);
  assert(dist(rest, meet) / duckWalkSeconds(rest.u, meet.u) <= DUCK.speed + 1e-9, "Waddle speed");
}
// After the quiz: hands over, carries the parcel home, goes inside.
const meet = meetPoint(0, 1), d = { ...base, meet };
assert.equal(duckPose({ ...d, delivered: 0 }).anim, "hand"); assert(!duckPose({ ...d, delivered: 0 }).carrying);
assert(duckPose({ ...d, delivered: DUCK.handSeconds - .01 }).carrying, "Holds the parcel at the end of the handover");
const mid = duckPose({ ...d, delivered: DUCK.handSeconds + DUCK.homeSeconds / 2 });
assert(mid.visible && mid.carrying && mid.anim === "walk");
assert(!duckPose({ ...d, delivered: DUCK.handSeconds + DUCK.homeSeconds + .01 }).visible, "Disappears through the door");
assert(DUCK.handSeconds + DUCK.homeSeconds < 3, "Finishes inside the 3 s success banner");
console.log("Duck resident: waits, waves, walks to the bike in any lane, takes the parcel, carries it home verified.");
