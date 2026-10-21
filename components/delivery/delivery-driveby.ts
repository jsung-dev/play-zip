import { DELIVERY_STOPS, DRIVEWAY_ROUTE } from "@/data/delivery-map";

/** Drive-by delivery: no alley. Jump while passing the house to throw the parcel. */
export const DRIVE_BY = { warnAhead: 90, windowAhead: 24, windowBehind: 4, perfectCenter: 8, perfectHalf: 4, autoBehind: 2, throwSeconds: .6 } as const;

export const DRIVE_BY_TEXT = { warn: "곧 배달지 도착입니다", window: "점프!" } as const;

export type DriveByPhase = "far" | "warn" | "window" | "passed";
/** auto = the rider never jumped: the parcel is still delivered, just without a bonus. */
export type ThrowGrade = "perfect" | "good" | "auto";
export const THROW_LABEL: Record<ThrowGrade, string> = { perfect: "퍼펙트!", good: "굿!", auto: "배달!" };

/** Route distance where the house sits beside the road (middle of its old driveway). */
export const houseDistance = (stopIndex: number) => DELIVERY_STOPS[stopIndex].distance + DRIVEWAY_ROUTE.exitAdvance / 2;

export function driveByPhase(position: number, stopIndex: number): DriveByPhase {
  if (!DELIVERY_STOPS[stopIndex]) return "far";
  const ahead = houseDistance(stopIndex) - position;
  if (ahead < -DRIVE_BY.windowBehind) return "passed";
  if (ahead <= DRIVE_BY.windowAhead) return "window";
  return ahead <= DRIVE_BY.warnAhead ? "warn" : "far";
}

/** Countdown ring: fills while approaching, full (green) inside the window. */
export function driveByRing(position: number, stopIndex: number) {
  const phase = driveByPhase(position, stopIndex);
  if (phase !== "warn" && phase !== "window") return null;
  const h = houseDistance(stopIndex), start = h - DRIVE_BY.warnAhead;
  const fill = phase === "window" ? 1 : Math.min(1, Math.max(0, (position - start) / (DRIVE_BY.warnAhead - DRIVE_BY.windowAhead)));
  return { phase, fill, perfect: phase === "window" && Math.abs(position - (h - DRIVE_BY.perfectCenter)) <= DRIVE_BY.perfectHalf };
}

/** Grade of the throw happening this frame, or null. A jump in the air throws at once; otherwise it is thrown automatically. */
export function throwGrade(position: number, stopIndex: number, airborne: boolean): ThrowGrade | null {
  if (driveByPhase(position, stopIndex) !== "window") return null;
  if (airborne) return driveByRing(position, stopIndex)!.perfect ? "perfect" : "good";
  return position >= houseDistance(stopIndex) + DRIVE_BY.autoBehind ? "auto" : null;
}
