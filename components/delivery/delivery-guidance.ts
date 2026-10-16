import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, getExtraLaneX, getDrivewayFrame, getDrivewayLength, getDrivewayDeliveryInterval, getDrivewayExitDistance, getRouteFrame, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { getDeliveryJunction, type TravelDirection, type TurnChoice } from "./delivery-turns";

export type GuidanceState = { position: number; stopIndex: number; driveway: DrivewayState | null; detour: DetourChoice; laneX: number; closureReached?: boolean; travelDirection?: TravelDirection; turnChoice?: TurnChoice | null; completedStops?: number[] };

/** Drawing and stop/quiz detection use the same bounded delivery pad. */
export function deliveryArrivalInterval(index: number) {
  return getDrivewayDeliveryInterval(index);
}

/** Distance along the route to the delivery zone, never just to the turn. */
export function remainingDeliveryDistance(state: Pick<GuidanceState, "position" | "stopIndex" | "driveway" | "travelDirection">) {
  const next = DELIVERY_STOPS[state.stopIndex];
  const reverse = state.travelDirection === -1;
  const zone = next ? deliveryArrivalInterval(state.stopIndex) : null;
  const approach = zone ? reverse ? getDrivewayLength(state.stopIndex) - zone.end : zone.start : 0;
  if (state.driveway?.stopIndex === state.stopIndex && zone) return Math.max(0, zone.start - state.driveway.progress, state.driveway.progress - zone.end);
  const exit = state.driveway ? reverse ? state.driveway.progress : getDrivewayLength(state.driveway.stopIndex) - state.driveway.progress : 0;
  const roadPosition = state.driveway ? reverse ? DELIVERY_STOPS[state.driveway.stopIndex].distance : getDrivewayExitDistance(state.driveway.stopIndex) : state.position;
  const junction = next ? reverse ? getDrivewayExitDistance(state.stopIndex) : next.distance : config.totalDistance;
  return exit + Math.abs(junction - roadPosition) + approach;
}

/** Three reusable arrows follow the actual road/driveway curve, not a house vector. */
export function deliveryGuidanceWaypoints(state: GuidanceState, replay = false) {
  const driveway = state.driveway;
  const direction = state.travelDirection ?? 1;
  if (driveway) {
    const zone = deliveryArrivalInterval(driveway.stopIndex);
    const leaving = driveway.stopIndex !== state.stopIndex || state.completedStops?.includes(driveway.stopIndex)
      || (direction > 0 ? driveway.progress > zone.end : driveway.progress < zone.start);
    const end = direction > 0 ? leaving ? getDrivewayLength(driveway.stopIndex) : zone.start : leaving ? 0 : zone.end;
    return [3, 8, 13].map(offset => driveway.progress + direction * offset)
      .filter(progress => direction > 0 ? progress >= .5 && progress < end - .5 : progress > end + .5 && progress < getDrivewayLength(driveway.stopIndex) - .5)
      .map(progress => ({ frame: getDrivewayFrame(driveway.stopIndex, progress, driveway), reverse: direction < 0, progress, path: "driveway" as const, selected: true }));
  }
  const junction = getDeliveryJunction(state.position, direction);
  if (junction) {
    const selected = state.turnChoice?.stopIndex === junction.stopIndex && state.turnChoice.entryEnd === junction.entryEnd;
    const curveLength = getDrivewayLength(junction.stopIndex);
    const alleyPoints = [9].map(offset => {
      const progress = direction > 0 ? offset : curveLength - offset;
      return {frame: getDrivewayFrame(junction.stopIndex, progress), reverse: direction < 0, progress, path: "driveway" as const, selected: true};
    });
    // Always point along the separate turn lane, never ask a through-lane rider
    // to choose a hidden turn command. The physical lane is the choice.
    const straight = [-20, -8].filter(offset => (junction.distance + direction * offset - state.position) * direction > 1).map(offset => {
      const distance = junction.distance + direction * offset, frame = getRouteFrame(distance, state.detour);
      frame.position.addScaledVector(frame.lateral, getExtraLaneX(junction, distance));
      return {frame, reverse: direction < 0, progress: distance, path: "road" as const, selected: true};
    });
    if (selected && !straight.length) return [3, 9, 15].map(offset => {
      const progress = direction > 0 ? offset : curveLength - offset;
      return {frame: getDrivewayFrame(junction.stopIndex, progress), reverse: direction < 0, progress, path: "driveway" as const, selected: true};
    });
    return [...straight, ...alleyPoints];
  }
  if (!replay) return [];
  const reverse = direction < 0 || state.closureReached && state.position > ROAD_CLOSURE.junctionDistance;
  return [5, 11, 17].map(offset => state.position + (reverse ? -offset : offset))
    .filter(distance => distance >= 0 && distance <= config.totalDistance)
    .map(distance => {
      const frame = getRouteFrame(distance, state.detour);
      frame.position.addScaledVector(frame.lateral, state.laneX);
      return { frame, reverse: !!reverse, progress: distance, path: "road" as const, selected: true };
    });
}
