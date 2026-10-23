import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";

// Moving hazards. Timed ones (boom gate, lane gates, steam vents, sliding barrier,
// cart, cat, ducks) run on the game clock from the start, so the rider has to read
// them and time a pass. Triggered ones (bus, falling things, drums, pigeons) wake
// when the bike reaches `trigger`. A falling thing aims at the lane the bike is in
// at that moment, unless it has a fixed `lane`; `delay` staggers a volley.
export type MoverKind = "bus" | "cat" | "ducks" | "pigeons" | "boom" | "slider" | "dropper" | "drum" | "geyser" | "lanegate" | "cart";
export type DropLook = "parcel" | "pot" | "melon";
type Branch = "left" | "right";
// `phase`: seconds for boom/lanegate/geyser, radians for slider, fraction of a lap for cat/ducks/cart.
export type MoverPlacement = { id: string; kind: MoverKind; trigger: number; distance: number; lane?: 0 | 1 | 2; branch?: Branch; phase?: number; delay?: number; look?: DropLook };
// `live`: whether it can be hit right now; `y`: height of a falling box; `lift`: boom arm (0 down, 1 up).
export type MoverPose = { distance: number; x: number; y: number; lift: number; live: boolean; done: boolean };

const laneX = (n: number) => (n - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
const smooth = (t: number) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };
// Back and forth across the road edge to edge (±halfSpan) at `speed` m/s.
const pingPong = (clock: number, speed: number, halfSpan: number, phase = 0) => {
  const period = 4 * halfSpan / speed, u = ((clock / period + phase) % 1 + 1) % 1;
  return u < .5 ? -halfSpan + 4 * halfSpan * u : 3 * halfSpan - 4 * halfSpan * u;
};

export const TIMED: ReadonlySet<MoverKind> = new Set(["cat", "ducks", "boom", "slider", "geyser", "lanegate", "cart"]);

export const MOVER_PLACEMENTS: MoverPlacement[] = [
  // 3구간: 점프대 앞 철도 차단기.
  { id: "boom-258", kind: "boom", trigger: 0, distance: 258 },
  // 4구간: 세 차선을 쓸고 다니는 바퀴 달린 바리케이드 → 화분 → 맨홀 증기 물결.
  { id: "slider-338", kind: "slider", trigger: 0, distance: 338 },
  ...([0, 1, 2] as const).map((lane): MoverPlacement => ({ id: `geyser-364-${lane}`, kind: "geyser", trigger: 0, distance: 364, lane, phase: lane * 1.2 })),
  // 왼쪽 우회로(공사장 길): 양옆에서 우유통이 굴러와 가운데 점프대로 몰고, 착지 뒤엔 바리케이드가 오간다.
  ...(["left"] as const).flatMap(branch => [
    { id: `drum-${branch}-0`, kind: "drum" as const, trigger: 554, distance: 585, lane: 0 as const, branch },
    { id: `drum-${branch}-2`, kind: "drum" as const, trigger: 554, distance: 585, lane: 2 as const, branch },
  ]),
  { id: "slider-left-652", kind: "slider", trigger: 0, distance: 652, branch: "left", phase: 1.4 },
  // 오른쪽 우회로(하늘 길): 맨홀 증기 → 점프대 → 폭주 카트와 택배·화분 소나기.
  ...([0, 1, 2] as const).map((lane): MoverPlacement => ({ id: `geyser-right-574-${lane}`, kind: "geyser", trigger: 0, distance: 574, lane, phase: lane * 1.2, branch: "right" })),
  { id: "cart-right-628", kind: "cart", trigger: 0, distance: 628, branch: "right" },
  { id: "drop-right-646", kind: "dropper", trigger: 616, distance: 646, branch: "right" },
  { id: "pot-right-660-0", kind: "dropper", trigger: 630, distance: 660, lane: 0, look: "pot", branch: "right" },
  { id: "pot-right-660-2", kind: "dropper", trigger: 630, distance: 660, lane: 2, look: "pot", branch: "right", delay: .3 },
  // 7구간: 버스가 3차선을 막는 동안 하늘에서 수박이 내려옴.
  { id: "bus-726", kind: "bus", trigger: 698, distance: 726 },
  // 8구간: 차선마다 따로 열리고 닫히는 신호 게이트. (세 번째 배달 존 뒤 40m)
  ...([0, 1, 2] as const).map((lane): MoverPlacement => ({ id: `gate-866-${lane}`, kind: "lanegate", trigger: 0, distance: 866, lane, phase: lane * 1.3 })),
  { id: "melon-794", kind: "dropper", trigger: 762, distance: 794, look: "melon" },
  // 마지막: 폭주 카트 대신 고양이와 오리 가족이 계속 길을 오간다.
  { id: "cat-954", kind: "cat", trigger: 0, distance: 954 },
  { id: "ducks-970", kind: "ducks", trigger: 0, distance: 970, phase: .35 },
];

