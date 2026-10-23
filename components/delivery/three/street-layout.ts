import * as THREE from "three";
import { DELIVERY_GAME_CONFIG, type SceneryItem } from "@/data/delivery-game";
import { OVERHEAD_ADS, type OutdoorAdPlacement as AdPlacement } from "@/data/delivery-outdoor-ads";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDeliveryHouseTransform, getRouteFrame, type DetourChoice } from "@/data/delivery-map";
import { houseDistance } from "../delivery-driveby";
import { glbBuildingSize } from "./glb-buildings";
import { BUILDING_SCALE, advertisementLayout, advertisementPanelCorners, advertisementTransform, resolveAdvertisements } from "./scene-layout";

// World architecture only. Never used by driving, collision or camera code.
export const STREET_BUILDINGS = {
  minHeight: 18, // the GLB buildings are scaled into this 18–26 m band (rider is ~1.7 m)
  maxHeight: 26,
  subShare: .08, // share of street lots that use the colourful sub models (BUILDING_MODELS 5–9)
  minStretch: .82, // frontage varies in code (x scale), the models themselves are untouched
  maxStretch: 1.18,
  gapRatio: .3,
  sidewalkOuterEdge: 10.1,
  frontageSetback: .55,
  chunkLength: 36,
  endDistance: 970,
} as const;

// Street=true is the reserved legacy LOT envelope. Architecture may be smaller,
// but keeping this planner stable preserves all existing roads and ad sightlines.
export type StreetLook = { tall: number; stretch: number; mirror: boolean; model: number };
export function buildingProfile(item: Pick<SceneryItem, "variant" | "type"> & Partial<StreetLook>, street = false) {
  if (street) {
    const tall = item.tall ?? STREET_BUILDINGS.minHeight, size = glbBuildingSize(item.model ?? item.variant, tall, item.stretch ?? 1);
    return { width: size.width, height: tall, depth: size.depth, floors: 3, halfWidth: size.width / 2 + .1, front: size.depth / 2 + .1, back: size.depth / 2 + .1, solidHeight: tall };
  }
  const v = item.variant % 5, shop = item.type === "shop";
  const width = shop ? 6.2 : 5.4 + v % 2 * .8;
  const height = shop ? 4.2 : 5.5 + v % 3 * 1.5;
  const depth = 4.8;
  const pitched = !shop && v % 2 === 0;
  const halfWidth = Math.max(width + (v % 2 && !shop ? .9 : .56), pitched ? width * .76 * Math.SQRT2 : 0) * BUILDING_SCALE.width / 2;
  return {
    width, height, depth,
    floors: shop ? 1 : Math.floor((height - 1) / 2),
    halfWidth,
    front: (depth / 2 + (shop ? 1.04 : .9)) * BUILDING_SCALE.depth,
    back: Math.max((depth + .5) / 2, pitched ? width * .76 / Math.SQRT2 : 0) * BUILDING_SCALE.depth,
    solidHeight: (height + (pitched ? 1.82 : .94)) * BUILDING_SCALE.height,
  };
}

export type StreetBuilding = SceneryItem & StreetLook & { route: DetourChoice; offset: number; footprint: THREE.Vector2[]; height: number };
const point2 = (p: THREE.Vector3) => new THREE.Vector2(p.x, p.z);
export function rectangle(position: THREE.Vector3, yaw: number, left: number, right: number, back: number, front: number) {
  const rotation = new THREE.Matrix4().makeRotationY(yaw);
  return [[left, back], [right, back], [right, front], [left, front]].map(([x, z]) => point2(new THREE.Vector3(x, 0, z).applyMatrix4(rotation).add(position)));
}
export function polygonsOverlap(a: THREE.Vector2[], b: THREE.Vector2[], padding = 0) {
  for (const polygon of [a, b]) for (let n = 0; n < polygon.length; n++) {
    const edge = polygon[(n + 1) % polygon.length].clone().sub(polygon[n]);
    const axis = new THREE.Vector2(-edge.y, edge.x).normalize();
    const pa = a.map(p => p.dot(axis)), pb = b.map(p => p.dot(axis));
    if (Math.max(...pa) + padding <= Math.min(...pb) || Math.max(...pb) + padding <= Math.min(...pa)) return false;
  }
  return true;
}
function pointSegmentDistance(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const ab = b.clone().sub(a);
  return p.distanceTo(a.clone().addScaledVector(ab, THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1)));
}
export function pointPolygonDistance(point: THREE.Vector2, polygon: THREE.Vector2[]) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    distance = Math.min(distance, pointSegmentDistance(point, a, b));
  }
  return inside ? 0 : distance;
}
export function polygonGap(a: THREE.Vector2[], b: THREE.Vector2[]) {
  if (polygonsOverlap(a, b)) return 0;
  return Math.min(...a.map(p => pointPolygonDistance(p, b)), ...b.map(p => pointPolygonDistance(p, a)));
}
export function adFootprint(ad: AdPlacement) {
  const { width } = advertisementLayout(ad), { position, yaw } = advertisementTransform(ad);
  const corner = ad.type === "corner-store" || ad.type === "rooftop";
  return rectangle(position, yaw, -(width + (corner ? 1.85 : 1.1)) / 2, (width + (corner ? 1.85 : 1.1)) / 2,
    corner ? -6.5 : -1.25, corner ? 1.2 : 1.05);
}

