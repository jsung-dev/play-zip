import { DELIVERY_STOPS, type DrivewayState } from "@/data/delivery-map";
import { DRIVE_BY, houseDistance } from "./delivery-driveby";
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

/** Driving past a house without the throw only marks it skipped; the bike never turns back. */
export function advanceDeliveryTargets(state: DeliveryProgress) {
  const skippedStops = state.skippedStops.filter(index => !state.completedStops.includes(index));
  let stopIndex = DELIVERY_STOPS.length;
  DELIVERY_STOPS.forEach((_, index) => {
    if (state.completedStops.includes(index)) return;
    if (state.position > houseDistance(index) + DRIVE_BY.windowBehind) {
      if (!skippedStops.includes(index)) skippedStops.push(index);
    } else stopIndex = Math.min(stopIndex, index);
  });
  return { stopIndex, skippedStops };
}

export function completedDeliveryCount(completedStops: number[], finalDelivered: boolean) {
  return new Set(completedStops).size + Number(finalDelivered);
}
