import { DELIVERY_STOPS, DRIVEWAY_ROUTE, getDrivewayDeliveryInterval, getDrivewayExitDistance, type DrivewayState } from "@/data/delivery-map";

export type DeliveryProgress = {
  position: number;
  driveway: DrivewayState | null;
  stopIndex: number;
  completedStops: number[];
  skippedStops: number[];
};

/** Target cursor is not a delivery count. Passing a stop never completes it. */
export function advanceDeliveryTargets(state: DeliveryProgress) {
  let stopIndex = state.stopIndex;
  const skippedStops = [...state.skippedStops];
  while (stopIndex < DELIVERY_STOPS.length) {
    if (state.completedStops.includes(stopIndex)) { stopIndex++; continue; }
    const passed = state.driveway?.stopIndex === stopIndex
      ? state.driveway.progress > getDrivewayDeliveryInterval(stopIndex).end + DRIVEWAY_ROUTE.passMargin
      : !state.driveway && state.position > getDrivewayExitDistance(stopIndex) + DRIVEWAY_ROUTE.passMargin;
    if (!passed) break;
    if (!skippedStops.includes(stopIndex)) skippedStops.push(stopIndex);
    stopIndex++;
  }
  return { stopIndex, skippedStops };
}

export function completedDeliveryCount(completedStops: number[], finalDelivered: boolean) {
  return new Set(completedStops).size + Number(finalDelivered);
}
