import assert from "node:assert/strict";
import { CHUNK_METERS, createChunkedRoute } from "../data/challenge-route";
import { getRouteFrame, setRouteProvider } from "../data/delivery-map";

const route = createChunkedRoute(42);
let prev = route(0).point;
for (let d = 1; d <= 3000; d += 1) {
  const { point, tangent } = route(d);
  assert(Math.abs(point.distanceTo(prev) - 1) < 0.01, `Unit arc length at ${d} m`);
  assert(Math.abs(tangent.length() - 1) < 1e-9);
  prev = point;
}
assert(route(50).point.x === 0, "First chunk is straight ahead");
assert(route(2500).point.equals(createChunkedRoute(42)(2500).point), "Same seed, same road");
assert(!route(2500).point.equals(createChunkedRoute(7)(2500).point), "Other seed, other road");
// Boundary continuity: just before and after a chunk start sit 0.02 m apart.
assert(Math.abs(route(CHUNK_METERS * 3 - .01).point.distanceTo(route(CHUNK_METERS * 3 + .01).point) - .02) < 1e-3);

const brandEnd = getRouteFrame(5000).position.clone();
assert(brandEnd.equals(getRouteFrame(1000).position), "Brand road clamps at its end");
setRouteProvider(route);
assert(getRouteFrame(2500).position.equals(route(2500).point), "Challenge road runs past 1 km");
setRouteProvider(null);
assert(getRouteFrame(5000).position.equals(brandEnd), "Reset restores the brand road");
console.log("Chunked challenge road verified: smooth, seeded, endless; brand road unchanged.");