export const MOVER_SHAPE: Record<MoverKind, { halfWidth: number; halfLength: number; clearance: number | null }> = {
  bus: { halfWidth: 1.3, halfLength: 3.1, clearance: null },
  cat: { halfWidth: .65, halfLength: .4, clearance: .6 },
  ducks: { halfWidth: 1.9, halfLength: .35, clearance: .45 },
  pigeons: { halfWidth: 0, halfLength: 0, clearance: 0 },
  boom: { halfWidth: 6, halfLength: .3, clearance: .95 },
  slider: { halfWidth: 1.25, halfLength: .4, clearance: null },
  dropper: { halfWidth: .75, halfLength: .6, clearance: .9 },
  drum: { halfWidth: .65, halfLength: .5, clearance: .8 },
  geyser: { halfWidth: .75, halfLength: .6, clearance: 1 },
  lanegate: { halfWidth: 1.1, halfLength: .3, clearance: .95 },
  cart: { halfWidth: .8, halfLength: .8, clearance: .55 },
};
export const moverCollides = (kind: MoverKind) => kind !== "pigeons";

export const BOOM_CYCLE = { down: 1.8, rise: .5, up: 1.6, lower: .5 } as const;
// One gate per lane, each on its own phase: at least one lane is always open.
export const GATE_CYCLE = { down: 1.6, rise: .35, up: 1.6, lower: .35 } as const;
// Steam vent: rumbles (warn), blasts (live while strong), then settles.
export const GEYSER_CYCLE = { rest: 1, warn: .9, blast: 1.3, settle: .3 } as const;
export const DROP = { seconds: 1.1, height: 9 } as const;

type ArmCycle = { down: number; rise: number; up: number; lower: number };
/** Arm height 0 (down, blocking) … 1 (up) at time `clock` of a repeating cycle. */
function armLift(clock: number, c: ArmCycle) {
  const period = c.down + c.rise + c.up + c.lower, u = (clock % period + period) % period;
  return u < c.down ? 0 : u < c.down + c.rise ? smooth((u - c.down) / c.rise) : u < c.down + c.rise + c.up ? 1 : 1 - smooth((u - c.down - c.rise - c.up) / c.lower);
}

/**
 * Pose of a mover. `clock` is game time; `started` is when a triggered mover
 * woke (undefined = not yet); `target` is the lane x captured at wake-up.
 */
export function moverPose(mover: MoverPlacement, clock: number, started?: number, target = 0): MoverPose {
  const t = started === undefined ? 0 : clock - started, woke = started !== undefined;
  const base = { distance: mover.distance, x: 0, y: 0, lift: 0, live: true, done: false };
  switch (mover.kind) {
    case "cat": return { ...base, x: pingPong(clock, 2.4, 6.2, mover.phase) };
    case "ducks": return { ...base, x: pingPong(clock, 1.5, 6.8, mover.phase) };
    case "boom": { const lift = armLift(clock + (mover.phase ?? 0), BOOM_CYCLE); return { ...base, lift, live: lift < .35 }; }
    case "lanegate": { const lift = armLift(clock + (mover.phase ?? 0), GATE_CYCLE); return { ...base, x: laneX(mover.lane ?? 1), lift, live: lift < .35 }; }
    case "geyser": {
      const c = GEYSER_CYCLE, period = c.rest + c.warn + c.blast + c.settle, u = ((clock + (mover.phase ?? 0)) % period + period) % period;
      const b = (u - c.rest - c.warn) / c.blast, warn = u > c.rest && u < c.rest + c.warn ? (u - c.rest) / c.warn : 0;
      const lift = b < 0 || b >= 1 ? 0 : b < .15 ? smooth(b / .15) : b > .8 ? 1 - smooth((b - .8) / .2) : 1;
      return { ...base, x: laneX(mover.lane ?? 1), y: warn, lift, live: lift > .5 };
    }
    case "cart": return { ...base, x: pingPong(clock, 5.4, 5.2, mover.phase) };
    case "slider": return { ...base, x: 3.3 * Math.sin(clock * Math.PI * 2 / 3.6 + (mover.phase ?? 0)) };
    case "pigeons": return { ...base, live: false, done: woke && t > 3 };
    case "dropper": {
      const f = Math.min(1, Math.max(0, t - (mover.delay ?? 0)) / DROP.seconds);
      return { ...base, x: mover.lane === undefined ? target : laneX(mover.lane), y: woke ? DROP.height * (1 - f * f) : DROP.height, live: woke && f > .85 };
    }
    case "drum": {
      // Rolls 26 m toward the rider at 7 m/s, then rests on its lane.
      const travel = Math.min(26, 7 * t);
      return { ...base, distance: mover.distance - travel, x: laneX(mover.lane ?? 0), live: woke };
    }
    case "bus": {
      // 2 s indicator, 3 s merge into lane 2, cruise at 8 m/s, back to the bus lane 59–74 m on (785–800 m for the bus at 726 m).
      const distance = mover.distance + 8 * Math.max(0, t - 2);
      const inLane = smooth((t - 2) / 3) * (1 - smooth((distance - mover.distance - 59) / 15));
      return { ...base, distance, x: DELIVERY_GAME_CONFIG.busLaneOffset + (laneX(2) - DELIVERY_GAME_CONFIG.busLaneOffset) * inLane, done: distance > mover.distance + 234 };
    }
  }
}

/** Nearest lane centre to a lane-relative x (used to aim the falling box). */
export const snapToLane = (x: number) => laneX(Math.max(0, Math.min(2, Math.round(x / DELIVERY_GAME_CONFIG.laneSpacing) + 1)));
