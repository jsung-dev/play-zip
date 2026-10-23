import { CHUNK_METERS } from "@/data/challenge-route";
import { OBSTACLE_PLACEMENTS } from "@/data/delivery-game";
import { OUTDOOR_ADS, type OutdoorAdPlacement, type OverheadAdPlacement } from "@/data/delivery-outdoor-ads";
import { SECTIONS } from "./delivery-course";
import { MOVER_PLACEMENTS } from "./delivery-movers";
import { BOOSTERS, GAPS, GAP_LENGTH, RAMPS, type Booster } from "./delivery-pickups";
import { LANDING, MAX_GAP, MIN_GAP, PATTERNS, applyCourse, lane, pickWeighted, rng32, type Lane, type Piece } from "./delivery-random-course";

// Challenge obstacles, made one 100 m chunk at a time from the random-course patterns.
// Difficulty grows with distance: harder patterns, tighter spacing, ramps from 1 km.
export const CHALLENGE_COURSE = {
  warmUp: 80, // nothing before this
  rampFrom: 1_000,
  rampChance: .3,
  rampSpacing: 200, // never two ramps close together
  rampGuardFrom: 3_000, // before this the ramp stands alone; after it, crates and barriers sit in the other lanes
  fullDifficultyAt: 6_000,
  // Ads stay in view: a roadside board every chunk (sides alternate), an over-the-road banner every 2nd chunk.
  overheadEvery: 2,
  boostersPerChunk: 2, // milk boosters keep the run fast
  boosterSpacing: 25,
} as const;

// The street changes look every kilometre so the endless road does not read as one long loop.
export const CHALLENGE_THEMES = [
  { name: "도심 거리", sky: ["#2aa9f5", "#86d6fb", "#e9f8ff"], fog: "#e3f4fb", hemisphere: "#f4fbff", subShare: .08, trees: false },
  { name: "가로수길", sky: ["#3bb6e8", "#a6e3f2", "#effbef"], fog: "#e6f6e6", hemisphere: "#f2fff2", subShare: .6, trees: true },
  { name: "노을 거리", sky: ["#f08a5d", "#ffc59a", "#ffecd9"], fog: "#ffe3cf", hemisphere: "#ffe9d6", subShare: .3, trees: false },
] as const;
export type ChallengeTheme = (typeof CHALLENGE_THEMES)[number];
export const themeAt = (distance: number): ChallengeTheme => CHALLENGE_THEMES[Math.floor(Math.max(0, distance) / 1_000) % CHALLENGE_THEMES.length];

export type ChallengeChunk = Piece & { boosters: Booster[]; ads: OutdoorAdPlacement[]; overheads: OverheadAdPlacement[] };

/** 0 at the start, 1 from `fullDifficultyAt` on. */
export const difficultyAt = (distance: number) => Math.min(1, Math.max(0, distance / CHALLENGE_COURSE.fullDifficultyAt));
/** Highest pattern cost allowed: singles first, then hard ones from 1 km, combos from 2 km. */
export const maxCostAt = (distance: number) => distance < 1_000 ? 2 : distance < 2_000 ? 3 : 4;

const MAIN_ADS = OUTDOOR_ADS.filter(ad => ad.route === "main");

// hazards: recent hazard spots (pieces reach across chunk borders), for booster spacing.
let state: { rng: () => number; cursor: number; chunks: ChallengeChunk[]; hazards: number[]; lastRamp: number } | null = null;

// A ramp over a collapsed road. No cone funnel pointing at it: early on the rider spots the ramp alone,
// later the other two lanes hold mixed, staggered crates/barriers to dodge on the way.
function challengeRamp(at: number, rampLane: Lane, rng: () => number): Piece {
  const guards = at < CHALLENGE_COURSE.rampGuardFrom ? [] : ([0, 1, 2] as const).filter(l => l !== rampLane).map((l, n) => {
    const kind = rng() < .5 ? "crates" as const : "barrier" as const, d = at + (n === 0 ? 0 : 5);
    return { id: `ramp-${kind}-${d}-${l}`, distance: d, lane: l, kind };
  });
  return { obstacles: guards, movers: [], ramps: [{ distance: at + 11, lane: rampLane }], name: "무너진 도로 · 점프대를 찾아요!" };
}

