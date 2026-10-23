// Challenge mode: no deliveries or quiz, just ride as far as possible. Each bump or fall costs a heart.
export type GameMode = "brand" | "challenge";
export const CHALLENGE = {
  hearts: 5,
  // Each lap of the course is a little faster (x1.06 per lap, capped at x1.5).
  lapSpeedStep: .06,
  maxSpeedFactor: 1.5,
} as const;

export const heartsLeft = (hits: number) => Math.max(0, CHALLENGE.hearts - hits);
export const challengeSpeedFactor = (lap: number) => Math.min(CHALLENGE.maxSpeedFactor, 1 + lap * CHALLENGE.lapSpeedStep);

// Best distance is a per-device convenience; private mode or blocked storage just means no record.
const BEST_KEY = "delivery-challenge-best";
export function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
/** Saves `meters` if it beats the record; returns the record after saving. */
export function saveBest(meters: number) {
  const best = readBest();
  if (meters <= best) return best;
  try { localStorage.setItem(BEST_KEY, String(Math.floor(meters))); } catch { /* not persisted */ }
  return Math.floor(meters);
}
