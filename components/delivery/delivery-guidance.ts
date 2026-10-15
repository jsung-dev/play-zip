import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDrivewayFrame, getDrivewayLength, getRouteFrame, type DetourChoice, type DrivewayState } from "@/data/delivery-map";

export type GuidanceState = { position: number; stopIndex: number; driveway: DrivewayState | null; detour: DetourChoice; laneX: number; closureReached?: boolean };

/** Same reachable interval as isAtDrivewayDelivery; no change to its predicate. */
export function deliveryArrivalInterval(index: number) {
  const end = getDrivewayLength(index);
  return { start: end - config.drivewayDeliveryDepth, end, width: config.drivewayWidth };
}

/** Distance along the route to the delivery zone, never just to the turn. */
export function remainingDeliveryDistance(state: Pick<GuidanceState, "position" | "stopIndex" | "driveway">) {
  const next = DELIVERY_STOPS[state.stopIndex];
  const approach = next ? deliveryArrivalInterval(state.stopIndex).start : 0;
  if (state.driveway?.stopIndex === state.stopIndex && next) return Math.max(0, approach - state.driveway.progress);
  const exit = state.driveway ? state.driveway.progress : 0;
  return exit + Math.abs((next?.distance ?? config.totalDistance) - state.position) + approach;
}

/** Three reusable arrows follow the actual road/driveway curve, not a house vector. */
export function deliveryGuidanceWaypoints(state: GuidanceState, replay = false) {
  const driveway = state.driveway;
  if (driveway) {
    const returning = driveway.stopIndex < state.stopIndex;
    const end = deliveryArrivalInterval(driveway.stopIndex).start;
    return [3, 8, 13].map(offset => driveway.progress + (returning ? -offset : offset))
      .filter(progress => progress >= .5 && progress < end - .5)
      .map(progress => ({ frame: getDrivewayFrame(driveway.stopIndex, progress, driveway), reverse: returning, progress, path: "driveway" as const }));
  }
  const next = DELIVERY_STOPS[state.stopIndex];
  const gap = next ? next.distance - state.position : Infinity;
  if (next && gap >= -6 && gap <= 55) return [3, 9, 15].map(progress => ({ frame: getDrivewayFrame(state.stopIndex, progress), reverse: false, progress, path: "driveway" as const }));
  if (!replay) return [];
  const reverse = gap < -6 || (state.closureReached && state.position > ROAD_CLOSURE.junctionDistance);
  return [5, 11, 17].map(offset => state.position + (reverse ? -offset : offset))
    .filter(distance => distance >= 0 && distance <= config.totalDistance)
    .map(distance => {
      const frame = getRouteFrame(distance, state.detour);
      frame.position.addScaledVector(frame.lateral, state.laneX);
      return { frame, reverse: !!reverse, progress: distance, path: "road" as const };
    });
}
