import { DELIVERY_STOPS, DRIVEWAY_ROUTE } from "@/data/delivery-map";

/** Drive-by delivery: no alley. Jump while passing the house to throw the parcel. */
export const DRIVE_BY = { warnAhead: 90, windowAhead: 24, windowBehind: 4 } as const;

export const DRIVE_BY_TEXT = { warn: "곧 배달지 도착입니다", window: "타이밍에 맞춰서 점프를 하세요" } as const;

export type DriveByPhase = "far" | "warn" | "window" | "passed";

/** Route distance where the house sits beside the road (middle of its old driveway). */
export const houseDistance = (stopIndex: number) => DELIVERY_STOPS[stopIndex].distance + DRIVEWAY_ROUTE.exitAdvance / 2;

export function driveByPhase(position: number, stopIndex: number): DriveByPhase {
  if (!DELIVERY_STOPS[stopIndex]) return "far";
  const ahead = houseDistance(stopIndex) - position;
  if (ahead < -DRIVE_BY.windowBehind) return "passed";
  if (ahead <= DRIVE_BY.windowAhead) return "window";
  return ahead <= DRIVE_BY.warnAhead ? "warn" : "far";
}

/** A jump that is in the air while inside the window lands the parcel. */
export const isThrowing = (position: number, stopIndex: number, airborne: boolean) => airborne && driveByPhase(position, stopIndex) === "window";
