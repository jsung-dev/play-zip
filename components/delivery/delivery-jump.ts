import { DELIVERY_GAME_CONFIG, type ObstaclePlacement } from "@/data/delivery-game";

// One short hop. Parabolic height over a fixed air time; no double jump.
export const JUMP_CONFIG = { height: 1.1, seconds: 0.68 } as const;

// Height the bike must exceed to pass over each kind. Fences stay solid.
export const OBSTACLE_CLEARANCE: Record<ObstaclePlacement["kind"], number | null> = {
  cones: 0.7,
  box: 0.75,
  barrier: null,
  plank: 0.4,
  crates: 0.5,
};

export function jumpHeightAt(elapsed: number | null) {
  if (elapsed === null) return 0;
  const t = elapsed / JUMP_CONFIG.seconds;
  return t <= 0 || t >= 1 ? 0 : 4 * JUMP_CONFIG.height * t * (1 - t);
}

export function clearsObstacle(kind: ObstaclePlacement["kind"], height: number) {
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
