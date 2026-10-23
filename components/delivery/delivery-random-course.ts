import { OBSTACLE_PLACEMENTS, type ObstaclePlacement } from "@/data/delivery-game";
import { SECTIONS, type CourseSection } from "./delivery-course";
import { MOVER_PLACEMENTS, moverCollides, type MoverPlacement } from "./delivery-movers";
import { BOOSTERS, GAPS, GAP_LENGTH, RAMPS, type Booster, type Ramp } from "./delivery-pickups";

// A fresh main-road layout every ride, built from hand-tuned patterns under fixed rules:
// - only inside the open stretches: delivery zones (house +-30 m), the fork approach (435 m+), the detour roads and
//   merge (to 700 m) and the finish (no fixed obstacle after 939 m, nothing after 975 m) stay as designed,
// - at least MIN_GAP metres between patterns, a difficulty budget per stretch,
// - every ride has >= 2 "jump then slam down" sets and >= 1 duck beam,
// - both main-road ramps get a random lane and a random spot (kept 40 m+ from the alley exits).
// The warm-up (70-150 m) and the three detour roads (505-700 m) are kept as authored.

export type Lane = 0 | 1 | 2;
export type Course = { seed: number; obstacles: ObstaclePlacement[]; movers: MoverPlacement[]; ramps: Ramp[]; boosters: Booster[]; sections: CourseSection[]; cost: number };
type Piece = { obstacles: ObstaclePlacement[]; movers: MoverPlacement[]; ramps: Ramp[]; name?: string };
type Pattern = { key: string; cost: number; length: number; build: (at: number, rng: () => number) => Piece };

export const MIN_GAP = 20;
// Open main-road stretches [from, to]; the last one only takes moving hazards (no fixed obstacles near the finish).
export const STRETCHES = [
  { from: 230, to: 363 },
  { from: 701, to: 793 },
  { from: 860, to: 939 },
  { from: 960, to: 975, moversOnly: true },
] as const;
// Ramp spots: each one 40 m+ past its alley exit (stop + 38 m); nothing for 32 m after (longest flight 22.4 m + 8 m).
const LANDING = 32;
const RAMP_WINDOWS = [[264, 300], [894, 905]] as const;
// Difficulty the random patterns add up to (ramps count 2 each); a ride lands within +-4.
export const TARGET_COST = 23;

// Seeded so a ride can be replayed and tests can sweep thousands of rides.
export function rng32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(rng: () => number, items: readonly T[]) => items[Math.floor(rng() * items.length)];
const lane = (rng: () => number) => pick(rng, [0, 1, 2] as const);
const others = (open: Lane) => ([0, 1, 2] as const).filter(l => l !== open);
const o = (id: string, distance: number, kind: ObstaclePlacement["kind"], laneIndex: Lane, span?: 1 | 2 | 3): ObstaclePlacement => ({ id, distance, lane: laneIndex, kind, ...(span ? { span } : {}) });
const piece = (p: Partial<Piece>): Piece => ({ obstacles: [], movers: [], ramps: [], ...p });

