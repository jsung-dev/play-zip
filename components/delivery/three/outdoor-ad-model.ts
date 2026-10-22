import * as THREE from "three";
import { OUTDOOR_AD_STYLE, OUTDOOR_AD_FORMATS, type OutdoorAdPlacement, type OverheadAdPlacement } from "@/data/delivery-outdoor-ads";
import { getRouteFrame } from "@/data/delivery-map";
import { advertisementLayout, advertisementTransform, isLandmark } from "./scene-layout";
import { TOWN_COLORS, type SceneArt } from "./scene-art";
import type { OutdoorAdResources } from "./outdoor-ad-material";
import { createAdvertisementBuilding } from "./advertisement-building";

// One frame/creative model for every ratio. Host architecture is independent of
// image content: replacing an image cannot recolour buildings or delivery boxes.
export function createOutdoorAdvertisement(ad: OutdoorAdPlacement, art: SceneArt, resources: OutdoorAdResources) {
  const group = new THREE.Group();
  group.name = `outdoor-installation:${ad.id}`;
  group.userData = { routeDistance: ad.distance, outdoorAdId: ad.id, format: ad.format };
  const { width: w, height: h, centerY: y } = advertisementLayout(ad);
  const cream = "#fff7e6", green = OUTDOOR_AD_STYLE.frame;
  art.put(group, art.box(w + .4, h + .4, .28, green, .04), 0, y, -.06);
  art.put(group, art.box(w + .13, h + .13, .055, cream), 0, y, .105);
  for (const x of (w > 10 ? [-w * .32, 0, w * .32] : [0])) {
    art.rod(group, [x, y + h / 2 + .2, -.15], [x, y + h / 2 + .48, .35], .035, TOWN_COLORS.metal);
    const light = art.box(.4, .16, .34, TOWN_COLORS.metal, .04); light.rotation.x = -.2;
    art.put(group, light, x, y + h / 2 + .43, .4);
    art.put(group, art.box(.29, .025, .24, "#fff2c9"), x, y + h / 2 + .34, .4);
  }
  // Square landmark ads only fit two small host buildings; they stand on posts instead.
  if (isLandmark(ad) && ad.format !== "square") {
    group.add(createAdvertisementBuilding(ad, art));
  } else {
    const postX = ad.type === "projecting" ? [w / 2 + .23] : [-w * .34, w * .34];
    for (const x of postX) {
      art.put(group, art.box(.16, y + h / 2 + .3, .2, TOWN_COLORS.metal), x, (y + h / 2 + .3) / 2, -.3);
      art.put(group, art.box(.55, .18, .65, TOWN_COLORS.pavement), x, .15, -.3);
    }
    if (ad.type === "projecting") art.put(group, art.box(w + .35, .12, .16, TOWN_COLORS.metal), .12, y + h / 2 + .23, -.3);
    if (ad.type === "bus-stop") {
      art.put(group, art.box(w + .8, .22, 1.9, TOWN_COLORS.metal, .05), 0, y + h / 2 + .65, -.25);
      art.put(group, art.box(w * .7, .16, .48, "#b89a78", .025), 0, .67, .4);
    }
  }
  art.merge(group);
  // Keep the unit plane shared, separate from merged architectural geometry.
  art.put(group, resources.panel(ad, w), 0, y, .15);
  const transform = advertisementTransform(ad);
  group.position.copy(transform.position); group.rotation.y = transform.yaw;
  return group;
}

/** Open gantry, not a wall: supports stay outside road and bus-only shoulders. */
export function createOverheadAdvertisement(ad: OverheadAdPlacement, art: SceneArt, resources: OutdoorAdResources) {
  const group = new THREE.Group(), h = ad.width / OUTDOOR_AD_FORMATS[ad.format].ratio;
  group.name = `outdoor-installation:${ad.id}`;
  group.userData = { routeDistance: ad.distance, outdoorAdId: ad.id, format: ad.format,
    clearance: ad.height - h / 2 - .22, supportSpan: ad.supportSpan };
  const beamY = ad.height + h / 2 + .1;
  for (const side of [-1, 1]) {
    const x = side * ad.supportSpan / 2;
    art.put(group, art.box(.3, beamY, .3, TOWN_COLORS.metal), x, beamY / 2, -.32);
    art.put(group, art.box(.65, .25, .75, TOWN_COLORS.pavement), x, .125, -.32);
  }
  art.put(group, art.box(ad.supportSpan + .3, .22, .3, TOWN_COLORS.metal), 0, beamY, -.32);
  art.put(group, art.box(ad.width + .4, h + .4, .28, OUTDOOR_AD_STYLE.frame), 0, ad.height, -.06);
  art.put(group, art.box(ad.width + .13, h + .13, .055, "#fff7e6"), 0, ad.height, .105);
  art.merge(group);
  art.put(group, resources.panel(ad, ad.width), 0, ad.height, .15);
  const frame = getRouteFrame(ad.distance, ad.route ?? "main");
  group.position.copy(frame.position); group.rotation.y = frame.yaw;
  return group;
}
