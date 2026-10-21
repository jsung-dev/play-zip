import { DELIVERY_HOUSE, DELIVERY_STOPS } from "@/data/delivery-map";

/** Delivery without an alley: the bike brakes beside the house on the main road and the quiz opens. */
export const DRIVE_BY = { warnAhead: 90, windowBehind: 4, stopSpeed: .55, stopWithin: 3 } as const;

export const DRIVE_BY_TEXT = { warn: "곧 배달지 도착입니다", arrive: "배달지 도착!" } as const;

export type DriveByPhase = "far" | "warn" | "passed";

/** Route distance beside the house, where the bike halts. */
export const houseDistance = (stopIndex: number) => DELIVERY_STOPS[stopIndex].distance + DELIVERY_HOUSE.along;

export function driveByPhase(position: number, stopIndex: number): DriveByPhase {
  if (!DELIVERY_STOPS[stopIndex]) return "far";
  const ahead = houseDistance(stopIndex) - position;
  if (ahead < -DRIVE_BY.windowBehind) return "passed";
  return ahead <= DRIVE_BY.warnAhead ? "warn" : "far";
}

/** Meters left before the stop point (never negative). */
export const metersToStop = (position: number, stopIndex: number) => Math.max(0, houseDistance(stopIndex) - position);

/** Slow enough and close enough to count as arrived. */
export const hasArrived = (position: number, stopIndex: number, speed: number) =>
  Math.abs(speed) < DRIVE_BY.stopSpeed && metersToStop(position, stopIndex) <= DRIVE_BY.stopWithin;
