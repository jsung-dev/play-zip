import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";

// Moving hazards. Each wakes when the bike reaches `trigger` and then follows a
// fixed, slow path, so the player can read it early: jump it, steer, or wait.
export type MoverKind = "cat" | "ball" | "bus";
export type MoverPlacement = { id: string; kind: MoverKind; trigger: number; distance: number; lane?: 0 | 1 | 2 };
export type MoverPose = { distance: number; x: number; heading: number; done: boolean };

const lane = (n: number) => (n - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
const smooth = (t: number) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };

export const MOVER_PLACEMENTS: MoverPlacement[] = [
  // Ball rolls toward the rider down the centre lane after the first alley exit.
  { id: "ball-275", kind: "ball", trigger: 236, distance: 285, lane: 1 },
  // Bus pulls out of the right bus stop into lane 2 and drives on slowly.
  // (starts just past the parked bus at 710; returns to its bus lane before 800)
  { id: "bus-726", kind: "bus", trigger: 698, distance: 726 },
  // Cat strolls across all three lanes before the last stretch.
  { id: "cat-885", kind: "cat", trigger: 852, distance: 885 },
];

export const MOVER_SHAPE: Record<MoverKind, { halfWidth: number; halfLength: number; clearance: number | null }> = {
  cat: { halfWidth: .65, halfLength: .4, clearance: .6 },
  ball: { halfWidth: .5, halfLength: .5, clearance: .6 },
  bus: { halfWidth: 1.3, halfLength: 3.1, clearance: null },
};

/** Where a mover is `t` seconds after it woke. */
export function moverPose(mover: MoverPlacement, t: number): MoverPose {
  if (mover.kind === "cat") {
    // 2 m/s from the left kerb to the right one: about 6 s to clear the road.
    const x = -6 + 2 * t;
    return { distance: mover.distance, x, heading: Math.PI / 2, done: x > 6 };
  }
  if (mover.kind === "ball") {
    const distance = mover.distance - 5 * t;
    return { distance, x: lane(mover.lane ?? 1) + Math.sin(t * 1.3) * .3, heading: 0, done: t > 14 };
  }
  // Bus: 2 s with the indicator on, 3 s to merge, cruises at 8 m/s, then moves
  // back to its bus lane at 785–800 m so it never drives through later obstacles.
  const distance = mover.distance + 8 * Math.max(0, t - 2);
  const inLane = smooth((t - 2) / 3) * (1 - smooth((distance - 785) / 15));
  const x = DELIVERY_GAME_CONFIG.busLaneOffset + (lane(2) - DELIVERY_GAME_CONFIG.busLaneOffset) * inLane;
  return { distance, x, heading: 0, done: distance > 960 };
}
