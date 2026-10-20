import * as THREE from "three";
import type { SceneryItem } from "@/data/delivery-game";
import { buildingProfile } from "./street-layout";
import { facadeDetails, NEIGHBORHOOD_FINISH as finish, type BuildingKit } from "./building-facade";
import { createReliefBuilding } from "./relief-building";
import { BUILDING_SCALE } from "./scene-layout";
import { RELIEF_BUILDINGS } from "@/data/delivery-relief-buildings";

// Which Meshy-model building each A–E lot type shows. Lots, entrances and ad
// sightlines stay exactly as planned; the model is fitted inside that envelope.
const DESIGN_PHOTOS = ["cafe-corner", "blue-laundry", "cafe-corner", "blue-laundry", "cafe-corner"] as const;
const photoId = (item: SceneryItem) => DESIGN_PHOTOS[streetArchitecture(item).design];

export type StreetBuildingKind = "apricot-shop" | "mint-villa" | "cream-tower" | "lavender-house" | "yellow-shop";
const KINDS: StreetBuildingKind[] = ["apricot-shop", "mint-villa", "cream-tower", "lavender-house", "yellow-shop"];

// Keep the existing lots, entrances and ad sightlines. Storeys are constructed
// individually: windows and doors never stretch with the building height.
export function streetArchitecture(item: Pick<SceneryItem, "type" | "variant">) {
  const lot = buildingProfile(item, true), v = item.variant % 5;
  const design = item.type === "shop" ? v % 2 ? 4 : 0 : v;
  const floors = [3, 6, 7, 5, 3][design], pitch = [3.05, 2.85, 3.05, 2.86, 3.12][design];
  const width = lot.width * [1, .8, .7, .9, 1.01][design];
  return { kind: KINDS[design], design, floors, pitch, width, height: floors * pitch, depth: lot.depth, variant: v };
}

/** A–E physical models. +Z faces the street; both end elevations are modeled
 * because these are also visible from the fixed riding camera.
 */
export function createStreetArchitecture(item: SceneryItem, art: BuildingKit) {
  const photo = art.photoMaterial && RELIEF_BUILDINGS[photoId(item)];
  if (photo && art.photoMaterial) return createPhotoStreetBuilding(item, art, photo);
  return createProceduralStreetArchitecture(item, art);
}

function createPhotoStreetBuilding(item: SceneryItem, art: BuildingKit, photo: typeof RELIEF_BUILDINGS[string]) {
  const spec = streetArchitecture(item), lot = buildingProfile(item, true);
  // Envelope in model units (the caller applies BUILDING_SCALE afterwards).
  const fit = {
    width: 2 * lot.halfWidth / BUILDING_SCALE.width - .06, height: lot.solidHeight / BUILDING_SCALE.height - .05,
    front: lot.front / BUILDING_SCALE.depth - .03, back: lot.back / BUILDING_SCALE.depth - .03,
  };
  const g = createReliefBuilding(photo, art.photoMaterial!(photo), fit);
  g.name = `street-architecture:${spec.kind}`; g.userData.architecture = { ...spec, photo: photo.id };
  art.shadow(g, fit.width + 2.4, fit.front + fit.back + 2.4, .9, (fit.front - fit.back) / 2 - .9);
  art.merge(g);
  return g;
}

