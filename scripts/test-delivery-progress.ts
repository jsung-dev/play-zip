import assert from "node:assert/strict";
import { advanceDeliveryTargets, completedDeliveryCount, type DeliveryProgress } from "../components/delivery/delivery-progress";
import { DRIVE_BY, houseDistance } from "../components/delivery/delivery-driveby";
import { DELIVERY_STOPS } from "../data/delivery-map";

const fresh = (): DeliveryProgress => ({position: 0, driveway: null, stopIndex: 0, completedStops: [], skippedStops: []});
for (const [i] of DELIVERY_STOPS.entries()) {
  const state = {...fresh(), stopIndex: i, completedStops: Array.from({length: i}, (_, n) => n), position: houseDistance(i)};
  assert.equal(advanceDeliveryTargets(state).stopIndex, i, "Reaching the house keeps it as the target");
  const edge = houseDistance(i) + DRIVE_BY.windowBehind;
  assert.equal(advanceDeliveryTargets({...state, position: edge}).stopIndex, i, "Still inside the throw window");
  const skipped = advanceDeliveryTargets({...state, position: edge + .01});
  assert.equal(skipped.stopIndex, i + 1); assert.deepEqual(skipped.skippedStops, [i]);
  assert.equal(completedDeliveryCount(state.completedStops, false), i);
}
const skippedAll = advanceDeliveryTargets({...fresh(), position: 1000});
assert.deepEqual(skippedAll.skippedStops, [0, 1, 2]); assert.equal(skippedAll.stopIndex, 3);
const done = advanceDeliveryTargets({...fresh(), position: 1000, completedStops: [1], skippedStops: [0, 1]});
assert.deepEqual(done.skippedStops, [0, 2], "A delivered house is never listed as skipped");
assert.equal(completedDeliveryCount([], true), 1);
assert.equal(completedDeliveryCount([0, 1, 2], true), 4);
console.log("Drive-by progress: window edges, skip on pass, final counts verified.");
