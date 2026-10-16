import assert from "node:assert/strict";
import { advanceDeliveryTargets, completedDeliveryCount, type DeliveryProgress } from "../components/delivery/delivery-progress";
import { DELIVERY_STOPS, DRIVEWAY_ROUTE, getDrivewayDeliveryInterval, getDrivewayExitDistance } from "../data/delivery-map";

const fresh = (): DeliveryProgress => ({position: 0, driveway: null, stopIndex: 0, completedStops: [], skippedStops: []});
for (const [i, stop] of DELIVERY_STOPS.entries()) {
  const state = {...fresh(), stopIndex: i, completedStops:Array.from({length:i},(_,n)=>n), position: stop.distance + 7};
  assert.equal(advanceDeliveryTargets(state).stopIndex, i, "Passing the entrance by a little does not skip the stop");
  const boundary = getDrivewayExitDistance(i) + DRIVEWAY_ROUTE.passMargin;
  assert.equal(advanceDeliveryTargets({...state, position: boundary}).stopIndex, i);
  const skipped = advanceDeliveryTargets({...state, position: boundary + .01});
  assert.equal(skipped.stopIndex, i + 1); assert.deepEqual(skipped.skippedStops, [i]);
  assert.equal(completedDeliveryCount(state.completedStops, false), i);
  const zone = getDrivewayDeliveryInterval(i);
  const driveway = {stopIndex:i, entryPosition:stop.distance, entryLaneX:0, progress:zone.end+.1};
  assert.equal(advanceDeliveryTargets({...state, driveway}).stopIndex, i, "Small overshoot permits a correction");
  driveway.progress = zone.end + DRIVEWAY_ROUTE.passMargin + .01;
  assert.equal(advanceDeliveryTargets({...state, driveway}).stopIndex, i+1, "Forward exit passes the explicit alley threshold");
}
const skippedAll=advanceDeliveryTargets({...fresh(),position:1000});
assert.deepEqual(skippedAll.skippedStops,[0,1,2]); assert.equal(skippedAll.stopIndex,3);
assert.equal(completedDeliveryCount([],true),1);
assert.equal(completedDeliveryCount([1],true),2);
assert.equal(completedDeliveryCount([0,1,2],true),4);
assert.equal(advanceDeliveryTargets({...fresh(),...skippedAll,position:255,travelDirection:-1}).stopIndex,0,"Returning restores an unfinished recommendation without completing it");
assert.deepEqual(fresh().completedStops,[]);
console.log("Skip thresholds, partial/all-skip final counts, revisitable guidance and reset state verified.");
