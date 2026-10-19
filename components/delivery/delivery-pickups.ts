import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { getDetourOffset, type DetourChoice } from "@/data/delivery-map";
import { jumpDuration, jumpHeightAt, RAMP_POWER } from "./delivery-jump";

// Milk drops to collect, combo/boost rules and jump ramps. In-game only:
// nothing here is points, currency or a reward outside this run.
type Branch = "left" | "right";
export type Drop = { distance: number; x: number; y: number; branch?: Branch };
export type Ramp = { distance: number; lane: 0 | 1 | 2; branch?: Branch };

export const COMBO = { windowSeconds: 2.6, boostEvery: 10, boostSeconds: 3, boostSpeedFactor: 1.35 } as const;
const RIDE_HEIGHT = .9; // drop centre height for a bike on the ground
const TOP_SPEED = DELIVERY_GAME_CONFIG.forwardSpeedPerSecond;
const laneX = (lane: number) => (lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing;

export const RAMPS: Ramp[] = [
  { distance: 283, lane: 1 },
  { distance: 590, lane: 1, branch: "left" },
  { distance: 590, lane: 1, branch: "right" },
  { distance: 864, lane: 1 },
];

const line = (from: number, count: number, lane: number, branch?: Branch, step = 2.5): Drop[] =>
  Array.from({ length: count }, (_, n) => ({ distance: from + n * step, x: laneX(lane), y: RIDE_HEIGHT, branch }));
// Drops along the path of a jump taken at top speed, so they are only reachable airborne.
const arc = (from: number, lane: number, power = 1, branch?: Branch): Drop[] => {
  const length = jumpDuration(power) * TOP_SPEED, count = Math.round(length / 2.4);
  return Array.from({ length: count - 1 }, (_, n) => {
    const distance = from + (n + 1) * length / count;
    return { distance, x: laneX(lane), y: RIDE_HEIGHT + jumpHeightAt((distance - from) / TOP_SPEED, power), branch };
  });
};
const jumpOver = (obstacle: number, lane: number, branch?: Branch) => arc(obstacle - jumpDuration() * TOP_SPEED / 2, lane, 1, branch);
const fromRamp = (ramp: Ramp) => arc(ramp.distance, ramp.lane, RAMP_POWER, ramp.branch);

export const DROPS: Drop[] = [
  ...line(100, 4, 1), ...jumpOver(118, 1),
  ...line(150, 8, 2), ...jumpOver(210, 0),
  ...line(240, 6, 1), ...fromRamp(RAMPS[0]),
  ...line(328, 3, 0), ...jumpOver(410, 1),
  ...line(440, 10, 1, undefined, 3),
  ...(["left", "right"] as const).flatMap(branch => [
    ...line(568, 5, 0, branch), ...fromRamp(RAMPS.find(r => r.branch === branch)!), ...line(616, 6, 2, branch),
  ]),
  ...jumpOver(705, 0), ...line(728, 8, 1), ...jumpOver(760, 1),
  ...line(800, 6, 2), ...fromRamp(RAMPS[3]),
  ...line(902, 4, 0), ...jumpOver(935, 0),
];

/** Indices of drops the bike passed through this frame. Coordinates are main-road based. */
export function collectDrops(previous: number, position: number, bikeX: number, jumpHeight: number, detour: DetourChoice, taken: Set<number>) {
  const picked: number[] = [], low = Math.min(previous, position) - .9, high = Math.max(previous, position) + .9;
  for (let i = 0; i < DROPS.length; i++) {
    const drop = DROPS[i];
    if (taken.has(i) || drop.distance < low || drop.distance > high) continue;
    // A drop on a branch only exists for a rider on that branch.
    if (drop.branch && drop.branch !== detour) continue;
    const dropX = drop.x + getDetourOffset(drop.distance, drop.branch ?? "main");
    if (Math.abs(bikeX + getDetourOffset(drop.distance, detour) - dropX) > 1.15) continue;
    if (Math.abs(drop.y - (RIDE_HEIGHT + jumpHeight)) > 1.1) continue;
    picked.push(i);
  }
  return picked;
}

/** The ramp the bike just rode over (on the ground, moving forward), if any. */
export function rampHit(previous: number, position: number, bikeX: number, detour: DetourChoice, airborne: boolean) {
  if (airborne || position <= previous) return null;
  return RAMPS.find(ramp => previous < ramp.distance && position >= ramp.distance
    && (ramp.branch ?? "main") === (ramp.branch ? detour : "main")
    && Math.abs(bikeX - laneX(ramp.lane)) < 1.2) ?? null;
}
