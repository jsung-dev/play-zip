import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDrivewayLength, isAtDrivewayDelivery, type DetourChoice, type DrivewayState } from "@/data/delivery-map";

type NavigationState = {
  position: number;
  speed: number;
  stopIndex: number;
  stopDwell: number;
  deliverySuccessRemaining: number;
  closureReached: boolean;
  detour: DetourChoice;
  driveway: DrivewayState | null;
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
  const delivered = DELIVERY_STOPS[state.stopIndex - 1];
  const destination = next?.address ?? DELIVERY_GAME_CONFIG.destinationName;
  const remaining = Math.ceil(Math.abs((next?.distance ?? DELIVERY_GAME_CONFIG.totalDistance) - state.position));
  if (arriving) return { direction: "delivery", instruction: "상품 전달 중", destination, remaining: 0, phase: "delivering" };
  if (state.deliverySuccessRemaining > 0 && delivered) {
    return { direction: "complete", instruction: "배달 완료!", destination: delivered.address, remaining: 0, phase: "complete" };
  }
  if (state.driveway) {
    const driveway = state.driveway;
    if (driveway.stopIndex < state.stopIndex) {
      return { direction: "reverse", instruction: "후진해서 큰길로", destination: "큰길로 복귀", remaining: Math.ceil(driveway.progress), phase: "returning" };
    }
    const inZone = isAtDrivewayDelivery(driveway, state.stopIndex);
    const dwelling = inZone && Math.abs(state.speed) < .55 && state.stopDwell > 0;
    return {
      direction: dwelling ? "delivery" : inZone ? "stop" : "forward",
      instruction: dwelling ? "상품 전달 중" : inZone ? "멈춰서 배달" : "집 앞까지 직진",
      destination: DELIVERY_STOPS[driveway.stopIndex]?.address ?? destination,
      remaining: Math.ceil(Math.max(0, getDrivewayLength(driveway.stopIndex) - driveway.progress)),
      phase: dwelling ? "delivering" : inZone ? "braking" : "approaching",
    };
  }
  if (state.closureReached && state.position > ROAD_CLOSURE.junctionDistance) {
    return { direction: "reverse", instruction: "후진해서 갈림길로", destination: "공사 구간 우회", remaining: Math.ceil(state.position - ROAD_CLOSURE.junctionDistance) };
  }
  if (next && state.position > next.distance + 6) {
    return { direction: "reverse", instruction: "후진해서 입구로", destination, remaining, phase: "approaching" };
  }
  if (next && Math.abs(state.position - next.distance) <= 55) {
    return { direction: next.side, instruction: next.side === "left" ? "왼쪽 입구로" : "오른쪽 입구로", destination, remaining, phase: "approaching" };
  }
  if (state.position >= ROAD_CLOSURE.junctionDistance - 55 && state.position <= ROAD_CLOSURE.junctionDistance + 12) {
    const choice = state.detour;
    return {
      direction: choice === "main" ? "fork" : choice,
      instruction: choice === "main" ? "좌우 우회로" : choice === "left" ? "왼쪽 우회로" : "오른쪽 우회로",
      destination: "공사 구간 우회",
      remaining: Math.ceil(Math.max(0, ROAD_CLOSURE.junctionDistance - state.position)),
    };
  }
  return { direction: "forward", instruction: "직진", destination, remaining };
}
