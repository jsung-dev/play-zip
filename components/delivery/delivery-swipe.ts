export type SwipeAction = "left" | "right" | "jump" | "duck";

// Finger travel (px) before a drag counts as a swipe. A touch that never travels
// this far is a tap and jumps. After a swipe fires the origin resets to the
// finger, so one long drag can chain lane changes.
export const SWIPE_DISTANCE = 26;

export function classifySwipe(dx: number, dy: number): SwipeAction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_DISTANCE) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "jump" : "duck";
}
