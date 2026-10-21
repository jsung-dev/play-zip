import * as THREE from "three";
import type { SceneArt } from "./scene-art";

/** Timings (seconds) of the resident's part in a delivery. */
export const DUCK = { minWalkSeconds: .8, handSeconds: .5, homeSeconds: 1.6, restU: 9.3, meetGap: 1.8, meetAhead: 4.5, speed: 4 } as const;

type Point = { u: number; v: number }; // u: lateral across the road, v: along it
export type DuckPhaseInput = {
  waving: boolean;            // bike is close: wave hello
  arrived: number;            // seconds since the bike stopped (0 = not stopped here)
  delivered: number | null;   // seconds since the correct answer (null = not delivered)
  rest: Point; meet: Point; door: Point;
};
export type DuckPose = { at: Point; look: Point; anim: "idle" | "wave" | "walk" | "hand"; visible: boolean; carrying: boolean };

const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: Point, b: Point, t: number): Point => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });

/** How long the duck needs to waddle from its spot to the meeting point, a few metres ahead of the bike. */
export const duckWalkSeconds = (restU: number, meetU: number) => Math.max(DUCK.minWalkSeconds, Math.hypot(restU - meetU, DUCK.meetAhead) / DUCK.speed);

/** Where the duck is and what it does: waits, walks to the stopped bike, takes the parcel, carries it home. */
export function duckPose(s: DuckPhaseInput): DuckPose {
  const bike: Point = { u: s.meet.u + Math.sign(s.rest.u - s.meet.u) * -DUCK.meetGap, v: s.meet.v - DUCK.meetAhead };
  if (s.delivered !== null) {
    if (s.delivered < DUCK.handSeconds) return { at: s.meet, look: bike, anim: "hand", visible: true, carrying: s.delivered > DUCK.handSeconds / 2 };
    const t = (s.delivered - DUCK.handSeconds) / DUCK.homeSeconds;
    return { at: mix(s.meet, s.door, ease(Math.min(1, t))), look: s.door, anim: "walk", visible: t < 1, carrying: true };
  }
  if (s.arrived > 0) {
    const t = Math.min(1, s.arrived / duckWalkSeconds(s.rest.u, s.meet.u));
    return { at: mix(s.rest, s.meet, ease(t)), look: t < 1 ? s.meet : bike, anim: t < 1 ? "walk" : "wave", visible: true, carrying: false };
  }
  return { at: s.rest, look: { u: 0, v: s.rest.v }, anim: s.waving ? "wave" : "idle", visible: true, carrying: false };
}

/** The meeting spot: a few metres in front of the stopped bike, on the house side, so the camera sees the whole handover. */
export function meetPoint(bikeU: number, side: number): Point { return { u: bikeU + side * DUCK.meetGap, v: DUCK.meetAhead }; }

/** A cute duck neighbour: round yellow body, orange beak and feet, a colourful shirt. */
export function createDuckResident(art: SceneArt, shirt: string) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const yellow = "#ffd84d", orange = "#ff9f3b", ink = "#2b3a3a";
  const torso = art.sphere(.5, yellow); torso.scale.set(1, 1.08, .95); art.put(body, torso, 0, .78, 0);
  const tee = art.sphere(.52, shirt); tee.scale.set(1.01, .62, .97); art.put(body, tee, 0, .56, 0);
  const head = art.sphere(.4, yellow); art.put(body, head, 0, 1.5, .02);
  art.put(body, art.sphere(.1, yellow), 0, 1.92, -.02); // tuft
  const beak = art.box(.3, .1, .3, orange, .04); art.put(body, beak, 0, 1.42, .4);
  art.put(body, art.box(.22, .06, .2, "#f0862a", .03), 0, 1.36, .38);
  for (const x of [-.15, .15]) { art.put(body, art.sphere(.065, ink), x, 1.55, .35); art.put(body, art.sphere(.022, "#ffffff"), x + .02, 1.575, .405); }
  for (const x of [-.27, .27]) art.put(body, art.sphere(.07, "#ff9f8a"), x, 1.42, .3); // cheeks
  art.put(body, art.sphere(.2, yellow), 0, .72, -.5); // tail tuft
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .52, 1.02, 0);
    const wing = art.sphere(.17, yellow); wing.scale.set(.7, 1.7, .8); wing.position.y = -.24; pivot.add(wing);
    body.add(pivot); return pivot;
  });
  const legs = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .2, .3, 0);
    art.put(pivot, art.cylinder(.05, .05, .26, orange), 0, -.12, 0);
    art.put(pivot, art.box(.26, .06, .36, orange, .02), 0, -.27, .08);
    group.add(pivot); return pivot;
  });
  group.scale.setScalar(.95);
  return { group, body, arms, legs };
}
export type DuckResident = ReturnType<typeof createDuckResident>;

/** Pure pose to joints: waving arm, swinging legs, bobbing body. */
export function animateDuck(duck: DuckResident, anim: DuckPose["anim"], time: number, carrying: boolean) {
  const [left, right] = duck.arms, [legL, legR] = duck.legs;
  const walk = anim === "walk", wave = anim === "wave", hand = anim === "hand";
  duck.body.position.y = walk ? Math.abs(Math.sin(time * 9)) * .09 : anim === "idle" ? Math.sin(time * 2.4) * .02 : wave ? Math.abs(Math.sin(time * 6)) * .05 : 0;
  legL.rotation.x = walk ? Math.sin(time * 9) * .7 : 0; legR.rotation.x = -legL.rotation.x;
  right.rotation.set(0, 0, wave ? 2.5 + Math.sin(time * 10) * .35 : .18);
  left.rotation.set(hand || carrying ? -1.2 : 0, 0, hand || carrying ? -.35 : -.18);
  if (hand || carrying) right.rotation.set(-1.2, 0, .35);
}
