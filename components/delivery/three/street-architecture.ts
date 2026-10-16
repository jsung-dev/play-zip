import * as THREE from "three";
import type { SceneryItem } from "@/data/delivery-game";
import { buildingProfile } from "./street-layout";
import { facadeDetails, NEIGHBORHOOD_FINISH as finish, type BuildingKit } from "./building-facade";

export type StreetBuildingKind = "wide-shop" | "corner-shop" | "split-house" | "balcony-villa" | "slim-villa" | "terrace-house";

// Actual model dimensions, independent from the unchanged lot planner.
export function streetArchitecture(item: Pick<SceneryItem, "type" | "variant">) {
  const lot = buildingProfile(item, true), v = item.variant % 5, shop = item.type === "shop";
  const kinds: StreetBuildingKind[] = ["split-house", "balcony-villa", "slim-villa", "terrace-house", "corner-shop"];
  const kind = shop ? v % 2 ? "corner-shop" : "wide-shop" : kinds[v];
  const floors = shop ? v % 2 ? 3 : 2 : [3, 4, 5, 3, 4][v];
  const pitch = shop ? floors === 2 ? 3.05 : 2.38 : [2.82, 3.03, 3.12, 2.85, 3.03][v];
  return { kind, floors, pitch, width: lot.width * (shop ? v % 2 ? .88 : 1.015 : [.93, .83, .71, .98, .9][v]),
    height: floors * pitch, depth: lot.depth, variant: v };
}

/** Six massings, with distinct facades on BOTH approach-facing ends.
 * Only scenery is changed: riding paths, delivery houses and ads are separate.
 */
