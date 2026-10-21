import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { DRIVE_BY_TEXT, driveByPhase, houseDistance } from "./delivery-driveby";
import type { TravelDirection, TurnChoice } from "./delivery-turns";

type NavigationState = {
  position: number;
  speed: number;
  stopIndex: number;
  stopDwell: number;
  deliverySuccessRemaining: number;
  detour: DetourChoice;
  driveway?: DrivewayState | null;
  travelDirection?: TravelDirection;
  turnChoice?: TurnChoice | null;
  completedStops?: number[];
};

export type NavigationCue = {
  direction: "forward" | "left" | "right" | "reverse" | "fork" | "stop" | "delivery" | "complete";
  instruction: string;
  destination: string;
  remaining: number;
  phase?: "approaching" | "braking" | "delivering" | "complete" | "returning";
};

/** One stable navigation slot; delivery is a drive-by jump, never a detour. */
export function getDeliveryNavigation(state: NavigationState, arriving = false): NavigationCue {
  const next = DELIVERY_STOPS[state.stopIndex];
  const destination = next?.address ?? DELIVERY_GAME_CONFIG.destinationName;
  const remaining = Math.max(0, Math.ceil((next ? houseDistance(state.stopIndex) : DELIVERY_GAME_CONFIG.totalDistance) - state.position));
  if (arriving) return { direction: "delivery", instruction: "상품 전달 중", destination, remaining: 0, phase: "delivering" };
  if (state.deliverySuccessRemaining > 0) return { direction: "complete", instruction: "배달 완료!", destination, remaining, phase: "complete" };
  const phase = driveByPhase(state.position, state.stopIndex);
  if (phase === "window") return { direction: "stop", instruction: DRIVE_BY_TEXT.window, destination, remaining, phase: "braking" };
  if (phase === "warn") return { direction: next.side, instruction: DRIVE_BY_TEXT.warn, destination, remaining, phase: "approaching" };
  if (state.position >= ROAD_CLOSURE.junctionDistance - 55 && state.position <= ROAD_CLOSURE.junctionDistance + 12) {
    const choice = state.detour;
    return { direction: choice === "main" ? "fork" : choice, instruction: choice === "main" ? "가운데 길" : choice === "left" ? "왼쪽 길" : "오른쪽 길", destination, remaining };
  }
  return { direction: "forward", instruction: "직진", destination, remaining };
}
