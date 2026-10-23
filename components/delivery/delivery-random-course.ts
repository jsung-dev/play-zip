import { OBSTACLE_PLACEMENTS, type ObstaclePlacement } from "@/data/delivery-game";
import { SECTIONS, type CourseSection } from "./delivery-course";
import { MOVER_PLACEMENTS, moverCollides, type MoverPlacement } from "./delivery-movers";
import { BOOSTERS, GAPS, GAP_LENGTH, RAMPS, type Booster, type Ramp } from "./delivery-pickups";

// A fresh layout every ride, built from hand-tuned patterns under fixed rules:
// - main road: only inside the open stretches (delivery zones house +-30 m, the last 20 m before the fork, the
//   detour roads/merge to 700 m and the finish - no fixed obstacle after 939 m, nothing after 975 m - stay clear),
//   patterns MIN_GAP..MAX_GAP apart, >= 2 "jump then slam down" sets, >= 1 duck beam, >= MIN_MOVERS moving kinds,
//   both ramps in a random lane and spot (40 m+ from the alley exits), difficulty within TARGET_COST +- 6;
// - the three detour roads each pick one of a few authored variants (their ramps get a random lane too).
// The warm-up (70-150 m) is kept as authored.

export type Lane = 0 | 1 | 2;
export type Course = { seed: number; obstacles: ObstaclePlacement[]; movers: MoverPlacement[]; ramps: Ramp[]; boosters: Booster[]; sections: CourseSection[]; cost: number };
type Piece = { obstacles: ObstaclePlacement[]; movers: MoverPlacement[]; ramps: Ramp[]; name?: string };
// weight: how often a filler is picked (easy one-step patterns less often).
type Pattern = { key: string; cost: number; length: number; weight?: number; build: (at: number, rng: () => number) => Piece };

export const MIN_GAP = 20;
// Open main-road stretches [from, to]; the last one only takes moving hazards (no fixed obstacles near the finish).
export const STRETCHES = [
  { from: 230, to: 363 },
  { from: 431, to: 474 },
  { from: 701, to: 793 },
  { from: 860, to: 939 },
  { from: 960, to: 975, moversOnly: true },
] as const;
// Ramp spots: each one 40 m+ past its alley exit (stop + 38 m); nothing for 32 m after (longest flight 22.4 m + 8 m).
const LANDING = 32;
const RAMP_WINDOWS = [[264, 300], [894, 905]] as const;
// Difficulty the random main-road patterns add up to (ramps count 2 each); a ride lands within +-6.
export const TARGET_COST = 33;

// Seeded so a ride can be replayed and tests can sweep thousands of rides.
export function rng32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(rng: () => number, items: readonly T[]) => items[Math.floor(rng() * items.length)];
const pickWeighted = (rng: () => number, items: readonly Pattern[]) => {
  let r = rng() * items.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  return items.find(p => (r -= p.weight ?? 1) < 0) ?? items[items.length - 1];
};
const lane = (rng: () => number) => pick(rng, [0, 1, 2] as const);
const others = (open: Lane) => ([0, 1, 2] as const).filter(l => l !== open);
const o = (id: string, distance: number, kind: ObstaclePlacement["kind"], laneIndex: Lane, span?: 1 | 2 | 3, branch?: "left" | "right"): ObstaclePlacement =>
  ({ id, distance, lane: laneIndex, kind, ...(span ? { span } : {}), ...(branch ? { branch } : {}) });
const piece = (p: Partial<Piece>): Piece => ({ obstacles: [], movers: [], ramps: [], ...p });
const zigzag = (id: string, d: number, r: () => number, branch?: "left" | "right") => {
  const [a, b] = others(lane(r)); const [wall, box] = r() < .5 ? [a, b] : [b, a];
  return [o(`${id}-barrier-${d}`, d, "barrier", wall, undefined, branch), o(`${id}-crates-${d}`, d, "crates", box, undefined, branch)];
};
const funnel = (id: string, d: number, open: Lane, branch?: "left" | "right") => others(open).map(l => o(`${id}-cones-${d}-${l}`, d, "cones", l, undefined, branch));

