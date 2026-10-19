import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";

// Moving hazards. Each wakes when the bike reaches `trigger` and then follows a
// fixed, slow path, so the player can read it early: jump it, steer, or wait.
export type MoverKind = "cat" | "ball" | "bus" | "ducks" | "pigeons";
export type MoverPlacement = { id: string; kind: MoverKind; trigger: number; distance: number; lane?: 0 | 1 | 2 };
export type MoverPose = { distance: number; x: number; heading: number; done: boolean };

const lane = (n: number) => (n - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
const smooth = (t: number) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };

export const MOVER_PLACEMENTS: MoverPlacement[] = [
  // Big beach ball rolls out from the right kerb, diagonally toward the rider.
  { id: "ball-255", kind: "ball", trigger: 215, distance: 255 },
  // Bus pulls out of the right bus stop into lane 2 and drives on slowly.
  // (starts just past the parked bus at 710; returns to its bus lane before 800)
  { id: "bus-726", kind: "bus", trigger: 698, distance: 726 },
  // Cat strolls across all three lanes before the last stretch.
  { id: "cat-910", kind: "cat", trigger: 877, distance: 910 },
  // Duck family waddles across right before the apartment.
  { id: "ducks-952", kind: "ducks", trigger: 918, distance: 952 },
  // Pigeons resting on the road burst into the air as the bike comes close (harmless).
  { id: "pigeons-158", kind: "pigeons", trigger: 136, distance: 158 },
  { id: "pigeons-790", kind: "pigeons", trigger: 768, distance: 790 },
];

export const BALL_MOTION = { startX: 6.5, toward: 6, across: 3, radius: .75 } as const;

export const MOVER_SHAPE: Record<MoverKind, { halfWidth: number; halfLength: number; clearance: number | null }> = {
  cat: { halfWidth: .65, halfLength: .4, clearance: .6 },
  ball: { halfWidth: .7, halfLength: .7, clearance: .85 },
  bus: { halfWidth: 1.3, halfLength: 3.1, clearance: null },
  ducks: { halfWidth: 1.1, halfLength: .35, clearance: .45 },
  pigeons: { halfWidth: 0, halfLength: 0, clearance: 0 }, // scenery: never collides
};
export const moverCollides = (kind: MoverKind) => kind !== "pigeons";

/** Where a mover is `t` seconds after it woke. */
export function moverPose(mover: MoverPlacement, t: number): MoverPose {
  if (mover.kind === "cat") {
    // 2 m/s from the left kerb to the right one: about 6 s to clear the road.
    const x = -6 + 2 * t;
    return { distance: mover.distance, x, heading: Math.PI / 2, done: x > 6 };
  }
  if (mover.kind === "ducks") {
    // Right kerb to left kerb at a waddle (1.5 m/s); the line of four is ~2 m long.
    const x = 6.5 - 1.5 * t;
    return { distance: mover.distance, x, heading: -Math.PI / 2, done: x < -8.5 };
  }
  if (mover.kind === "pigeons") return { distance: mover.distance, x: 0, heading: 0, done: t > 3 };
  if (mover.kind === "ball") {
    // 6 m/s toward the rider and 3 m/s across: crosses the lanes in ~4 s.
    const x = BALL_MOTION.startX - BALL_MOTION.across * t;
    return { distance: mover.distance - BALL_MOTION.toward * t, x, heading: 0, done: x < -7 };
  }
  // Bus: 2 s with the indicator on, 3 s to merge, cruises at 8 m/s, then moves
  // back to its bus lane at 785–800 m so it never drives through later obstacles.
  const distance = mover.distance + 8 * Math.max(0, t - 2);
  const inLane = smooth((t - 2) / 3) * (1 - smooth((distance - 785) / 15));
  const x = DELIVERY_GAME_CONFIG.busLaneOffset + (lane(2) - DELIVERY_GAME_CONFIG.busLaneOffset) * inLane;
  return { distance, x, heading: 0, done: distance > 960 };
}
