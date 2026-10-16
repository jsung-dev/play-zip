import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDrivewayFrame, getDrivewayLength, getDrivewayDeliveryInterval, getDrivewayExitDistance, getRouteFrame, type DetourChoice, type DrivewayState } from "@/data/delivery-map";

export type GuidanceState = { position: number; stopIndex: number; driveway: DrivewayState | null; detour: DetourChoice; laneX: number; closureReached?: boolean };

/** Drawing and stop/quiz detection use the same bounded delivery pad. */
export function deliveryArrivalInterval(index: number) {
  return getDrivewayDeliveryInterval(index);
}

/** Distance along the route to the delivery zone, never just to the turn. */
export function remainingDeliveryDistance(state: Pick<GuidanceState, "position" | "stopIndex" | "driveway">) {
  const next = DELIVERY_STOPS[state.stopIndex];
  const approach = next ? deliveryArrivalInterval(state.stopIndex).start : 0;
  if (state.driveway?.stopIndex === state.stopIndex && next) return Math.max(0, approach - state.driveway.progress);
  const exit = state.driveway ? getDrivewayLength(state.driveway.stopIndex) - state.driveway.progress : 0;
  const roadPosition = state.driveway ? getDrivewayExitDistance(state.driveway.stopIndex) : state.position;
  return exit + Math.abs((next?.distance ?? config.totalDistance) - roadPosition) + approach;
}

/** Three reusable arrows follow the actual road/driveway curve, not a house vector. */
export function deliveryGuidanceWaypoints(state: GuidanceState, replay = false) {
  const driveway = state.driveway;
  if (driveway) {
    const zone = deliveryArrivalInterval(driveway.stopIndex);
    const leaving = driveway.stopIndex < state.stopIndex || driveway.progress > zone.end;
    const end = leaving ? getDrivewayLength(driveway.stopIndex) : zone.start;
    return [3, 8, 13].map(offset => driveway.progress + offset)
      .filter(progress => progress >= .5 && progress < end - .5)
      .map(progress => ({ frame: getDrivewayFrame(driveway.stopIndex, progress, driveway), reverse: false, progress, path: "driveway" as const }));
  }
  const next = DELIVERY_STOPS[state.stopIndex];
  const gap = next ? next.distance - state.position : Infinity;
  if (next && gap >= -6 && gap <= 55) return [3, 9, 15].map(progress => ({ frame: getDrivewayFrame(state.stopIndex, progress), reverse: false, progress, path: "driveway" as const }));
  if (!replay) return [];
  const reverse = state.closureReached && state.position > ROAD_CLOSURE.junctionDistance;
  return [5, 11, 17].map(offset => state.position + (reverse ? -offset : offset))
    .filter(distance => distance >= 0 && distance <= config.totalDistance)
    .map(distance => {
      const frame = getRouteFrame(distance, state.detour);
      frame.position.addScaledVector(frame.lateral, state.laneX);
      return { frame, reverse: !!reverse, progress: distance, path: "road" as const };
    });
}