export const PATTERNS: Pattern[] = [
  // Easy (1): one move, picked less often.
  { key: "cone", cost: 1, length: 0, weight: .3, build: (d, r) => piece({ obstacles: [o(`cone-${d}`, d, "cones", lane(r))] }) },
  { key: "crates2", cost: 1, length: 0, weight: .6, build: (d, r) => piece({ obstacles: [o(`crates-${d}`, d, "crates", pick(r, [0, 1] as const), 2)] }) },
  { key: "plank", cost: 1, length: 0, weight: .6, build: d => piece({ obstacles: [o(`plank-${d}`, d, "plank", 0, 3)] }) },
  { key: "barrier", cost: 1, length: 0, weight: .6, build: (d, r) => piece({ obstacles: [o(`barrier-${d}`, d, "barrier", lane(r))] }) },
  // Medium (2)
  { key: "funnel", cost: 2, length: 0, build: (d, r) => piece({ obstacles: funnel("p", d, lane(r)) }) },
  { key: "zigzag", cost: 2, length: 0, build: (d, r) => piece({ obstacles: zigzag("p", d, r) }) },
  { key: "duck", cost: 2, length: 0, build: d => piece({ obstacles: [o(`duck-overhead-${d}`, d, "overhead", 0, 3)], name: "숙이기 구간 · 아래로 쓸기" }) },
  { key: "slider", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `slider-${d}`, kind: "slider", trigger: 0, distance: d, phase: r() * 6 }], name: "움직이는 바리케이드" }) },
  { key: "boom", cost: 2, length: 0, build: d => piece({ movers: [{ id: `boom-${d}`, kind: "boom", trigger: 0, distance: d }], name: "차단기 · 열릴 때 지나가기" }) },
  { key: "melon", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `drop-${d}`, kind: "dropper", trigger: d - 32, distance: d, look: pick(r, ["melon", "pot", "parcel"] as const) }], name: "하늘 조심" }) },
  { key: "cat", cost: 2, length: 0, weight: .5, build: (d, r) => piece({ movers: [{ id: `cat-${d}`, kind: "cat", trigger: 0, distance: d, phase: r() }], name: "고양이가 지나가요" }) },
  { key: "ducks", cost: 2, length: 0, build: (d, r) => piece({ movers: [{ id: `ducks-${d}`, kind: "ducks", trigger: 0, distance: d, phase: r() }], name: "오리 가족" }) },
  // Hard (3)
  { key: "jumpslam", cost: 3, length: 9, build: d => piece({ obstacles: [o(`slam-plank-${d}`, d, "plank", 0, 3), o(`slam-signbeam-${d + 9}`, d + 9, "signbeam", 0, 3)], name: "급하강 · 점프 뒤 바로 아래로" }) },
  { key: "geysers", cost: 3, length: 0, build: (d, r) => { const base = r() * 2; return piece({ movers: ([0, 1, 2] as const).map(l => ({ id: `geyser-${d}-${l}`, kind: "geyser" as const, trigger: 0, distance: d, lane: l, phase: base + l * 1.2 })), name: "맨홀 증기" }); } },
  { key: "gates", cost: 3, length: 0, build: (d, r) => { const base = r() * 2; return piece({ movers: ([0, 1, 2] as const).map(l => ({ id: `gate-${d}-${l}`, kind: "lanegate" as const, trigger: 0, distance: d, lane: l, phase: base + l * 1.3 })), name: "신호 차선 · 열린 차선으로" }); } },
  // Combos (4): two or three moves back to back, 12 m apart, like the authored ride.
  { key: "duckbar", cost: 4, length: 12, build: (d, r) => piece({ obstacles: [o(`duckbar-overhead-${d}`, d, "overhead", 0, 3), ...zigzag("duckbar", d + 12, r)], name: "숙이고 바로 피하기" }) },
  { key: "duckslide", cost: 4, length: 14, build: (d, r) => piece({ obstacles: [o(`duckslide-overhead-${d}`, d, "overhead", 0, 3)], movers: [{ id: `duckslide-slider-${d + 14}`, kind: "slider", trigger: 0, distance: d + 14, phase: r() * 6 }], name: "숙이고 바리케이드" }) },
  { key: "rhythm", cost: 4, length: 24, build: (d, r) => piece({ obstacles: [o(`rhythm-plank-${d}`, d, "plank", 0, 3), o(`rhythm-crates-${d + 12}`, d + 12, "crates", pick(r, [0, 1] as const), 2), ...funnel("rhythm", d + 24, lane(r))], name: "점프 리듬" }) },
];
// A ramp over a collapsed road: cones on the other two lanes funnel the rider onto the ramp lane.
const rampPattern = (d: number, rampLane: Lane): Piece => piece({ obstacles: funnel("ramp", d, rampLane), ramps: [{ distance: d + 11, lane: rampLane }], name: "무너진 도로 · 점프대로!" });
const byKey = (key: string) => PATTERNS.find(p => p.key === key)!;

