import * as THREE from "three";
import { OUTDOOR_AD_STYLE, OUTDOOR_AD_FORMATS, type OutdoorAdPlacement, type OverheadAdPlacement } from "@/data/delivery-outdoor-ads";
import { getRouteFrame } from "@/data/delivery-map";
import { advertisementLayout, advertisementTransform, isLandmark } from "./scene-layout";
import { TOWN_COLORS, type SceneArt } from "./scene-art";
import type { OutdoorAdResources } from "./outdoor-ad-material";

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
  if (isLandmark(ad)) {
    const facadeWidth = w + 1.05, roofY = ad.type === "rooftop" ? y - h / 2 - .55 : y + h / 2 + .65;
    art.shadow(group, facadeWidth + 5, 11, 0, -1.7);
    art.put(group, art.box(facadeWidth, roofY, 6, TOWN_COLORS.walls[0], .1), 0, roofY / 2, -3.25);
    art.put(group, art.box(facadeWidth + .22, .18, 6.2, cream, .03), 0, roofY - .24, -3.25);
    art.put(group, art.box(facadeWidth + .45, .3, 6.45, "#479e80", .06), 0, roofY + .05, -3.25);
    art.put(group, art.box(facadeWidth + .8, .2, 7.5, TOWN_COLORS.pavement, .05), 0, .12, -2.6);
    for (const x of [-w * .31, w * .31]) art.windowOn(group, x, 1.8, -.18, Math.min(3, w * .27), 2.6);
    art.windowOn(group, 0, 1.65, -.18, 1.25, 2.8);
    art.put(group, art.box(w + .4, .24, 1.5, "#479e80", .04), 0, 3.35, .28);
    art.put(group, art.box(w + .4, .23, .12, cream), 0, 3.15, .98);
    for (const x of [-facadeWidth / 2 + .16, facadeWidth / 2 - .16]) art.put(group, art.box(.28, roofY - .65, .24, cream), x, (roofY + .65) / 2, -.16);
    for (let rowY = 5.2; rowY < roofY - 1; rowY += 3) {
      // Front windows never appear behind/through the mounted creative.
      if (rowY + 1.05 < y - h / 2 || rowY - 1.05 > y + h / 2) {
        for (const x of [-w * .31, 0, w * .31]) art.windowOn(group, x, rowY, -.18, .95, 1.65);
        art.put(group, art.box(facadeWidth + .15, .14, .25, cream), 0, rowY + 1.2, -.1);
      }
    }
    for (const side of [-1, 1]) {
      const face = new THREE.Group();
      for (let rowY = 1.85; rowY < roofY - 1; rowY += 3) for (const x of [-1.6, 1.2]) art.windowOn(face, x, rowY, 0, 1.1, 1.65);
      face.rotation.y = side * Math.PI / 2; face.position.set(side * (facadeWidth / 2 + .02), 0, -3.25); group.add(face);
    }
    if (ad.type === "rooftop") for (const x of [-w * .33, w * .33]) art.put(group, art.box(.16, h + .65, .2, TOWN_COLORS.metal), x, y - .2, -.3);
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
  const frame = getRouteFrame(ad.distance);
  group.position.copy(frame.position); group.rotation.y = frame.yaw;
  return group;
}