/** Starts a fresh endless course and clears the live course arrays. */
export function startChallengeCourse(seed: number) {
  applyCourse({ obstacles: [], movers: [], ramps: [], boosters: [], sections: [] });
  state = { rng: rng32(seed), cursor: CHALLENGE_COURSE.warmUp, chunks: [], hazards: [], lastRamp: -Infinity };
}

/**
 * Pieces starting in chunk `index`, generating (in order) up to it. New pieces are appended to the live
 * course arrays the game reads.
 * shortcut: the arrays only grow during a run (the booster pickup state is keyed by index); fine for
 * runs of tens of km, prune with re-keyed pickups if runs get much longer.
 */
export function challengeChunk(index: number): ChallengeChunk {
  if (!state) startChallengeCourse(0); // the start screen's backdrop, before any ride
  const s = state!;
  while (s.chunks.length <= index) {
    const i = s.chunks.length, end = (i + 1) * CHUNK_METERS, rng = s.rng;
    const chunk: ChallengeChunk = { obstacles: [], movers: [], ramps: [], boosters: [], ads: [], overheads: [] };
    const hazards = s.hazards = s.hazards.filter(h => h > i * CHUNK_METERS - 20);
    while (s.cursor < end) {
      const at = Math.round(s.cursor), t = difficultyAt(at);
      let piece: Piece, length: number;
      if (at >= CHALLENGE_COURSE.rampFrom && at - s.lastRamp >= CHALLENGE_COURSE.rampSpacing && rng() < CHALLENGE_COURSE.rampChance) {
        piece = challengeRamp(at, lane(rng), rng); length = 11 + LANDING; s.lastRamp = at;
        GAPS.push({ start: at + 12, end: at + 12 + GAP_LENGTH });
        hazards.push(at + 12, at + 12 + GAP_LENGTH);
      } else {
        // Hard patterns turn up more often as the run goes on.
        const choices = PATTERNS.filter(p => p.cost <= maxCostAt(at)).map(p => ({ ...p, weight: (p.weight ?? 1) * (p.cost >= 3 ? .3 + 1.7 * t : 1) }));
        const pattern = pickWeighted(rng, choices);
        piece = pattern.build(at, rng); length = pattern.length;
      }
      chunk.obstacles.push(...piece.obstacles); chunk.movers.push(...piece.movers); chunk.ramps.push(...piece.ramps);
      hazards.push(at, ...piece.obstacles.map(x => x.distance), ...piece.movers.map(x => x.distance), at + length);
      if (piece.name) SECTIONS.push({ from: Math.max(0, at - 18), name: piece.name });
      // Spacing shrinks from 32-42 m at the start to 20-25 m at full difficulty.
      s.cursor = at + length + MIN_GAP + 12 * (1 - t) + rng() * (MAX_GAP - MIN_GAP) * (1 - t / 2);
    }
    const start = i * CHUNK_METERS;
    for (let tries = 0; tries < 16 && chunk.boosters.length < CHALLENGE_COURSE.boostersPerChunk; tries++) {
      const at = Math.round(Math.max(30, start + 5 + rng() * 90));
      const inGap = GAPS.some(g => at > g.start - 3 && at < g.end + 2);
      const crowded = [...BOOSTERS, ...chunk.boosters].some(b => Math.abs(b.distance - at) < CHALLENGE_COURSE.boosterSpacing);
      // s.cursor is where the next piece will start.
      if (!inGap && !crowded && at <= s.cursor - 8 && hazards.every(h => Math.abs(h - at) >= 8)) chunk.boosters.push({ distance: at, lane: lane(rng) });
    }
    chunk.boosters.sort((x, y) => x.distance - y.distance);
    if (i % CHALLENGE_COURSE.overheadEvery === 0) chunk.overheads.push({ id: `challenge-overhead-${i}`, format: "banner", image: null, distance: start + 20, width: 12, height: 9, supportSpan: 18.5 });
    chunk.ads.push({ ...MAIN_ADS[i % MAIN_ADS.length], id: `challenge-ad-${i}`, distance: start + 65, route: "main", side: i % 2 ? "left" : "right" });
    OBSTACLE_PLACEMENTS.push(...chunk.obstacles); MOVER_PLACEMENTS.push(...chunk.movers);
    RAMPS.push(...chunk.ramps); BOOSTERS.push(...chunk.boosters);
    s.chunks.push(chunk);
  }
  return s.chunks[index];
}
