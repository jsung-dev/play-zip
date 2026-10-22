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
  // Uniform scale only (no stretch/squash): each model is as tall as fits under the panel
  // and within the 6 m footprint depth; whole models fill the width, leftover becomes gaps.
  const pieces: { variant: number; height: number; width: number; depth: number }[] = [];
  for (let n = 0, used = 0; n < 5; n++) {
    const variant = (first + n) % 5, fit = Math.min(height, height * 6 / glbBuildingSize(variant, height, 1).depth);
    let size = glbBuildingSize(variant, fit, 1), h = fit;
    if (!pieces.length && size.width > width) { h = fit * width / size.width; size = glbBuildingSize(variant, h, 1); }
    if (used + size.width > width) break;
    pieces.push({ variant, height: h, width: size.width, depth: size.depth }); used += size.width;
  }
  const gap = (width - pieces.reduce((sum, p) => sum + p.width, 0)) / (pieces.length + 1);
  let x = -width / 2 + gap;
  pieces.forEach((p, n) => {
    const model = art.glbBuilding(p.variant, p.height, 1, (first + n) % 2 === 1);
    model.position.set(x + p.width / 2, 0, -.43 - p.depth / 2);
    g.add(model); x += p.width + gap;
  });
  for (const x of [-w * .32, w * .32]) {
    // Roof-mounted supports stay BEHIND the unchanged advertising surface.
    const top = centerY + panelHeight / 2;
    const post = art.box(.14, top - height, .16, finish.metal); art.put(g, post, x, (top + height) / 2, -.35);
  }
  return g;
}
