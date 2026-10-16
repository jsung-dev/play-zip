import { DELIVERY_GAME_CONFIG, type SceneryItem } from "@/data/delivery-game";
import { OUTDOOR_ADS, OUTDOOR_AD_FORMATS, type OutdoorAdPlacement as AdPlacement } from "@/data/delivery-outdoor-ads";
import * as THREE from "three";
import { DELIVERY_STOPS, DRIVEWAY_ROUTE, ROAD_CLOSURE, getRouteFrame } from "@/data/delivery-map";

// Small architectural lift, without changing road/driveway collision geometry.
export const BUILDING_SCALE = { width: 1.24, height: 1.27, depth: 1.18 } as const;
export const MIN_PORTRAIT_HORIZONTAL_FOV = 43;

export function isLandmark(placement: AdPlacement) {
  return placement.type === "rooftop" || placement.type === "corner-store";
}

export function resolveAdvertisements(placements: AdPlacement[] = OUTDOOR_ADS): AdPlacement[] {
  return placements.map((placement) => DELIVERY_STOPS.some((stop) => (
    stop.side === placement.side && placement.distance > stop.distance - 12 && placement.distance < stop.distance + DRIVEWAY_ROUTE.exitAdvance + 12
  )) ? { ...placement, side: placement.side === "left" ? "right" : "left" } : placement);
}

export function advertisementLayout(placement: AdPlacement) {
  return { width: placement.width, height: placement.width / OUTDOOR_AD_FORMATS[placement.format].ratio,
    centerY: placement.height, lateralOffset: placement.lateralOffset };
}

// Fixed world orientation, aimed at the approach rather than following the
// camera. Returning/reversing never rotates or relocates a shop.
export function advertisementTransform(placement: AdPlacement) {
  const layout = advertisementLayout(placement);
  const side = placement.side === "left" ? -1 : 1;
  const frame = getRouteFrame(placement.distance, placement.route ?? "main");
  const position = frame.position.clone().addScaledVector(frame.lateral, side * layout.lateralOffset);
  position.y = .08;
  let yaw = frame.yaw;
  if (placement.rotation.approach > 0) {
    const approach = getRouteFrame(placement.distance - placement.rotation.approach, placement.route ?? "main").position;
    const facing = approach.clone().sub(position);
    yaw = Math.atan2(facing.x, facing.z);
  }
  return { position, yaw: yaw + THREE.MathUtils.degToRad(placement.rotation.yawDegrees) };
}

export function advertisementPanelCorners(placement: AdPlacement) {
  const { width, height, centerY } = advertisementLayout(placement);
  const { position, yaw } = advertisementTransform(placement);
  const rotation = new THREE.Matrix4().makeRotationY(yaw);
  return [-1, 1].flatMap(x => [-1, 1].map(y => new THREE.Vector3(x * width / 2, centerY + y * height / 2, .15).applyMatrix4(rotation).add(position)));
}

export function sceneryHasClearance(item: SceneryItem, ads: AdPlacement[]) {
  if (DELIVERY_STOPS.some((stop) => stop.side === item.side && item.distance > stop.distance - 16 && item.distance < stop.distance + DRIVEWAY_ROUTE.exitAdvance + 12)) return false;
  if (item.distance > ROAD_CLOSURE.junctionDistance - 18 && item.distance < ROAD_CLOSURE.mergeEnd + 18) return false;
  // Reserve the approach as well as the sign's footprint. Use the FINAL side
  // after driveway relocation, so a tree or enlarged facade cannot hide it.
  const clearance = item.type === "house" || item.type === "shop" ? 21 : item.type === "tree" ? 16 : 11;
  return !ads.some((ad) => {
    if ((ad.route ?? "main") !== "main" || ad.side !== item.side) return false;
    const before = isLandmark(ad) ? 37 : clearance;
    const after = isLandmark(ad) ? 25 : clearance * .7;
    return item.distance > ad.distance - before && item.distance < ad.distance + after;
  });
}

export function portraitCameraFov(aspect: number) {
  const horizontal = MIN_PORTRAIT_HORIZONTAL_FOV * Math.PI / 180;
  return Math.max(DELIVERY_GAME_CONFIG.cameraFovDegrees, 2 * Math.atan(Math.tan(horizontal / 2) / Math.max(.5, aspect)) * 180 / Math.PI);
}
