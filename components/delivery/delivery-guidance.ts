import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import { getRouteFrame, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import type { TravelDirection, TurnChoice } from "./delivery-turns";

export type GuidanceState = { position: number; stopIndex: number; driveway?: DrivewayState | null; detour: DetourChoice; laneX: number; travelDirection?: TravelDirection; turnChoice?: TurnChoice | null; completedStops?: number[] };

/** Three arrows ahead on the road, only when the player asks to replay the guide. */
export function deliveryGuidanceWaypoints(state: GuidanceState, replay = false) {
  if (!replay) return [];
  return [5, 11, 17].map(offset => state.position + offset)
    .filter(distance => distance <= config.totalDistance)
    .map(distance => {
      const frame = getRouteFrame(distance, state.detour);
      frame.position.addScaledVector(frame.lateral, state.laneX);
      return { frame, reverse: false, progress: distance, path: "road" as const, selected: true };
    });
}
