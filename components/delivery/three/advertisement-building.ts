import * as THREE from "three";
import type { OutdoorAdPlacement } from "@/data/delivery-outdoor-ads";
import { advertisementLayout } from "./scene-layout";
import { glbBuildingSize } from "./glb-buildings";
import { NEIGHBORHOOD_FINISH as finish, type BuildingKit } from "./building-facade";

/** The BUILDING behind an ad, never the creative/frame/transform itself.
 * Same five GLB buildings as the street, side by side to fill the ad's width,
 * in the original installation footprint (front face at z -.43, depth <= 6 m).
 */
export function createAdvertisementBuilding(ad: OutdoorAdPlacement, art: BuildingKit & Required<Pick<BuildingKit, "glbBuilding">>) {
  const { width: w, height: panelHeight, centerY } = advertisementLayout(ad);
  const g = new THREE.Group(); g.name = `advertisement-host:${ad.id}`;
  const width = w + 1.05, height = centerY - panelHeight / 2 - .55, first = Math.floor(ad.distance / 10) + (ad.side === "right" ? 2 : 0);
  g.userData.architecture = { kind: "advertisement-shop", height, width };
  art.shadow(g, width + 5, 11, 0, -1.7);
  const natural = glbBuildingSize(first % 5, height, 1).width, count = Math.max(1, Math.round(width / natural)), piece = width / count;
  for (let n = 0; n < count; n++) {
    const variant = (first + n) % 5, size = glbBuildingSize(variant, height, 1);
    const model = art.glbBuilding(variant, height, piece / size.width, (first + n) % 2 === 1, 6);
    model.position.set((n - (count - 1) / 2) * piece, 0, -.43 - Math.min(size.depth, 6) / 2);
    g.add(model);
  }
  for (const x of [-w * .32, w * .32]) {
    // Roof-mounted supports stay BEHIND the unchanged advertising surface.
    const top = centerY + panelHeight / 2;
    const post = art.box(.14, top - height, .16, finish.metal); art.put(g, post, x, (top + height) / 2, -.35);
  }
  return g;
}