/** The previous vertex-colour models, kept as the fallback when no atlas material is available. */
export function createProceduralStreetArchitecture(item: SceneryItem, art: BuildingKit) {
  const spec = streetArchitecture(item), { kind, width: w, depth: d, height: h, floors, pitch, design } = spec;
  const g = new THREE.Group(); g.name = `street-architecture:${kind}`; g.userData.architecture = spec;
  const { piece, pane, rail, balcony, planter, awning, aircon, shrub, flowerBox } = facadeDetails(art);
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
    g.userData.balconyRecess = { x: nicheX, front, back: front - balconyDepth, width: nicheWidth, floors: Array.from({ length: floors - 1 }, (_, n) => n + 1) };
  } else {
    solid(w, h, d, 0, ground + h / 2, 0);
  }
  solid(w + .06, .22, d + .06, 0, .31, 0, finish.stone);

  // One distinct storefront composition per building, with real framing and
  // handles. Warm opaque panes suggest interiors without transparent sorting.
  const storefront = (doorX: number, doorW: number, windowX: number, windowW: number) => {
    const y = ground + 1.3, height = 2.3;
    pane(g, doorX, y, front + .015, doorW, height, 1, false, { glass: finish.shopGlass });
    pane(g, windowX, y, front + .015, windowW, height, design === 0 || design === 4 ? 3 : 2, false, { glass: finish.shopGlass });
    piece(g, .055, .4, .08, cream, doorX + doorW * .32, y - .15, front + .21);
    for (const x of [doorX, windowX - windowW * .22, windowX + windowW * .22]) {
      piece(g, .025, .27, .025, finish.metal, x, 2.41, front + .09);
      piece(g, .14, .18, .035, "#FFE3A0", x, 2.2, front + .1);
    }
  };
  storefront(-w * .32, w * .19, w * .13, w * .59);
  // Potted plants flanking the shopfront, like the reference street.
  shrub(g, -w / 2 + .45, ground, front + .45, .75, design);
  shrub(g, w / 2 - .45, ground, front + .45, .65, design + 2);
  if (!mint && !lavender) awning(g, w * .94, 0, pitch - .15, front, finish.accents[design], .82);

  for (let floor = 1; floor < floors; floor++) {
    const base = ground + floor * pitch, wy = base + pitch * .51;
    // Alternate curtain side and colour per floor so stacked storeys don't repeat.
    const homey = { curtain: (floor + design) % 2 ? 1 : -1, curtainColor: finish.curtains[(floor + design) % 3] } as const;
    // B's cream band wraps the entire floor, including balcony slab/ceiling.
    if (!tower) band(base, lavender ? "#DCC5EE" : cream);
    else {
      solid(w * .37, .12, d + .1, w * .315, base, 0, cream);
    }
    if (mint) {
      pane(g, -w * .2, wy, front + .015, w * .4, 1.62, 2, false, homey);
      piece(g, nicheWidth, pitch - .24, .035, "#8BAF95", nicheX, base + pitch / 2, front - balconyDepth + .025);
      // Matte inner reveals make the recess readable without shadow maps.
      for (const side of [-1,1]) piece(g, .025, pitch - .24, balconyDepth, "#97BB9F", nicheX + side * (nicheWidth / 2 - .013), base + pitch / 2, front - balconyDepth / 2);
      piece(g, nicheWidth, .025, balconyDepth, "#8BAF95", nicheX, base + pitch - .13, front - balconyDepth / 2);
      pane(g, nicheX, base + 1.26, front - balconyDepth + .06, nicheWidth * .65, 1.92, 2, false, homey);
      rail(g, nicheWidth - .12, nicheX, base + .12, front - .12);
      piece(g, nicheWidth, .09, balconyDepth - .06, cream, nicheX, base + .15, front - balconyDepth / 2);
      if (floor % 2) shrub(g, nicheX + nicheWidth * .3, base + .2, front - .45, .7, floor);
      else planter(g, .48, nicheX + nicheWidth * .26, base + .2, front - .43);
      piece(g, .17, .025, .17, "#FFE3A0", nicheX, base + pitch - .14, front - .5);
    } else if (tower) {
      pane(g, w * .29, wy, front + .015, w * .19, 1.65, 1, false, homey);
      rail(g, w * .23, w * .29, wy - .8, front + .23);
    } else if (lavender) {
      pane(g, 0, wy, front + .015, w * .7, 1.58, 3, false, homey);
      if (floor % 2 === 1) {
        balcony(g, w * .76, 0, base + .14, front + .02, .58);
        planter(g, .65, w * .24, base + .32, front + .3);
      } else aircon(g, -w * .36, base + .3, front + .02);
    } else if (design === 0) {
      pane(g, 0, wy, front + .015, w * .76, 1.63, 4, false, homey);
      flowerBox(g, w * .5, -w * .1, wy - .93, front + .02);
    } else {
      for (const x of [-w * .29, 0, w * .29]) pane(g, x, wy, front + .015, w * .15, 1.55, 1, false, { ...homey, curtain: x < 0 ? -1 : 1 });
      flowerBox(g, w * .17, w * .29 * (floor % 2 ? 1 : -1), wy - .9, front + .02);
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
    shrub(g, -w * .28, roomBase, .35, 1.4, design);
    shrub(g, w * .36, roomBase, .55, 1.1, design + 1);
  } else {
    solid(w * .27, .55, 1.15, w * .15, h + ground + .47, -.9);
    solid(w * .27 + .15, .12, 1.3, w * .15, h + ground + .8, -.9, cream);
    rail(g, w - .35, 0, h + ground + .25, d / 2 - .2);
    shrub(g, -w * .3, h + ground + .25, .3, 1.3, design);
  }
  art.merge(g);
  shadeFacade(g, h + ground);
  return g;
}

// Baked soft light in the vertex colours: shaded soffits, darker footing and a
// gentle top-lit gradient. No shadow maps or extra lights at runtime.
function shadeFacade(group: THREE.Group, height: number) {
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const color = child.geometry.getAttribute("color"), position = child.geometry.getAttribute("position"), normal = child.geometry.getAttribute("normal");
    if (!color || !normal) continue;
    for (let i = 0; i < color.count; i++) {
      const y = position.getY(i), ny = normal.getY(i), nx = Math.abs(normal.getX(i));
      let shade = (.74 + .26 * THREE.MathUtils.smoothstep(y, 0, 1.6)) * (.92 + .08 * Math.min(1, y / height));
      if (ny < -.5) shade *= .6;
      else if (ny > .5) shade *= 1.04;
      if (nx > .5) shade *= .9;
      color.setXYZ(i, color.getX(i) * shade, color.getY(i) * shade, color.getZ(i) * shade);
    }
    color.needsUpdate = true;
  }
}
