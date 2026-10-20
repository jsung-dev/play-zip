import { DELIVERY_GAME_CONFIG, type ObstaclePlacement } from "@/data/delivery-game";

// One short hop. Parabolic height over a fixed air time; no double jump.
export const JUMP_CONFIG = { height: 1.5, seconds: 0.75 } as const;

// Height the bike must exceed to pass over each kind. Fences stay solid.
// Ducking is a short crouch with no air time; a low bar is passed only while crouched.
export const DUCK_SECONDS = 0.7;
// 0 upright, 1 fully crouched, eased in and out over 0.12 s.
export function duckAmountAt(elapsed: number | null) {
  if (elapsed === null) return 0;
  return Math.max(0, Math.min(1, elapsed / .12, (DUCK_SECONDS - elapsed) / .12));
}

export const OBSTACLE_CLEARANCE: Record<ObstaclePlacement["kind"], number | null> = {
  cones: 0.85, // drawn 25% taller
  box: 0.9,
  barrier: null,
  plank: 0.4,
  crates: 0.6, // drawn 25% taller
  overhead: null, // a low bar across the road: duck under it, jumping does not help
};

// A ramp launches with more power: higher and longer than a tap jump.
export const RAMP_POWER = 1.7;
export const jumpDuration = (power = 1) => JUMP_CONFIG.seconds * (1 + (power - 1) * .6);

export function jumpHeightAt(elapsed: number | null, power = 1) {
  if (elapsed === null) return 0;
  const t = elapsed / jumpDuration(power);
  return t <= 0 || t >= 1 ? 0 : 4 * JUMP_CONFIG.height * power * t * (1 - t);
}

export function clearsObstacle(kind: ObstaclePlacement["kind"], height: number, ducking = false) {
  if (kind === "overhead") return ducking;
  const clearance = OBSTACLE_CLEARANCE[kind];
  return clearance !== null && height > clearance;
}

export const obstacleSpan = (obstacle: Pick<ObstaclePlacement, "span">) => obstacle.span ?? 1;

// `lane` is the leftmost covered lane; wider obstacles extend to the right.
export function obstacleCenterX(obstacle: Pick<ObstaclePlacement, "lane" | "span">) {
  return (obstacle.lane - 1 + (obstacleSpan(obstacle) - 1) / 2) * DELIVERY_GAME_CONFIG.laneSpacing;
}

export function obstacleHitHalfWidth(obstacle: Pick<ObstaclePlacement, "span">) {
  return DELIVERY_GAME_CONFIG.collisionHalfWidth + 0.52 + (obstacleSpan(obstacle) - 1) * DELIVERY_GAME_CONFIG.laneSpacing / 2;
}
