import * as THREE from "three";
import type { SceneryItem } from "@/data/delivery-game";
import { buildingProfile } from "./street-layout";
import { facadeDetails, NEIGHBORHOOD_FINISH as finish, type BuildingKit } from "./building-facade";

export type StreetBuildingKind = "apricot-shop" | "mint-villa" | "cream-tower" | "lavender-house" | "yellow-shop";
const KINDS: StreetBuildingKind[] = ["apricot-shop", "mint-villa", "cream-tower", "lavender-house", "yellow-shop"];

// Keep the existing lots, entrances and ad sightlines. Storeys are constructed
// individually: windows and doors never stretch with the building height.
export function streetArchitecture(item: Pick<SceneryItem, "type" | "variant">) {
  const lot = buildingProfile(item, true), v = item.variant % 5;
  const design = item.type === "shop" ? v % 2 ? 4 : 0 : v;
  const floors = [2, 4, 5, 3, 2][design], pitch = [3.05, 2.85, 3.05, 2.86, 3.12][design];
  const width = lot.width * [1, .8, .7, .9, 1.01][design];
  return { kind: KINDS[design], design, floors, pitch, width, height: floors * pitch, depth: lot.depth, variant: v };
}

/** A–E physical models. +Z faces the street; both end elevations are modeled
 * because these are also visible from the fixed riding camera.
 */