// The three detour roads (straight part 570-635 m for fixed obstacles; detour ramps at 590 m, landing clear to 621 m).
function detours(rng: () => number): Piece {
  const left = lane(rng), right = lane(rng);
  // Left (works road): funnel onto its ramp (milk drums roll in from the side lanes when the ramp is central), then one of three after landing.
  const leftIn = left === 1
    ? piece({ obstacles: funnel("left", 574, 1, "left"), movers: ([0, 2] as const).map(l => ({ id: `drum-left-${l}`, kind: "drum" as const, trigger: 554, distance: 585, lane: l, branch: "left" as const })) })
    : piece({ obstacles: funnel("left", 574, left, "left") });
  const leftOut = pick(rng, [
    () => { const at = pick(rng, [0, 1] as const); return [o("left-crates-623", 623, "crates", at, 2, "left"), o("left-cones-634", 634, "cones", at === 0 ? 2 : 0, undefined, "left")]; },
    () => zigzag("left", 626, rng, "left"),
    () => [o("left-plank-623", 623, "plank", 0, 3, "left"), ...funnel("left", 634, lane(rng), "left")],
  ])();
  // Right (sky road): steam or signal gates before the ramp, then something crossing and things falling after landing.
  const rightBefore = pick(rng, ["geyser", "lanegate"] as const), base = rng() * 2;
  const rightMovers: MoverPlacement[] = [
    ...([0, 1, 2] as const).map(l => ({ id: `${rightBefore}-right-574-${l}`, kind: rightBefore, trigger: 0, distance: 574, lane: l, phase: base + l * 1.2, branch: "right" as const })),
    { id: "cross-right-628", kind: pick(rng, ["cart", "ducks", "cat"] as const), trigger: 0, distance: 628, branch: "right", phase: rng() },
    { id: "drop-right-646", kind: "dropper", trigger: 616, distance: 646, branch: "right", look: pick(rng, ["parcel", "melon"] as const) },
    ...([0, 2] as const).map((l, n) => ({ id: `pot-right-660-${l}`, kind: "dropper" as const, trigger: 630, distance: 660, lane: l, look: "pot" as const, branch: "right" as const, ...(n ? { delay: .3 } : {}) })),
  ];
  // Middle (main road between the detours): one of three, each ending in a jump then a slam under the sign beam.
  const mid = pick(rng, [
    () => [o("mid-crates-580", 580, "crates", pick(rng, [0, 1] as const), 2), o("mid-plank-603", 603, "plank", 0, 3), o("mid-signbeam-612", 612, "signbeam", 0, 3)],
    () => [...zigzag("mid", 580, rng), o("mid-plank-603", 603, "plank", 0, 3), o("mid-signbeam-612", 612, "signbeam", 0, 3)],
    () => [o("mid-overhead-580", 580, "overhead", 0, 3), ...funnel("mid", 591, lane(rng)), o("mid-plank-603", 603, "plank", 0, 3), o("mid-signbeam-612", 612, "signbeam", 0, 3)],
  ])();
  return piece({
    obstacles: [...leftIn.obstacles, ...leftOut, ...mid],
    movers: [...leftIn.movers, { id: "slider-left-652", kind: "slider", trigger: 0, distance: 652, branch: "left", phase: rng() * 6 }, ...rightMovers],
    ramps: [{ distance: 590, lane: left, branch: "left" }, { distance: 590, lane: right, branch: "right" }],
  });
}