export function createStreetArchitecture(item: SceneryItem, art: BuildingKit) {
  const spec = streetArchitecture(item), { kind, width: w, depth: d, height: h, floors, pitch, variant: v } = spec;
  const g = new THREE.Group(); g.userData.architecture = spec;
  const { piece, pane, rail, balcony, planter, awning, aircon } = facadeDetails(art);
  const wall = finish.walls[v], accent = finish.accents[v], cream = finish.cream, front = d / 2;
  const solid = (width: number, height: number, depth: number, x: number, y: number, z: number, color: string = wall) => piece(g, width, height, depth, color, x, y, z);
  const cap = (width: number, depth: number, x: number, y: number, z: number) => {
    solid(width + .2, .2, depth + .16, x, y, z, cream);
    for (const side of [-1, 1]) {
      solid(width + .05, .36, .12, x, y + .27, z + side * depth / 2);
      solid(.12, .36, depth, x + side * width / 2, y + .27, z);
    }
  };
  art.shadow(g, w + 1.2, d + 1.2);
  solid(w + .2, .22, d + .3, 0, .11, 0, "#ecdfc9");
  const stepped = kind === "wide-shop" || kind === "corner-shop" || kind === "terrace-house";
  const setback = kind === "terrace-house" ? 1.2 : kind === "wide-shop" ? .9 : .72;
  const topWidth = w * (kind === "terrace-house" ? .58 : kind === "wide-shop" ? .93 : .77);
  const topX = (w - topWidth) / 2;

  if (kind === "balcony-villa") {
    // Real recessed balcony stack between two solid vertical cores.
    solid(w, h, d - .9, 0, h / 2 + .2, -.45);
    for (const side of [-1, 1]) solid(w * .16, h, d, side * w * .42, h / 2 + .2, 0);
  } else if (kind === "slim-villa") {
    solid(w * .66, h - .18, d - .35, w * .17, (h - .18) / 2 + .2, -.175);
    solid(w * .34, h, d, -w * .33, h / 2 + .2, 0, cream);
  } else if (kind === "split-house") {
    solid(w * .49, h - pitch, d, -w * .255, (h - pitch) / 2 + .2, 0);
    solid(w * .51, h, d - .5, w * .245, h / 2 + .2, -.25);
  } else if (stepped) {
    solid(w, h - pitch, d, 0, (h - pitch) / 2 + .2, 0);
    solid(topWidth, pitch, d - setback, topX, h - pitch / 2 + .2, -setback / 2);
  }
  solid(w + .08, .34, d + .08, 0, .39, 0, finish.stone);

  for (let floor = 0; floor < floors; floor++) {
    const base = .2 + floor * pitch, upper = floor === floors - 1, wy = base + pitch * .51;
    if (kind === "balcony-villa") {
      pane(g, 0, wy, front - .88, w * .56, 2.03, 3);
      if (floor > 0) {
        balcony(g, w * .65, 0, base + .08, front - .87, 1.37);
        if (floor % 2) planter(g, w * .23, -w * .19, base + .26, front + .22);
      }
      pane(g, w * .42, wy + .05, front + .02, w * .1, 1.15, 1);
    } else if (kind === "slim-villa") {
      pane(g, -w * .33, wy, front + .025, w * .24, 2.48, 1, true);
      pane(g, w * .16, wy + .08, front - .325, w * .44, 1.48, 2);
      if (floor > 0 && floor % 2 === 0) rail(g, w * .43, w * .16, base + .45, front - .08);
    } else if (kind === "split-house") {
      pane(g, w * .245, wy, front - .48, w * .34, 1.65, 2);
      if (!upper) {
        pane(g, -w * .255, wy, front + .02, w * .34, 1.4, 2);
        if (floor === 1) balcony(g, w * .38, -w * .255, base + .28, front + .04, .56);
      }
    } else {
      const fw = upper ? topWidth : w, fx = upper ? topX : 0, z = front - (upper ? setback : 0) + .02;
      const retail = floor === 0 && kind !== "terrace-house";
      pane(g, fx, wy, z, fw * (retail ? .88 : .77), Math.min(pitch * .68, retail ? 2.25 : 1.72), kind === "wide-shop" ? 4 : 3);
      if (floor > 0 && !upper && kind === "corner-shop") solid(fw + .1, .18, d + .14, fx, base, 0, cream);
      if (retail) {
        awning(g, w * .88, 0, base + pitch - .38, front, accent);
        piece(g, .075, Math.min(pitch * .68, 2.25), .08, finish.metal, w * .22, wy, z + .12);
      }
    }
  }

  // Longitudinal faces dominate the moving camera: no common tiny-window grid.
  for (const side of [-1, 1]) {
    const face = new THREE.Group();
    const lowSplit = kind === "split-house" && side < 0, sideFloors = lowSplit ? floors - 1 : floors;
    for (let floor = 0; floor < sideFloors; floor++) {
      const base = .2 + floor * pitch, upper = floor === floors - 1, recessed = stepped && upper;
      const faceDepth = recessed ? d - setback : kind === "split-house" && side > 0 ? d - .5 : d;
      const fx = (recessed ? -setback / 2 : kind === "split-house" && side > 0 ? -.25 : 0) * -side;
      const inset = recessed && side < 0 ? w - topWidth : 0, wy = base + pitch * .51;
      if (kind === "slim-villa") {
        pane(face, -.95, wy, 0, 1.65, 2.4, 1, true);
        pane(face, 1.25, wy + .15, 0, 1.2, .95, 2);
      } else if (kind === "balcony-villa") {
        pane(face, 0, wy, 0, 2.9, 1.95, 3);
        if (floor > 0) {
          balcony(face, 3.15, 0, base + .15, .03, .53);
          if (floor === 2) planter(face, 1.05, -.75, base + .33, .32);
        }
      } else if (kind === "wide-shop") {
        pane(face, fx, wy, -inset, faceDepth * .8, upper ? 1.65 : 2.2, 3);
        if (!upper) awning(face, faceDepth * .9, fx, base + pitch - .38, 0, accent, .15);
      } else if (kind === "corner-shop") {
        pane(face, fx, wy, -inset, faceDepth * .76, Math.min(pitch * .68, 1.85), 3);
        if (floor === 0) awning(face, faceDepth * .84, fx, base + pitch - .38, 0, accent, .4);
        if (floor > 0 && !upper) rail(face, faceDepth * .74, fx, base + .3, .21);
      } else if (kind === "terrace-house") {
        pane(face, fx, wy, -inset, faceDepth * .78, upper ? 1.58 : 1.85, upper ? 2 : 3);
        if (floor === 1) piece(face, faceDepth, .25, .16, accent, fx, base + .05, .07);
      } else {
        pane(face, fx - .8, wy + .15, 0, 1.25, 1.35, 2);
        pane(face, fx + 1.1, wy - .1, 0, .65, 1.85, 1);
        if (floor === 1) aircon(face, fx + 1.15, base + .3, 0);
      }
    }
    const pipeHeight = (lowSplit || stepped && side < 0 ? h - pitch : h) - .8;
    piece(face, .055, pipeHeight, .055, cream, -d * .44, pipeHeight / 2 + .4, .08);
    face.rotation.y = side * Math.PI / 2; face.position.x = side * (w / 2 + .025); g.add(face);
  }

  if (kind === "split-house") {
    cap(w * .49, d, -w * .255, h - pitch + .23, 0);
    rail(g, w * .43, -w * .255, h - pitch + .5, front + .02);
    planter(g, w * .3, -w * .255, h - pitch + .36, -.9);
    const rw = w * .51 + .18, rise = .8;
    for (const sign of [-1, 1]) {
      const roof = art.box(Math.hypot(rw / 2, rise), .16, d - .25, accent);
      roof.rotation.z = -sign * Math.atan2(rise, rw / 2);
      art.put(g, roof, w * .245 + sign * rw / 4, h + .6, -.25);
    }
    const shape = new THREE.Shape([new THREE.Vector2(-rw / 2, 0), new THREE.Vector2(0, rise), new THREE.Vector2(rw / 2, 0)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d - .5, bevelEnabled: false, steps: 1 }), art.box(1,1,1,wall).material);
    art.put(g, roof, w * .245, h + .2, -d / 2);
  } else if (stepped) {
    cap(topWidth, d - setback, topX, h + .23, -setback / 2);
    solid(w + .16, .2, d + .16, 0, h - pitch + .25, 0, cream);
    rail(g, w * .92, 0, h - pitch + .36, front + .04);
    planter(g, Math.min(1.8,w * .25), -w * .28, h - pitch + .36, front - .25);
    if (kind === "terrace-house") solid(topWidth * .55, .5, 1.1, topX, h + .6, -.8, cream);
  } else {
    cap(w, d, 0, h + .24, 0);
    solid(w * .38, .75, 1.55, -w * .18, h + .68, -.8);
    solid(w * .38 + .16, .14, 1.7, -w * .18, h + 1.12, -.8, cream);
    rail(g, w * .88, 0, h + .46, front + .02);
    planter(g, w * .32, w * .23, h + .35, front - .35);
  }
  art.merge(g);
  return g;
}
