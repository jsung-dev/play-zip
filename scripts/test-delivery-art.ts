import assert from "node:assert/strict";
import * as THREE from "three";
import { writeFileSync } from "node:fs";
import { DELIVERY_GAME_CONFIG as config } from "../data/delivery-game";
import { OUTDOOR_ADS, BUS_AD_PANELS, OUTDOOR_AD_FORMATS } from "../data/delivery-outdoor-ads";
import { getRouteFrame, ROAD_CLOSURE } from "../data/delivery-map";
import { advertisementLayout, advertisementPanelCorners, portraitCameraFov, resolveAdvertisements, isLandmark } from "../components/delivery/three/scene-layout";
import { adFootprint, pointPolygonDistance, polygonsOverlap } from "../components/delivery/three/street-layout";

const ads = resolveAdvertisements(), all = [...ads, ...BUS_AD_PANELS];
assert.equal(new Set(all.map(a => a.id)).size, all.length, "Unique outdoor/bus IDs");
assert.deepEqual(new Set(ads.map(a => a.format)), new Set(Object.keys(OUTDOOR_AD_FORMATS)));
assert(all.every(a => !a.image), "All current outdoor surfaces vacant; independent of delivery brand");
assert.equal(ads.length, OUTDOOR_ADS.length);

function cameraAt(distance: number, branch: "main" | "left" | "right", width: number, height: number) {
  const route = getRouteFrame(distance, branch);
  const forkView = Math.min(THREE.MathUtils.clamp((distance - (ROAD_CLOSURE.junctionDistance - 100)) / 55, 0, 1), 1 - THREE.MathUtils.clamp((distance - (ROAD_CLOSURE.junctionDistance + 55)) / 70, 0, 1));
  const camera = new THREE.PerspectiveCamera(portraitCameraFov(width / height), width / height, .1, 270);
  camera.position.copy(route.position).addScaledVector(route.lateral, .8).addScaledVector(route.tangent, -config.cameraFollowDistance);
  camera.position.y = config.cameraHeight + forkView * 1.4;
  const look = route.position.clone().addScaledVector(route.tangent, 16 - forkView * 2); look.y = 1.15;
  camera.lookAt(look); camera.updateMatrixWorld(); return camera;
}
const results = [], failures: string[] = [];
for (const ad of ads) {
  const layout = advertisementLayout(ad), footprint = adFootprint(ad);
  assert(Math.abs(layout.width / layout.height - OUTDOOR_AD_FORMATS[ad.format].ratio) < 1e-10, ad.id + ": exact ratio");
  assert(layout.centerY - layout.height / 2 > .5, ad.id + ": intersects pavement");
  for (let distance = ad.distance - 22; distance < ad.distance + 22; distance += .5) {
    const p = getRouteFrame(distance, ad.route).position;
    const minimum = isLandmark(ad) ? 10.1 : ad.route === "main" ? 7.8 : 4.65;
    assert(pointPolygonDistance(new THREE.Vector2(p.x, p.z), footprint) >= minimum, ad.id + ": road/sidewalk at " + distance);
  }
  for (const other of ads.filter(a => a.id !== ad.id)) assert(!polygonsOverlap(footprint, adFootprint(other)), ad.id + "/" + other.id + ": overlap");
}
for (const [width, height] of [[360, 769], [390, 769], [430, 769], [360, 565]]) for (const ad of ads) {
  let fullSamples = 0, maxWidth = 0;
  for (let ahead = 75; ahead >= 18; ahead--) {
    const camera = cameraAt(Math.max(0, ad.distance - ahead), ad.route, width, height);
    const points = advertisementPanelCorners(ad).map(p => p.project(camera));
    if (points.every(p => Math.abs(p.x) < .96 && Math.abs(p.y) < .94 && p.z > -1 && p.z < 1)) {
      fullSamples++;
      maxWidth = Math.max(maxWidth, (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * width / 2);
    }
  }
  if (fullSamples < 10 || maxWidth < (ad.format === "landscape" || ad.format === "banner" ? 80 : 45)) failures.push(ad.id + " at " + width + "x" + height + ": " + fullSamples + " full samples, " + Math.round(maxWidth) + "px");
  results.push({ viewport: width + "x" + height, id: ad.id, format: ad.format, fullSamples, maxWidth: Math.round(maxWidth) });
}
const counts = [];
for (let distance = 0; distance < 950; distance += 5) {
  if (distance > 470 && distance < 700) continue;
  const camera = cameraAt(distance, "main", 390, 769);
  counts.push(ads.filter(ad => {
    if (ad.route !== "main" || ad.distance < distance || ad.distance - distance > 140) return false;
    const p = advertisementPanelCorners(ad).map(v => v.project(camera));
    return p.every(v => Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > -1 && v.z < 1)
      && (Math.max(...p.map(v => v.x)) - Math.min(...p.map(v => v.x))) * 195 >= 42;
  }).length);
}
assert(Math.max(...counts) <= 3 && counts.filter(n => n <= 2).length / counts.length > .9, "Too many readable faces at once");
console.table(results);
assert.equal(failures.length, 0, failures.join("\n"));
writeFileSync("test-artifacts/outdoor-ads/layout.json", JSON.stringify({ results, maxReadable: Math.max(...counts), upToTwoRatio: counts.filter(n => n <= 2).length / counts.length }, null, 2));
console.log("Verified " + ads.length + " installations, four exact formats, mobile approaches, clearance, sparse visibility.");
