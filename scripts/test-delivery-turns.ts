import assert from "node:assert/strict";
import { DELIVERY_STOPS, getDrivewayExitDistance, getDrivewayFrame, getDrivewayLength, getRouteFrame } from "../data/delivery-map";
import { nextDeliveryLane, laneTargetX, settledDeliveryLane, enterTurnLane, occupiedDeliveryTurn, getDeliveryJunction, busTurnLaneClear } from "../components/delivery/delivery-turns";
import { advanceDeliveryTargets, completedDeliveryCount } from "../components/delivery/delivery-progress";
import { deliveryGuidanceWaypoints, remainingDeliveryDistance } from "../components/delivery/delivery-guidance";

for (const [i, stop] of DELIVERY_STOPS.entries()) for (const direction of [1,-1] as const) {
  const side = stop.side === "left" ? -1 : 1;
  const distance = direction > 0 ? stop.distance : getDrivewayExitDistance(i);
  const choice = occupiedDeliveryTurn(distance - direction * 35, direction, side*5)!;
  assert(choice); assert.equal(choice.stopIndex,i); assert.equal(choice.entryEnd,direction>0?"entrance":"exit");
  const outer=side<0?0:2,extra=side<0?-1:3;
  assert.equal(nextDeliveryLane(distance-direction*35,1,side),outer,"One action moves one adjacent lane, never directly into alley");
  assert.equal(nextDeliveryLane(distance-direction*35,outer,side),extra);
  assert.equal(nextDeliveryLane(distance-direction*35,extra,side),extra,"Cannot go off-road");
  assert.equal(nextDeliveryLane(distance-direction*35,extra,-side as -1|1),outer,"Return to through-lane by normal steering");
  assert.equal(nextDeliveryLane(distance-direction*45,outer,side),outer,"Taper does not accept unsafe late lane changes");
  assert.equal(getDeliveryJunction(distance-direction*45,direction),null,"Normal road remains lane control");
  assert.equal(enterTurnLane(distance-direction*1,direction*20,side*5),null,"Must drive to the physical branch");
  assert.equal(enterTurnLane(distance,0,side*5),null,"No automatic movement while stopped");
  for(const laneX of [-2.5,0,2.5,side*3.7])assert.equal(enterTurnLane(distance,direction*20,laneX),null,"Three through-lanes and incomplete lane change never auto-enter");
  for(const laneX of [side*3.9,side*5]){
    const entered=enterTurnLane(distance+direction*.3,direction*20,laneX)!;
    assert(entered,"Actual extra-lane occupancy enters");
    const curve=getDrivewayFrame(i,entered.progress,entered), main=getRouteFrame(entered.entryPosition);
    assert(curve.position.distanceTo(main.position.addScaledVector(main.lateral,laneX))<1e-8,"No teleport at either entrance");
    assert(curve.tangent.dot(main.tangent)>.999,"Reverse entry retains forward-facing camera");
  }
  const state={position:distance-direction*20,stopIndex:i,driveway:null,laneX:0,detour:"main" as const,travelDirection:direction,turnChoice:choice};
  assert(deliveryGuidanceWaypoints(state).every(p=>p.selected&&p.reverse===(direction<0)));
  assert(deliveryGuidanceWaypoints({...state,turnChoice:null}).some(p=>p.path==="road"&&p.selected),"Additional lane is marked before entering it");
  assert.equal(laneTargetX(extra,distance-direction*40),side*5);
  assert.equal(laneTargetX(extra,distance-direction*52),side*2.5,"Taper merges continuously with outer through-lane");
  assert.equal(settledDeliveryLane(distance-direction*53,extra),outer);
  assert(!busTurnLaneClear(distance-direction*20,distance-direction*10,stop.side),"Ad buses cannot use a reserved turn lane");
}
const returned={position:255,stopIndex:2,completedStops:[1],skippedStops:[0],driveway:null,travelDirection:-1 as const};
assert.equal(advanceDeliveryTargets(returned).stopIndex,0,"Missed first house is recommended on return");
const reverseVisit={...returned,position:228,driveway:{stopIndex:0,progress:getDrivewayLength(0)-5,entryPosition:228,entryLaneX:-2.5,entryEnd:"exit" as const}};
assert.equal(advanceDeliveryTargets(reverseVisit).stopIndex,0,"A skipped house remains visitable");
assert(remainingDeliveryDistance({...reverseVisit,stopIndex:0})>0,"Reverse approach distance is not falsely zero");
const delivered=advanceDeliveryTargets({...reverseVisit,completedStops:[1,0]});
assert(!delivered.skippedStops.includes(0));
assert.equal(completedDeliveryCount([1,0,0],false),2,"Repeat visits cannot duplicate completed count");
assert.equal(getDeliveryJunction(210,-1),null,"No forced turnaround after passing the reverse junction");
console.log("Local fourth lanes, one-step input, three through-lanes, real-position entry, taper merges, reverse revisit and bus clearance passed.");