export const PATTERNS: Pattern[] = [
  // Easy (1)
  { key: "cone", cost: 1, length: 0, build: (d, r) => piece({ obstacles: [o(`cone-${d}`, d, "cones", lane(r))] }) },
  { key: "crates2", cost: 1, length: 0, build: (d, r) => piece({ obstacles: [o(`crates-${d}`, d, "crates", pick(r, [0, 1] as const), 2)] }) },
  { key: "plank", cost: 1, length: 0, build: d => piece({ obstacles: [o(`plank-${d}`, d, "plank", 0, 3)] }) },
  { key: "barrier", cost: 1, length: 0, build: (d, r) => piece({ obstacles: [o(`barrier-${d}`, d, "barrier", lane(r))] }) },
  // Medium (2)
  { key: "funnel", cost: 2, length: 0, build: (d, r) => { const open = lane(r); return piece({ obstacles: others(open).map(l => o(`cones-${d}-${l}`, d, "cones", l)) }); } },
  { key: "zigzag", cost: 2, length: 0, build: (d, r) => { const [a, b] = others(lane(r)); const [wall, box] = r() < .5 ? [a, b] : [b, a]; return piece({ obstacles: [o(`barrier-${d}`, d, "barrier", wall), o(`crates-${d}`, d, "crates", box)] }); } },
  { key: "duck", cost: 2, length: 0, build: d => piece({ obstacles: [o(`duck-overhead-${d}`, d, "overhead", 0, 3)], name: "숙이기 구간 · 아래로 쓸기" }) },
  { key: "slider", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `slider-${d}`, kind: "slider", trigger: 0, distance: d, phase: r() * 6 }], name: "움직이는 바리케이드" }) },
  { key: "boom", cost: 2, length: 0, build: d => piece({ movers: [{ id: `boom-${d}`, kind: "boom", trigger: 0, distance: d }], name: "차단기 · 열릴 때 지나가기" }) },
  { key: "melon", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `drop-${d}`, kind: "dropper", trigger: d - 32, distance: d, look: pick(r, ["melon", "pot", "parcel"] as const) }], name: "하늘 조심" }) },
  { key: "cat", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `cat-${d}`, kind: "cat", trigger: 0, distance: d, phase: r() }], name: "고양이가 지나가요" }) },
  { key: "ducks", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `ducks-${d}`, kind: "ducks", trigger: 0, distance: d, phase: r() }], name: "오리 가족" }) },
  // Hard (3)
  { key: "jumpslam", cost: 3, length: 9, build: d => piece({ obstacles: [o(`slam-plank-${d}`, d, "plank", 0, 3), o(`slam-signbeam-${d + 9}`, d + 9, "signbeam", 0, 3)], name: "급하강 · 점프 뒤 바로 아래로" }) },
  { key: "geysers", cost: 3, length: 0, build: (d, r) => { const base = r() * 2; return piece({ movers: ([0, 1, 2] as const).map(l => ({ id: `geyser-${d}-${l}`, kind: "geyser" as const, trigger: 0, distance: d, lane: l, phase: base + l * 1.2 })), name: "맨홀 증기" }); } },
  { key: "gates", cost: 3, length: 0, build: (d, r) => { const base = r() * 2; return piece({ movers: ([0, 1, 2] as const).map(l => ({ id: `gate-${d}-${l}`, kind: "lanegate" as const, trigger: 0, distance: d, lane: l, phase: base + l * 1.3 })), name: "신호 차선 · 열린 차선으로" }); } },
  { key: "bus", cost: 3, length: 48, build: d => piece({ obstacles: [o(`bus-crates-${d}`, d, "crates", 0, 2), o(`bus-cone-${d + 48}`, d + 48, "cones", 0)], movers: [{ id: `bus-${d + 26}`, kind: "bus", trigger: d - 2, distance: d + 26 }], name: "버스 주의" }) },
];
// A ramp over a collapsed road: cones on the other two lanes funnel the rider onto the ramp lane.
const RAMP_LENGTH = 11 + 1 + GAP_LENGTH + 12;
const rampPattern = (d: number, rampLane: Lane): Piece => piece({
  obstacles: others(rampLane).map(l => o(`ramp-cones-${d}-${l}`, d, "cones", l)),
  ramps: [{ distance: d + 11, lane: rampLane }],
  name: "무너진 도로 · 점프대로!",
});
const byKey = (key: string) => PATTERNS.find(p => p.key === key)!;

type Slot = { length: number; cost: number; build: (at: number) => Piece };
type Segment = { from: number; to: number; budget: number; moversOnly?: boolean };
const MOVING = new Set(["slider", "boom", "melon", "cat", "ducks", "geysers", "gates"]);
function fill(stretch: Segment, required: Slot[], rng: () => number): { pieces: Piece[]; cost: number } | null {
  const room = stretch.to - stretch.from;
  if (room < 0) return required.length ? null : { pieces: [], cost: 0 };
  const choices = PATTERNS.filter(p => !stretch.moversOnly || MOVING.has(p.key));
  for (let attempt = 0; attempt < 200; attempt++) {
    const slots = [...required];
    let cost = slots.reduce((sum, s) => sum + s.cost, 0);
    while (cost < stretch.budget) {
      const p = pick(rng, choices.filter(q => q.cost <= stretch.budget - cost));
      if (!p) break;
      slots.push({ length: p.length, cost: p.cost, build: at => p.build(at, rng) }); cost += p.cost;
    }
    const used = slots.reduce((sum, s) => sum + s.length, 0) + MIN_GAP * (slots.length - 1);
    if (cost > stretch.budget + 1 || used > room) { if (attempt > 150) stretch = { ...stretch, budget: Math.max(0, stretch.budget - 1) }; continue; }
    // Shuffle, then share the spare room out at random between the pieces.
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const cuts = slots.map(() => rng()), total = cuts.reduce((a, b) => a + b, 0) + rng();
    let at: number = stretch.from;
    const spare = room - used, pieces: Piece[] = [];
    slots.forEach((slot, i) => {
      at += spare * cuts[i] / total;
      pieces.push(slot.build(Math.round(at)));
      at += slot.length + MIN_GAP;
    });
    // Equal patterns back to back read as one; ask again.
    const names = pieces.map(p => p.obstacles[0]?.kind + (p.movers[0]?.kind ?? ""));
    if (names.some((n, i) => i > 0 && n === names[i - 1])) continue;
    return { pieces, cost };
  }
  return null;
}

const DEFAULT = { obstacles: [...OBSTACLE_PLACEMENTS], movers: [...MOVER_PLACEMENTS], ramps: [...RAMPS], boosters: [...BOOSTERS], sections: [...SECTIONS] };
const onMain = (p: { branch?: string }) => !p.branch;
// Authored main-road pieces that stay: the warm-up and the middle of the three detour roads.
const KEEP = (p: { distance: number; branch?: string }) => !onMain(p) || p.distance < 200 || (p.distance > 505 && p.distance < 700);

