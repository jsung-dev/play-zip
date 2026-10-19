import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { getDetourOffset, type DetourChoice } from "@/data/delivery-map";
import { jumpDuration, RAMP_POWER } from "./delivery-jump";

// Milk boosters, collapsed-road gaps and the ramps that cross them.
// In-game only: nothing here is points, currency or a reward outside this run.
type Branch = "left" | "right";
export type Booster = { distance: number; lane: 0 | 1 | 2; branch?: Branch };
export type Ramp = { distance: number; lane: 0 | 1 | 2; branch?: Branch };
export type Gap = { start: number; end: number; branch?: Branch };

export const BOOST = { seconds: 3, speedFactor: 1.35 } as const;
// A ramp sets the speed into this band and holds it in the air, so every
// flight clears the gap and lands in the same, obstacle-free spot.
export const RAMP_MIN_SPEED = 19;
export const RAMP_MAX_SPEED = 21;
// Longer than a normal jump at top speed (15 m), shorter than a ramp flight (~20 m).
export const GAP_LENGTH = 17;
export const FALL_SECONDS = 1.1;
const laneX = (lane: number) => (lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing;

export const RAMPS: Ramp[] = [
  { distance: 283, lane: 1 },
  { distance: 590, lane: 1, branch: "left" },
  { distance: 590, lane: 1, branch: "right" },
  { distance: 864, lane: 1 },
];
// Each gap opens just past its ramp; the whole road (all lanes) has fallen in.
export const GAPS: Gap[] = RAMPS.map(ramp => ({ start: ramp.distance + 1, end: ramp.distance + 1 + GAP_LENGTH, branch: ramp.branch }));

export const BOOSTERS: Booster[] = [
  { distance: 160, lane: 2 },
  { distance: 455, lane: 1 },
  { distance: 618, lane: 2, branch: "left" },
  { distance: 618, lane: 0, branch: "right" },
  { distance: 735, lane: 0 },
  { distance: 897, lane: 2 },
];

/** Index of the booster the bike passed through this frame, if any. Coordinates are lane-relative. */
export function boosterHit(previous: number, position: number, bikeX: number, detour: DetourChoice, taken: Set<number>) {
  const low = Math.min(previous, position) - 1, high = Math.max(previous, position) + 1;
  return BOOSTERS.findIndex((b, i) => !taken.has(i) && b.distance >= low && b.distance <= high
    && (b.branch ? b.branch === detour : getDetourOffset(b.distance, detour) === 0)
    && Math.abs(bikeX - laneX(b.lane)) < 1.3);
}

/** The ramp the bike just rode over (on the ground, moving forward), if any. */
export function rampHit(previous: number, position: number, bikeX: number, detour: DetourChoice, airborne: boolean) {
  if (airborne || position <= previous) return null;
  return RAMPS.find(ramp => previous < ramp.distance && position >= ramp.distance
    && (!ramp.branch || ramp.branch === detour)
    && Math.abs(bikeX - laneX(ramp.lane)) < 1.2) ?? null;
}

/** The gap under a grounded bike at this position, if any (the bike falls in). */
export function gapUnder(position: number, detour: DetourChoice, airborne: boolean) {
  if (airborne) return null;
  return GAPS.find(gap => position > gap.start && position < gap.end && (!gap.branch || gap.branch === detour)) ?? null;
}

/** Ramp flight length at a given speed, for placement checks. */
export const rampFlight = (speed: number) => jumpDuration(RAMP_POWER) * speed;
