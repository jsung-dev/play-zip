import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDrivewayDeliveryInterval, isAtDrivewayDelivery, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { remainingDeliveryDistance } from "./delivery-guidance";
import { getDeliveryJunction, type TravelDirection, type TurnChoice } from "./delivery-turns";

type NavigationState = {
  position: number;
  speed: number;
  stopIndex: number;
  stopDwell: number;
  deliverySuccessRemaining: number;
  closureReached: boolean;
  detour: DetourChoice;
  driveway: DrivewayState | null;
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

/** One stable navigation slot replaces overlapping scene and footer guidance. */
export function getDeliveryNavigation(state: NavigationState, arriving = false): NavigationCue {
  const next = DELIVERY_STOPS[state.stopIndex];
  const reverse = state.travelDirection === -1;
  const destination = next?.address ?? DELIVERY_GAME_CONFIG.destinationName;
  const closureBacktrack = state.closureReached && state.detour === "main" ? Math.max(0, state.position - ROAD_CLOSURE.junctionDistance) * 2 : 0;
  const remaining = Math.ceil(remainingDeliveryDistance(state) + closureBacktrack);
  if (arriving) return { direction: "delivery", instruction: "상품 전달 중", destination, remaining: 0, phase: "delivering" };
  if (state.deliverySuccessRemaining > 0) {
    return { direction: "complete", instruction: "배달 완료!", destination, remaining, phase: "complete" };
  }
  if (state.driveway) {
    const driveway = state.driveway;
    const zone = getDrivewayDeliveryInterval(driveway.stopIndex);
    if (driveway.stopIndex !== state.stopIndex || state.completedStops?.includes(driveway.stopIndex) || (reverse ? driveway.progress < zone.start : driveway.progress > zone.end)) {
      return { direction: reverse ? "reverse" : "forward", instruction: "출구 따라 큰길로", destination, remaining, phase: "returning" };
    }
    const inZone = isAtDrivewayDelivery(driveway, state.stopIndex);
    const dwelling = inZone && Math.abs(state.speed) < .55 && state.stopDwell > 0;
    return {
      direction: dwelling ? "delivery" : inZone ? "stop" : reverse ? "reverse" : "forward",
      instruction: dwelling ? "상품 전달 중" : inZone ? "멈춰서 배달" : remaining <= 8 ? "입구로 이동" : "골목 안으로 이동",
      destination: DELIVERY_STOPS[driveway.stopIndex]?.address ?? destination,
      remaining,
      phase: dwelling ? "delivering" : inZone ? "braking" : "approaching",
    };
  }
  if (state.closureReached && state.position > ROAD_CLOSURE.junctionDistance) {
    return { direction: "reverse", instruction: "후진해서 갈림길로", destination, remaining };
  }
  const junction = getDeliveryJunction(state.position, state.travelDirection ?? 1);
  if (junction && (junction.stopIndex === state.stopIndex || state.turnChoice?.stopIndex === junction.stopIndex)) {
    const side = DELIVERY_STOPS[junction.stopIndex].side;
    const chosen = state.turnChoice?.stopIndex === junction.stopIndex && state.turnChoice.entryEnd === junction.entryEnd;
    return {direction: side, instruction: chosen ? "골목으로 진입" : side === "left" ? "왼쪽 회전 차선" : "오른쪽 회전 차선",
      destination: chosen ? DELIVERY_STOPS[junction.stopIndex].address : destination,
      remaining: chosen ? Math.ceil(remainingDeliveryDistance({...state,stopIndex:junction.stopIndex})) : remaining, phase: "approaching"};
  }
  if (next && state.position > next.distance + 6) {
    return { direction: "forward", instruction: "큰길 따라 계속", destination, remaining };
  }
  if (!reverse && next && Math.abs(state.position - next.distance) <= 55) {
    return { direction: next.side, instruction: next.side === "left" ? "왼쪽 골목으로" : "오른쪽 골목으로", destination, remaining, phase: "approaching" };
  }
  if (state.position >= ROAD_CLOSURE.junctionDistance - 55 && state.position <= ROAD_CLOSURE.junctionDistance + 12) {
    const choice = state.detour;
    return {
      direction: choice === "main" ? "fork" : choice,
      instruction: choice === "main" ? "좌우 우회로" : choice === "left" ? "왼쪽 우회로" : "오른쪽 우회로",
      destination,
      remaining,
    };
  }
  return { direction: reverse ? "reverse" : "forward", instruction: reverse ? "후진" : "직진", destination, remaining };
}
