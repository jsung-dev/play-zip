import assert from "node:assert/strict";
import { DELIVERY_STOPS, getDrivewayExitDistance, getDrivewayFrame, getDrivewayLength, getRouteFrame } from "../data/delivery-map";
import { chooseDeliveryTurn, enterSelectedTurn, getDeliveryJunction, turnChoiceIsValid } from "../components/delivery/delivery-turns";
import { advanceDeliveryTargets, completedDeliveryCount } from "../components/delivery/delivery-progress";
import { deliveryGuidanceWaypoints, remainingDeliveryDistance } from "../components/delivery/delivery-guidance";

for (const [i, stop] of DELIVERY_STOPS.entries()) for (const direction of [1,-1] as const) {
  const side = stop.side === "left" ? -1 : 1;
  const distance = direction > 0 ? stop.distance : getDrivewayExitDistance(i);
  const choice = chooseDeliveryTurn(distance - direction * 35, direction, side)!;
  assert(choice); assert.equal(choice.stopIndex,i); assert.equal(choice.entryEnd,direction>0?"entrance":"exit");
  assert.equal(chooseDeliveryTurn(distance-direction*35,direction,-side as -1|1),null,"Opposite input cancels to straight");
  assert.equal(getDeliveryJunction(distance-direction*45,direction),null,"Normal road remains lane control");
  assert(!turnChoiceIsValid(choice,distance-direction*20,-direction as -1|1),"Direction reversal cancels queued turn");
  assert.equal(enterSelectedTurn(choice,distance-direction*1,direction*20,0),null,"Selection does not move the bike early");
  assert.equal(enterSelectedTurn(choice,distance,0,0),null,"No automatic movement while stopped");
  assert.equal(enterSelectedTurn(null,distance,direction*20,side*2.5),null,"Lane occupancy never auto-enters");
  for(const laneX of [-2.5,0,2.5]){
    const entered=enterSelectedTurn(choice,distance+direction*.3,direction*20,laneX)!;
    assert(entered,"Can choose from every lane");
    const curve=getDrivewayFrame(i,entered.progress,entered), main=getRouteFrame(entered.entryPosition);
    assert(curve.position.distanceTo(main.position.addScaledVector(main.lateral,laneX))<1e-8,"No teleport at either entrance");
    assert(curve.tangent.dot(main.tangent)>.999,"Reverse entry retains forward-facing camera");
  }
  const state={position:distance-direction*20,stopIndex:i,driveway:null,laneX:0,detour:"main" as const,travelDirection:direction,turnChoice:choice};
  assert(deliveryGuidanceWaypoints(state).every(p=>p.selected&&p.path==="driveway"&&p.reverse===(direction<0)));
  assert(deliveryGuidanceWaypoints({...state,turnChoice:null}).some(p=>p.path==="road"&&!p.selected),"Straight option remains visible");
}
const returned={position:255,stopIndex:2,completedStops:[1],skippedStops:[0],driveway:null,travelDirection:-1 as const};
assert.equal(advanceDeliveryTargets(returned).stopIndex,0,"Missed first house is recommended on return");
const reverseVisit={...returned,position:228,driveway:{stopIndex:0,progress:getDrivewayLength(0)-5,entryPosition:228,entryLaneX:-2.5,entryEnd:"exit" as const}};
assert.equal(advanceDeliveryTargets(reverseVisit).stopIndex,0,"A skipped house remains visitable");
assert(remainingDeliveryDistance({...reverseVisit,stopIndex:0})>0,"Reverse approach distance is not falsely zero");
const delivered=advanceDeliveryTargets({...reverseVisit,completedStops:[1,0]});
assert(!delivered.skippedStops.includes(0));
assert.equal(completedDeliveryCount([1,0,0],false),2,"Repeat visits cannot duplicate completed count");
assert(chooseDeliveryTurn(210,-1,-1)===undefined,"No forced turnaround after passing the reverse junction");
console.log("Explicit turns, 40m preselection, cancellation, every lane, reverse entry, revisit targets and unique counts passed.");
