import * as THREE from "three";
import type { OutdoorAdPlacement } from "@/data/delivery-outdoor-ads";
import { advertisementLayout } from "./scene-layout";
import { facadeDetails, NEIGHBORHOOD_FINISH as finish, type BuildingKit } from "./building-facade";

/** The BUILDING behind an ad, never the creative/frame/transform itself.
 * Kept in the original installation footprint. No new signs or logos.
 */
export function createAdvertisementBuilding(ad: OutdoorAdPlacement, art: BuildingKit) {
  const { width: w, height: panelHeight, centerY } = advertisementLayout(ad);
  const g = new THREE.Group(); g.name = `advertisement-host:${ad.id}`;
  const { piece, pane, rail, balcony, planter, awning } = facadeDetails(art);
  const variant = (Math.floor(ad.distance / 10) + (ad.side === "right" ? 2 : 0)) % finish.walls.length;
  const wall = finish.walls[variant], accent = finish.accents[variant], width = w + 1.05;
  const height = centerY - panelHeight / 2 - .55;
  const floors = Math.max(2, Math.round(height / 3.05)), pitch = height / floors;
  g.userData.architecture = { kind: "advertisement-shop", floors, height, width };
  art.shadow(g, width + 5, 11, 0, -1.7);
  piece(g, width + .8, .2, 7.5, "#ecdfc9", 0, .12, -2.6);
  // Broad commercial base and a recessed upper facade instead of the old tower.
  piece(g, width, pitch, 5.6, wall, 0, pitch / 2, -3.25);
  piece(g, width - .5, height - pitch, 5.25, wall, .25, (height + pitch) / 2, -3.425);
  piece(g, width + .15, .21, 5.85, finish.cream, 0, pitch + .03, -3.25);
  piece(g, width - .24, .22, 5.6, finish.cream, .25, height + .05, -3.425);
  for (let floor = 0; floor < floors; floor++) {
    const base = floor * pitch, y = base + pitch * .5, front = floor === 0 ? -.43 : -.78;
    const columns = w > 10 ? 3 : 2, bay = (width - 1.1) / columns;
    for (let n = 0; n < columns; n++) {
      const x = (n - (columns - 1) / 2) * bay + (floor > 0 ? .25 : 0);
      pane(g, x, y, front, bay * .86, Math.min(2.3, pitch * .7), floor === 0 ? 3 : 2);
      if (floor === 0) awning(g, bay * .94, x, pitch - .25, -.43, accent);
      else if (floor === 1) rail(g, bay * .84, x, base + .3, front + .2);
    }
  }
  for (const side of [-1, 1]) {
    const face = new THREE.Group();
    for (let floor = 0; floor < floors; floor++) {
      const base = floor * pitch, inset = floor > 0 && side < 0 ? -.5 : 0;
      pane(face, 0, base + pitch * .5, inset, 4.25, Math.min(2.2, pitch * .7), 3);
      if (floor === 0) awning(face, 4.6, 0, pitch - .25, 0, accent, .25);
      if (floor === 1) balcony(face, 4.3, 0, base + .1, inset, .3);
    }
    face.rotation.y = side * Math.PI / 2; face.position.set(side * width / 2, 0, -3.25); g.add(face);
  }
  for (const x of [-w * .32, w * .32]) {
    // Roof-mounted supports stay BEHIND the unchanged advertising surface.
    const top = centerY + panelHeight / 2;
    piece(g, .14, top - height, .16, finish.metal, x, (top + height) / 2, -.35);
    planter(g, Math.min(1.6,w * .18), x, height + .16, -4.3);
  }
  piece(g, Math.min(2.1,width * .25), .8, 1.4, wall, width * .22, height + .56, -4.5);
  piece(g, Math.min(2.3,width * .25 + .2), .13, 1.6, finish.cream, width * .22, height + 1.02, -4.5);
  return g;
}
