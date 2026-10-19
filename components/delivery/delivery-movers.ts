import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";

// Moving hazards. Timed ones (boom gate, sliding barrier, cat, ducks) run on the
// game clock from the start, so the rider has to read them and time a pass.
// Triggered ones (bus, falling box, drums, pigeons) wake when the bike reaches
// `trigger`; the falling box aims at the lane the bike is in at that moment.
export type MoverKind = "bus" | "cat" | "ducks" | "pigeons" | "boom" | "slider" | "dropper" | "drum";
type Branch = "left" | "right";
export type MoverPlacement = { id: string; kind: MoverKind; trigger: number; distance: number; lane?: 0 | 1 | 2; branch?: Branch; phase?: number };
// `live`: whether it can be hit right now; `y`: height of a falling box; `lift`: boom arm (0 down, 1 up).
export type MoverPose = { distance: number; x: number; y: number; lift: number; live: boolean; done: boolean };

const laneX = (n: number) => (n - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
const smooth = (t: number) => { const v = Math.min(1, Math.max(0, t)); return v * v * (3 - 2 * v); };
// Back and forth across the road edge to edge (±halfSpan) at `speed` m/s.
const pingPong = (clock: number, speed: number, halfSpan: number, phase = 0) => {
  const period = 4 * halfSpan / speed, u = ((clock / period + phase) % 1 + 1) % 1;
  return u < .5 ? -halfSpan + 4 * halfSpan * u : 3 * halfSpan - 4 * halfSpan * u;
};

export const TIMED: ReadonlySet<MoverKind> = new Set(["cat", "ducks", "boom", "slider"]);

export const MOVER_PLACEMENTS: MoverPlacement[] = [
  { id: "pigeons-158", kind: "pigeons", trigger: 136, distance: 158 },
  // Railway-style boom gate across the whole road, just before the first ramp.
  { id: "boom-258", kind: "boom", trigger: 0, distance: 258 },
  // A barrier on wheels sweeping across all three lanes.
  { id: "slider-326", kind: "slider", trigger: 0, distance: 326 },
  // On each detour branch, milk drums roll down the side lanes toward the rider,
  // herding them into the centre lane and onto the ramp.
  ...(["left", "right"] as const).flatMap(branch => [
    { id: `drum-${branch}-0`, kind: "drum" as const, trigger: 554, distance: 585, lane: 0 as const, branch },
    { id: `drum-${branch}-2`, kind: "drum" as const, trigger: 554, distance: 585, lane: 2 as const, branch },
  ]),
  // Bus pulls out of the right bus stop into lane 2 and drives on slowly.
  { id: "bus-726", kind: "bus", trigger: 698, distance: 726 },
  { id: "pigeons-790", kind: "pigeons", trigger: 768, distance: 790 },
  // A parcel tumbles off a balcony into the rider's lane; its shadow grows first.
  { id: "dropper-842", kind: "dropper", trigger: 806, distance: 842 },
  // Finale: a cat pacing across the road, then a whole duck family.
  { id: "cat-905", kind: "cat", trigger: 0, distance: 905 },
  { id: "ducks-926", kind: "ducks", trigger: 0, distance: 926, phase: .35 },
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
};
export const moverCollides = (kind: MoverKind) => kind !== "pigeons";

export const BOOM_CYCLE = { down: 1.8, rise: .5, up: 1.6, lower: .5 } as const;
export const DROP = { seconds: 1.1, height: 9 } as const;

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
    case "boom": {
      const c = BOOM_CYCLE, period = c.down + c.rise + c.up + c.lower, u = ((clock + (mover.phase ?? 0)) % period + period) % period;
      const lift = u < c.down ? 0 : u < c.down + c.rise ? smooth((u - c.down) / c.rise) : u < c.down + c.rise + c.up ? 1 : 1 - smooth((u - c.down - c.rise - c.up) / c.lower);
      return { ...base, lift, live: lift < .35 };
    }
    case "slider": return { ...base, x: 3.3 * Math.sin(clock * Math.PI * 2 / 3.6 + (mover.phase ?? 0)) };
    case "pigeons": return { ...base, live: false, done: woke && t > 3 };
    case "dropper": {
      const f = Math.min(1, t / DROP.seconds);
      return { ...base, x: target, y: woke ? DROP.height * (1 - f * f) : DROP.height, live: woke && f > .85 };
    }
    case "drum": {
      // Rolls 26 m toward the rider at 7 m/s, then rests on its lane.
      const travel = Math.min(26, 7 * t);
      return { ...base, distance: mover.distance - travel, x: laneX(mover.lane ?? 0), live: woke };
    }
    case "bus": {
      // 2 s indicator, 3 s merge into lane 2, cruise at 8 m/s, back to the bus lane at 785–800 m.
      const distance = mover.distance + 8 * Math.max(0, t - 2);
      const inLane = smooth((t - 2) / 3) * (1 - smooth((distance - 785) / 15));
      return { ...base, distance, x: DELIVERY_GAME_CONFIG.busLaneOffset + (laneX(2) - DELIVERY_GAME_CONFIG.busLaneOffset) * inLane, done: distance > 960 };
    }
  }
}

/** Nearest lane centre to a lane-relative x (used to aim the falling box). */
export const snapToLane = (x: number) => laneX(Math.max(0, Math.min(2, Math.round(x / DELIVERY_GAME_CONFIG.laneSpacing) + 1)));