export function streetTransform(item: Pick<StreetBuilding, "distance" | "route" | "side" | "offset">) {
  const frame = getRouteFrame(item.distance, item.route), side = item.side === "left" ? -1 : 1;
  return { position: frame.position.clone().addScaledVector(frame.lateral, side * item.offset), yaw: frame.yaw - side * Math.PI / 2 };
}
/** `plain`: no fork roads (the challenge road), so every lot faces the main road. */
export function makeBuilding(distance: number, side: "left" | "right", index: number, extraOffset = 0, plain = false, subShare: number = STREET_BUILDINGS.subShare): StreetBuilding {
  const variant = (index + (side === "right" ? 2 : 0)) % 5;
  const type = index % 3 === 0 ? "shop" : "house";
  // Deterministic spread of height, frontage and mirroring so no two neighbours repeat.
  const rnd = (n: number) => { const x = Math.sin((index * 3 + n + (side === "right" ? 500 : 0)) * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const look: StreetLook = {
    tall: STREET_BUILDINGS.minHeight + (STREET_BUILDINGS.maxHeight - STREET_BUILDINGS.minHeight) * rnd(0),
    stretch: STREET_BUILDINGS.minStretch + (STREET_BUILDINGS.maxStretch - STREET_BUILDINGS.minStretch) * rnd(1),
    mirror: rnd(2) > .5,
    model: rnd(3) < subShare ? variant + 5 : variant,
  };
  const profile = buildingProfile({ variant, type, ...look }, true);
  const route = !plain && distance > ROAD_CLOSURE.junctionDistance - 18 && distance < ROAD_CLOSURE.mergeEnd + 18 ? side : "main";
  const offset = (route === "main" ? STREET_BUILDINGS.sidewalkOuterEdge : 4.65) + profile.front + STREET_BUILDINGS.frontageSetback + extraOffset;
  const item = { id: `street-${side}-${index}`, distance, side, variant, type, route, offset, ...look } as StreetBuilding;
  const transform = streetTransform(item);
  item.footprint = rectangle(transform.position, transform.yaw, -profile.halfWidth, profile.halfWidth, -profile.back, profile.front);
  item.height = profile.solidHeight;
  return item;
}

// Segment/prism intersection for actual ad sightlines, not a large empty
// exclusion zone. Set back a shop only where it would cover an ad's creative.
export function buildingBlocksRay(item: StreetBuilding, from: THREE.Vector3, to: THREE.Vector3) {
  const { position, yaw } = streetTransform(item), p = buildingProfile(item, true);
  const rotation = new THREE.Matrix4().makeRotationY(-yaw);
  const a = from.clone().sub(position).applyMatrix4(rotation), b = to.clone().sub(position).applyMatrix4(rotation);
  let near = 0, far = .995;
  for (const [axis, min, max] of [["x", -p.halfWidth, p.halfWidth], ["y", 0, item.height], ["z", -p.back, p.front]] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < .00001) { if (a[axis] < min || a[axis] > max) return false; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return false;
    }
  }
  return near <= far;
}

export function advertisementSightlines(ads: AdPlacement[]) {
  return ads.flatMap(ad => {
    const corners = advertisementPanelCorners(ad);
    return [65, 48, 32].flatMap(ahead => {
      const frame = getRouteFrame(Math.max(0, ad.distance - ahead), ad.route ?? "main");
      const camera = frame.position.clone().addScaledVector(frame.lateral, .8).addScaledVector(frame.tangent, -DELIVERY_GAME_CONFIG.cameraFollowDistance);
      const distance = Math.max(0, ad.distance - ahead);
      const forkView = Math.min(THREE.MathUtils.clamp((distance - (ROAD_CLOSURE.junctionDistance - 100)) / 55, 0, 1), 1 - THREE.MathUtils.clamp((distance - (ROAD_CLOSURE.junctionDistance + 55)) / 70, 0, 1));
      camera.y = DELIVERY_GAME_CONFIG.cameraHeight + forkView * 1.4;
      return [.15, .5, .85].flatMap(x => [.15, .5, .85].map(y => ({
        ad, from: camera, to: corners[0].clone().lerp(corners[2], x).lerp(corners[1].clone().lerp(corners[3], x), y),
      })));
    });
  });
}

export function buildStreetLayout(ads: AdPlacement[] = resolveAdvertisements()) {
  const buildings: StreetBuilding[] = [], adSolids = ads.map(ad => ({ ad, footprint: adFootprint(ad) }));
  const rays = advertisementSightlines(ads);
  // Feet of the overhead banner gantries stand beside the road too.
  const gantryFeet = OVERHEAD_ADS.flatMap(ad => {
    const frame = getRouteFrame(ad.distance, ad.route ?? "main");
    return [-1, 1].map(side => ({ distance: ad.distance, foot: rectangle(frame.position.clone().addScaledVector(frame.lateral, side * ad.supportSpan / 2), frame.yaw, -.325, .325, -.695, .055) }));
  });
  const houses = DELIVERY_STOPS.map((stop, index) => {
    const transform = getDeliveryHouseTransform(index), profile = buildingProfile({ variant: index, type: "house" });
    return { distance: houseDistance(index), house: rectangle(transform.position, transform.yaw, -profile.halfWidth, profile.halfWidth, -profile.back, profile.front) };
  });
  const roads = Array.from({ length: 2001 }, (_, i) => {
    const distance = i / 2, junction = distance >= 477 && distance <= 698;
    return { distance, lines: (junction ? ["main", "left", "right"] : ["main"]).map(route => ({
      point: point2(getRouteFrame(distance, route as DetourChoice).position), width: junction ? route === "main" ? 4.2 : 4.65 : STREET_BUILDINGS.sidewalkOuterEdge,
    })) };
  });
  for (const side of ["left", "right"] as const) {
    let index = 0, previous: StreetBuilding | undefined;
    for (let distance = 2; distance < STREET_BUILDINGS.endDistance; distance += .25) {
      // Keep the split, merge and the final entrance legible, not built over.
      if (distance > 474 && distance < 510 || distance > 672 && distance < 701) continue;
      const base = makeBuilding(distance, side, index);
      if (previous) {
        const tangent = point2(getRouteFrame(distance, base.route).tangent);
        const gap = Math.min(...base.footprint.map(p => p.dot(tangent))) - Math.max(...previous.footprint.map(p => p.dot(tangent)));
        const target = (buildingProfile(previous, true).halfWidth + buildingProfile(base, true).halfWidth) * STREET_BUILDINGS.gapRatio;
        if (gap < target) continue;
      }
      let accepted: StreetBuilding | undefined;
      for (const extra of [0, 1.5, 3, 5, 7, 9, 12]) {
        const item = extra === 0 ? base : makeBuilding(distance, side, index, extra);
        if (adSolids.some(a => Math.abs(a.ad.distance - distance) < 35 && polygonsOverlap(item.footprint, a.footprint, .6))) continue;
        if (gantryFeet.some(g => Math.abs(g.distance - distance) < 35 && polygonsOverlap(item.footprint, g.foot, .6))) continue;
        if (houses.some(h => Math.abs(h.distance - distance) < 30 && polygonsOverlap(item.footprint, h.house, 1))) continue;
        const nearbyRoads = roads.slice(Math.max(0, Math.floor((distance - 18) * 2)), Math.ceil((distance + 18) * 2));
        if (nearbyRoads.some(r => r.lines.some(l => pointPolygonDistance(l.point, item.footprint) < l.width + .15))) continue;
        if (buildings.some(b => Math.abs(b.distance - distance) < 35 && polygonsOverlap(item.footprint, b.footprint, .35))) continue;
        if (rays.some(ray => ray.ad.distance > distance - 15 && ray.ad.distance < distance + 90 && buildingBlocksRay(item, ray.from, ray.to))) continue;
        accepted = item; break;
      }
      if (accepted) { buildings.push(accepted); previous = accepted; index++; }
    }
  }
  return buildings;
}