type Slot = { key: string; length: number; cost: number; build: (at: number) => Piece };
// slackAtEnd: unused room goes after the last piece (segments that start at a ramp landing), else before the first.
type Segment = { from: number; to: number; moversOnly?: boolean; slackAtEnd?: boolean };
// Patterns whose main hazard moves; every ride gets at least MIN_MOVERS different ones.
const MOVING = ["slider", "boom", "melon", "cat", "ducks", "geysers", "gates"];
export const MAX_GAP = 30, MIN_MOVERS = 5;
const asSlot = (p: Pattern, rng: () => number): Slot => ({ key: p.key, length: p.length, cost: p.cost, build: at => p.build(at, rng) });
const span = (slots: Slot[]) => slots.reduce((sum, s) => sum + s.length, 0) + MIN_GAP * Math.max(0, slots.length - 1);
// Packs a segment: required patterns plus fillers (patterns not used yet in this ride first) until no
// more fit at MIN_GAP, then spaces them MIN_GAP..MAX_GAP apart.
function fill(segment: Segment, required: Slot[], rng: () => number, used: Set<string>): { pieces: Piece[]; cost: number } | null {
  const room = segment.to - segment.from;
  if (room < 0) return required.length ? null : { pieces: [], cost: 0 };
  const choices = PATTERNS.filter(p => (!segment.moversOnly || MOVING.includes(p.key)) && p.key !== "jumpslam" && p.key !== "duck");
  for (let attempt = 0; attempt < 100; attempt++) {
    const slots = [...required];
    if (span(slots) > room) return null;
    for (let tries = 0; tries < 30; tries++) {
      const fresh = choices.filter(p => !used.has(p.key) && !slots.some(s => s.key === p.key));
      const p = pickWeighted(rng, fresh.length ? fresh : choices);
      if (span([...slots, asSlot(p, rng)]) <= room) slots.push(asSlot(p, rng));
    }
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    if (slots.some((s, i) => i > 0 && s.key === slots[i - 1].key)) continue; // equal patterns back to back read as one
    // Extra spacing 0..10 m per gap, shrunk if it would overrun; the rest sits at the end away from a ramp.
    const extras = slots.slice(1).map(() => rng() * (MAX_GAP - MIN_GAP)), slack = room - span(slots), sum = extras.reduce((a, b) => a + b, 0);
    const scale = sum > slack ? slack / sum : 1;
    let at = segment.from + (segment.slackAtEnd ? 0 : slack - sum * scale);
    const pieces = slots.map((s, i) => { if (i) at += MIN_GAP + extras[i - 1] * scale; const p = s.build(Math.round(at)); at += s.length; return p; });
    slots.forEach(s => used.add(s.key));
    return { pieces, cost: slots.reduce((t, s) => t + s.cost, 0) };
  }
  return null;
}

const DEFAULT = { obstacles: [...OBSTACLE_PLACEMENTS], movers: [...MOVER_PLACEMENTS], ramps: [...RAMPS], boosters: [...BOOSTERS], sections: [...SECTIONS] };
const onMain = (p: { branch?: string }) => !p.branch;
// Authored pieces that stay: the warm-up only.
const KEEP = (p: { distance: number; branch?: string }) => onMain(p) && p.distance < 200;

export function generateCourse(seed: number): Course {
  const rng = rng32(seed), between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  for (let attempt = 0; attempt < 50; attempt++) {
    const [rampB, rampE] = RAMP_WINDOWS.map(([lo, hi]) => between(lo, hi));
    const rampPieces = [rampB, rampE].map(r => rampPattern(r - 11, lane(rng)));
    const [b, c, d, e, f] = STRETCHES;
    const segments: Segment[] = [
      { from: b.from, to: rampB - 11 - MIN_GAP },
      { from: rampB + LANDING, to: b.to, slackAtEnd: true },
      { from: c.from, to: c.to },
      { from: d.from, to: d.to },
      { from: e.from, to: rampE - 11 - MIN_GAP },
      { from: rampE + LANDING, to: e.to, slackAtEnd: true },
      { from: f.from, to: f.to, moversOnly: true },
    ];
    // Mandatory sets go to random segments that can hold them.
    const required = segments.map(() => [] as Slot[]);
    const fits = (s: Slot, moving = false) => segments.map((sg, i) => i).filter(i => (!segments[i].moversOnly || moving) && span([...required[i], s]) <= segments[i].to - segments[i].from);
    const place = (s: Slot, moving = false) => { const options = fits(s, moving); if (!options.length) return false; required[pick(rng, options)].push(s); return true; };
    const pool = [...MOVING], moving = Array.from({ length: MIN_MOVERS }, () => asSlot(byKey(pool.splice(Math.floor(rng() * pool.length), 1)[0]), rng));
    if (![asSlot(byKey("jumpslam"), rng), asSlot(byKey("jumpslam"), rng), asSlot(byKey("duck"), rng)].every(s => place(s)) || !moving.every(s => place(s, true))) continue;
    const used = new Set(required.flat().map(s => s.key));
    const filled = segments.map((sg, i) => fill(sg, required[i], rng, used));
    if (filled.some(x => !x)) continue;
    const cost = 4 + filled.reduce((sum, x) => sum + x!.cost, 0);
    if (Math.abs(cost - TARGET_COST) > 6) continue; // keep every ride near the same difficulty
    const pieces = [...rampPieces, ...filled.flatMap(x => x!.pieces), detours(rng)];
    const obstacles = [...DEFAULT.obstacles.filter(KEEP), ...pieces.flatMap(p => p.obstacles)];
    const movers = [...DEFAULT.movers.filter(KEEP), ...pieces.flatMap(p => p.movers)];
    const ramps = pieces.flatMap(p => p.ramps).sort((x, y) => x.distance - y.distance);
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
    return { seed, obstacles, movers, ramps, boosters, sections, cost };
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
