import { DELIVERY_STOPS, DRIVEWAY_ROUTE, getDrivewayDeliveryInterval, getDrivewayExitDistance, type DrivewayState } from "@/data/delivery-map";
import { type TravelDirection, type TurnChoice } from "./delivery-turns";

export type DeliveryProgress = {
  position: number;
  driveway: DrivewayState | null;
  stopIndex: number;
  completedStops: number[];
  skippedStops: number[];
  travelDirection?: TravelDirection;
  turnChoice?: TurnChoice | null;
};

/** Passing changes the recommendation, never locks a road or completes a job. */
export function advanceDeliveryTargets(state: DeliveryProgress) {
  const direction = state.travelDirection ?? 1;
  const skippedStops = state.skippedStops.filter(index => !state.completedStops.includes(index));
  const pending = DELIVERY_STOPS.map((_, i) => i).filter(i => !state.completedStops.includes(i));
  for (const index of pending) {
    const zone = getDrivewayDeliveryInterval(index);
    const passed = state.driveway?.stopIndex === index
      ? state.driveway.entryEnd === "exit" ? state.driveway.progress < zone.start - DRIVEWAY_ROUTE.passMargin : state.driveway.progress > zone.end + DRIVEWAY_ROUTE.passMargin
      : !state.driveway && state.position > getDrivewayExitDistance(index) + DRIVEWAY_ROUTE.passMargin;
    if (passed && !skippedStops.includes(index)) skippedStops.push(index);
  }
  // Re-entering any unfinished alley restores its quiz/delivery target, even
  // when it was previously passed or a later house was already delivered.
  if (state.driveway && pending.includes(state.driveway.stopIndex)) {
    const zone = getDrivewayDeliveryInterval(state.driveway.stopIndex);
    const approaching = direction > 0 ? state.driveway.progress <= zone.end + DRIVEWAY_ROUTE.passMargin : state.driveway.progress >= zone.start - DRIVEWAY_ROUTE.passMargin;
    if (approaching) return {stopIndex: state.driveway.stopIndex, skippedStops};
  }
  if (state.turnChoice && pending.includes(state.turnChoice.stopIndex)) return {stopIndex: state.turnChoice.stopIndex, skippedStops};
  const roadPosition = state.driveway
    ? direction > 0 ? getDrivewayExitDistance(state.driveway.stopIndex) + DRIVEWAY_ROUTE.passMargin + .01 : DELIVERY_STOPS[state.driveway.stopIndex].distance - DRIVEWAY_ROUTE.passMargin - .01
    : state.position;
  const candidates = pending.filter(index => direction > 0
    ? roadPosition <= getDrivewayExitDistance(index) + DRIVEWAY_ROUTE.passMargin
    : roadPosition >= DELIVERY_STOPS[index].distance - DRIVEWAY_ROUTE.passMargin);
  const stopIndex = (direction > 0 ? candidates[0] : candidates.at(-1)) ?? DELIVERY_STOPS.length;
  return { stopIndex, skippedStops };
}

export function completedDeliveryCount(completedStops: number[], finalDelivered: boolean) {
  return new Set(completedStops).size + Number(finalDelivered);
}
