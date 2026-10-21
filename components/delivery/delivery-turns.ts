import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import type { TurnLaneConnection } from "@/data/delivery-map";

export type TravelDirection = 1 | -1;
// Alleys are gone (drive-by delivery); kept so runtime/scene state keeps its shape.
export type TurnChoice = TurnLaneConnection;

/** Three through-lanes only: swiping never leaves the road. */
export const laneTargetX = (target: number, _position?: number) => (Math.max(0, Math.min(2, target)) - 1) * config.laneSpacing;
export const nextDeliveryLane = (_position: number, target: number, horizontal: -1 | 1) => Math.max(0, Math.min(2, target + horizontal));
export const settledDeliveryLane = (_position: number, target: number) => Math.max(0, Math.min(2, target));