export function createStreetArchitecture(item: SceneryItem, art: BuildingKit) {
  const spec = streetArchitecture(item), { kind, width: w, depth: d, height: h, floors, pitch, design } = spec;
  const g = new THREE.Group(); g.name = `street-architecture:${kind}`; g.userData.architecture = spec;
  const { piece, pane, rail, balcony, planter, awning, aircon } = facadeDetails(art);
  const wall = finish.walls[design], cream = finish.cream, front = d / 2, ground = .2;
  const solid = (width: number, height: number, depth: number, x: number, y: number, z: number, color: string = wall) => piece(g, width, height, depth, color, x, y, z);
  const band = (y: number, color: string = cream) => solid(w + .18, .22, d + .16, 0, y, 0, color);
  const mint = design === 1, tower = design === 2, lavender = design === 3;
  const balconyDepth = 1.05, nicheWidth = w * .4 - .24, nicheX = w * .3 - .12;
  art.shadow(g, w + 1.2, d + 1.2);
  solid(w + .28, .2, d + .28, 0, .1, 0, finish.stone);

  if (mint) {
    solid(w, pitch, d, 0, ground + pitch / 2, 0);
    // An actual empty right-hand recess, not a dark patch on a solid facade.
    const upperH = h - pitch, upperY = ground + pitch + upperH / 2;
    solid(w, upperH, d - balconyDepth, 0, upperY, -balconyDepth / 2);
    solid(w * .6, upperH, balconyDepth, -w * .2, upperY, front - balconyDepth / 2);
    solid(.24, upperH, balconyDepth, w / 2 - .12, upperY, front - balconyDepth / 2);
    g.userData.balconyRecess = { x: nicheX, front, back: front - balconyDepth, width: nicheWidth, floors: [1, 2, 3] };
  } else {
    solid(w, h, d, 0, ground + h / 2, 0);
  }
  solid(w + .06, .22, d + .06, 0, .31, 0, finish.stone);

  // One distinct storefront composition per building, with real framing and
  // handles. Warm opaque panes suggest interiors without transparent sorting.
  const storefront = (doorX: number, doorW: number, windowX: number, windowW: number) => {
    const y = ground + 1.3, height = 2.3;
    pane(g, doorX, y, front + .015, doorW, height, 1);
    pane(g, windowX, y, front + .015, windowW, height, design === 0 || design === 4 ? 3 : 2);
    piece(g, .055, .4, .08, cream, doorX + doorW * .32, y - .15, front + .21);
    for (const x of [doorX, windowX - windowW * .22, windowX + windowW * .22]) {
      piece(g, .025, .27, .025, finish.metal, x, 2.41, front + .09);
      piece(g, .14, .18, .035, "#FFE3A0", x, 2.2, front + .1);
    }
  };
  storefront(-w * .32, w * .19, w * .13, w * .59);
  if (!mint && !lavender) awning(g, w * .94, 0, pitch - .15, front, finish.accents[design], .82);

  for (let floor = 1; floor < floors; floor++) {
    const base = ground + floor * pitch, wy = base + pitch * .51;
    // B's cream band wraps the entire floor, including balcony slab/ceiling.
    if (!tower) band(base, lavender ? "#DCC5EE" : cream);
    else {
      solid(w * .37, .12, d + .1, w * .315, base, 0, cream);
    }
    if (mint) {
      pane(g, -w * .2, wy, front + .015, w * .4, 1.62, 2);
      piece(g, nicheWidth, pitch - .24, .035, "#8BAF95", nicheX, base + pitch / 2, front - balconyDepth + .025);
      // Matte inner reveals make the recess readable without shadow maps.
      for (const side of [-1,1]) piece(g, .025, pitch - .24, balconyDepth, "#97BB9F", nicheX + side * (nicheWidth / 2 - .013), base + pitch / 2, front - balconyDepth / 2);
      piece(g, nicheWidth, .025, balconyDepth, "#8BAF95", nicheX, base + pitch - .13, front - balconyDepth / 2);
      pane(g, nicheX, base + 1.26, front - balconyDepth + .06, nicheWidth * .65, 1.92, 2);
      rail(g, nicheWidth - .12, nicheX, base + .12, front - .12);
      piece(g, nicheWidth, .09, balconyDepth - .06, cream, nicheX, base + .15, front - balconyDepth / 2);
      planter(g, .48, nicheX + nicheWidth * .26, base + .2, front - .43);
      piece(g, .17, .025, .17, "#FFE3A0", nicheX, base + pitch - .14, front - .5);
    } else if (tower) {
      pane(g, w * .29, wy, front + .015, w * .19, 1.65, 1);
      rail(g, w * .23, w * .29, wy - .8, front + .23);
    } else if (lavender) {
      pane(g, 0, wy, front + .015, w * .7, 1.58, 3);
      if (floor === 1) {
        balcony(g, w * .76, 0, base + .14, front + .02, .58);
        planter(g, .65, w * .24, base + .32, front + .3);
      } else aircon(g, -w * .36, base + .3, front + .02);
    } else if (design === 0) {
      pane(g, 0, wy, front + .015, w * .76, 1.63, 4);
    } else {
      for (const x of [-w * .29, 0, w * .29]) pane(g, x, wy, front + .015, w * .15, 1.55, 1);
    }
  }
  if (tower) {
    const glassBottom = pitch + .38, glassTop = h - .18;
    pane(g, -w * .18, (glassTop + glassBottom) / 2, front + .04, w * .39, glassTop - glassBottom, 2, true);
    for (let floor = 2; floor < floors; floor++) {
      piece(g, w * .39, .055, .075, finish.metal, -w * .18, ground + floor * pitch, front + .16);
    }
    solid(.18, h - pitch + .12, .24, w * .07, (h + pitch) / 2 + .2, front + .06, cream);
  }

  // B: exactly two slender windows per floor on each side, as in the sheet.
  // A/E: two side windows; C: one vertical stair-side window; D: paired windows.
  for (const side of [-1, 1]) {
    const face = new THREE.Group();
    for (let floor = 0; floor < floors; floor++) {
      const base = ground + floor * pitch, y = base + pitch * .51;
      if (tower) {
        pane(face, 0, y, 0, 1.15, 1.65, 1);
      } else {
        const width = mint ? .91 : lavender ? 1.12 : 1.05;
        for (const x of [-1.08, 1.08]) pane(face, x, y, 0, width, floor === 0 ? 1.55 : 1.6, lavender ? 2 : 1);
      }
      if (floor === 0 && (mint || lavender)) aircon(face, -1.7, 1.25, .02);
    }
    piece(face, .06, h - .5, .06, cream, -d * .45, h / 2, .06);
    face.rotation.y = side * Math.PI / 2; face.position.x = side * (w / 2 + .015); g.add(face);
  }

  // Flat roofs with different silhouette, not a shared sloped/gable cap.
  band(h + ground + .05, lavender ? "#C8A7DF" : cream);
  solid(w - .08, .1, d - .08, 0, h + ground + .2, 0, mint ? "#A8D5AC" : wall);
  if (mint || tower || lavender) {
    const railBase = h + ground + .25;
    for (const z of [-d / 2 + .2, d / 2 - .2]) rail(g, w - .35, 0, railBase, z);
    for (const side of [-1, 1]) {
      const end = new THREE.Group(); rail(end, d - .4, 0, railBase, 0);
      end.rotation.y = Math.PI / 2; end.position.x = side * (w / 2 - .18); g.add(end);
    }
    const rw = Math.min(w * .34, 2.15), rx = w * .18, roomBase = h + ground + .25;
    solid(rw, .86, 1.45, rx, roomBase + .43, -.85);
    solid(rw + .17, .14, 1.6, rx, roomBase + .93, -.85, lavender ? "#C8A7DF" : cream);
    planter(g, 1.15, -w * .28, roomBase, -.7);
  } else {
    solid(w * .27, .55, 1.15, w * .15, h + ground + .47, -.9);
    solid(w * .27 + .15, .12, 1.3, w * .15, h + ground + .8, -.9, cream);
  }
  art.merge(g);
  return g;
}