export function generateCourse(seed: number): Course {
  const rng = rng32(seed), between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  for (let attempt = 0; attempt < 50; attempt++) {
    const [rampB, rampE] = RAMP_WINDOWS.map(([lo, hi]) => between(lo, hi));
    const rampPieces = [rampB, rampE].map(r => rampPattern(r - 11, lane(rng)));
    const [b, d, e, f] = STRETCHES;
    const before = rampB - 11 - MIN_GAP - b.from, after = b.to - (rampB + LANDING), split = Math.round(6 * Math.max(0, before) / Math.max(1, before + after));
    const segments: Segment[] = [
      { from: b.from, to: rampB - 11 - MIN_GAP, budget: split },
      { from: rampB + LANDING, to: b.to, budget: 6 - split },
      { from: d.from, to: d.to, budget: 8 },
      { from: rampE + LANDING, to: e.to, budget: 2 },
      { from: f.from, to: f.to, budget: 3, moversOnly: true },
    ];
    // Mandatory sets go to random segments that can hold them.
    const required = segments.map(() => [] as Slot[]);
    const slot = (key: string): Slot => { const p = byKey(key); return { length: p.length, cost: p.cost, build: at => p.build(at, rng) }; };
    const fits = (len: number) => segments.map((sg, i) => [sg, i] as const).filter(([sg]) => !sg.moversOnly && sg.to - sg.from >= len).map(([, i]) => i);
    if (fits(9).length === 0) continue;
    required[pick(rng, fits(9))].push(slot("jumpslam"));
    required[pick(rng, fits(9))].push(slot("jumpslam"));
    required[pick(rng, fits(0))].push(slot("duck"));
    const filled = segments.map((sg, i) => fill(sg, required[i], rng));
    if (filled.some(x => !x)) continue;
    const pieces = [...rampPieces, ...filled.flatMap(x => x!.pieces)];
    const obstacles = [...DEFAULT.obstacles.filter(KEEP), ...pieces.flatMap(p => p.obstacles)];
    const movers = [...DEFAULT.movers.filter(KEEP), ...pieces.flatMap(p => p.movers)];
    const ramps = [...DEFAULT.ramps.filter(p => !onMain(p)), ...pieces.flatMap(p => p.ramps)].sort((x, y) => x.distance - y.distance);
    const hazards = [...obstacles.filter(onMain).map(p => p.distance), ...movers.filter(onMain).map(p => p.distance), ...ramps.filter(onMain).flatMap(r => [r.distance, r.distance + 1 + GAP_LENGTH])];
    const boosters = [...DEFAULT.boosters.filter(p => !onMain(p))];
    for (let n = 0; n < 400 && boosters.filter(onMain).length < 4; n++) {
      const sg = pick(rng, STRETCHES), at = Math.round(sg.from + rng() * (sg.to - sg.from));
      if (hazards.some(h => Math.abs(h - at) < 8) || ramps.some(r => !r.branch && at > r.distance - 2 && at < r.distance + 3 + GAP_LENGTH) || boosters.some(x => Math.abs(x.distance - at) < 30)) continue;
      boosters.push({ distance: at, lane: lane(rng) });
    }
    if (boosters.filter(onMain).length < 4) continue;
    // As busy as the authored ride: >= 20 main-road hazards (same count as the course test).
    if (obstacles.filter(x => onMain(x) && x.kind !== "signbeam").length + movers.filter(m => onMain(m) && moverCollides(m.kind) && m.kind !== "drum").length + ramps.filter(onMain).length < 20) continue;
    boosters.sort((x, y) => x.distance - y.distance);
    const sections: CourseSection[] = [
      ...DEFAULT.sections.filter(sc => sc.from === 70 || sc.from === 505), // warm-up and detour banners stay
      ...pieces.filter(p => p.name).map(p => ({ from: Math.max(0, Math.min(...[...p.obstacles.map(x => x.distance), ...p.movers.map(x => x.distance), ...p.ramps.map(x => x.distance)]) - 18), name: p.name! })),
    ].sort((x, y) => x.from - y.from);
    return { seed, obstacles, movers, ramps, boosters, sections, cost: 4 + filled.reduce((sum, x) => sum + x!.cost, 0) };
  }
  return { seed, ...DEFAULT, cost: 0 };
}

const replace = <T,>(target: T[], items: T[]) => { target.length = 0; target.push(...items); };
/** Swap the live course in place: every module that reads these arrays sees the new ride. */
export function applyCourse(course: Pick<Course, "obstacles" | "movers" | "ramps" | "boosters" | "sections">) {
  replace(OBSTACLE_PLACEMENTS, course.obstacles);
  replace(MOVER_PLACEMENTS, course.movers);
  replace(RAMPS, course.ramps);
  replace(GAPS, course.ramps.map(ramp => ({ start: ramp.distance + 1, end: ramp.distance + 1 + GAP_LENGTH, branch: ramp.branch })));
  replace(BOOSTERS, course.boosters);
  replace(SECTIONS, course.sections);
}
export const restoreDefaultCourse = () => applyCourse(DEFAULT);
