import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  BUS_PLACEMENTS,
  DELIVERY_BRANDS,
  DELIVERY_GAME_CONFIG,
  OBSTACLE_PLACEMENTS,
  SCENERY_ITEMS,
  type BusPlacement,
  type DeliveryBrand,
  type ObstaclePlacement,
} from "@/data/delivery-game";
import { DELIVERY_HOUSE, DELIVERY_STOPS, ROAD_CLOSURE, getRouteFrame, getDeliveryHouseTransform, type DetourChoice } from "@/data/delivery-map";
import { createSceneArt, TOWN_COLORS, type SceneArt } from "./scene-art";
import { DUCK, createDuckResident, type DuckResident } from "./duck-resident";
import { applyRoadSurfaceUV, createRoadSurfaceMaterial, createRestrictedSurfaceMaterial, ROAD_SURFACE } from "./road-surface";
import { resolveAdvertisements, sceneryHasClearance } from "./scene-layout";
import { BUS_AD_PANELS, OVERHEAD_ADS } from "@/data/delivery-outdoor-ads";
import { createOutdoorAdResources, type OutdoorAdResources } from "./outdoor-ad-material";
import { createOutdoorAdvertisement, createOverheadAdvertisement } from "./outdoor-ad-model";
import { buildStreetLayout, STREET_BUILDINGS, streetTransform, advertisementSightlines } from "./street-layout";
import { obstacleCenterX, obstacleSpan } from "../delivery-jump";
import { DROP, MOVER_PLACEMENTS, type MoverPlacement, type MoverPose } from "../delivery-movers";
import { BOOSTERS, GAPS, RAMPS, type Gap, type Ramp } from "../delivery-pickups";

export type BikeRig = {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  pedal: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  spine: THREE.Object3D;
  groundShadow: THREE.Object3D;
};

export type MovingBusRig = {
  placement: BusPlacement;
  group: THREE.Group;
};

export type ObstacleRig = {
  id: string;
  distance: number;
  x: number;
  halfWidth: number;
  group: THREE.Group;
};

export type MoverRig = { placement: MoverPlacement; group: THREE.Group; animate: (t: number, moving: boolean, seconds: number, pose: MoverPose) => void };

export type BoosterField = { update: (position: number, collected: Set<number> | undefined, seconds: number) => void };

export type DeliveryWorld = {
  root: THREE.Group;
  movers: MoverRig[];
  boosters: BoosterField;
  bicycle: BikeRig;
  worldObjects: THREE.Object3D[];
  movingBuses: MovingBusRig[];
  obstacles: ObstacleRig[];
  deliveryStops: DeliveryStopRig[];
  destination: THREE.Group;
  horizon: THREE.Group;
  road: THREE.Material;
  art: SceneArt;
  outdoorResources: OutdoorAdResources;
};

const ZONE = { width: 7.8, length: 14, y: .06, color: "#2fc26e" } as const;

/** Flat green pad on the road at a delivery stop: solid green, white border, "배달" read from the saddle. */
function createDeliveryZone() {
  const canvas = document.createElement("canvas"), w = 256, h = Math.round(w * ZONE.length / ZONE.width);
  canvas.width = w; canvas.height = h;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, w, h);
    context.fillStyle = ZONE.color; context.fillRect(14, 14, w - 28, h - 28);
    context.fillStyle = "#ffffff"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = `900 ${Math.round(w * .34)}px "Malgun Gothic", sans-serif`;
    context.fillText("배달", w / 2, h / 2);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.width, ZONE.length), material);
  mesh.rotation.x = -Math.PI / 2; // lies flat, text top points down the road
  return mesh;
}

const DUCK_SHIRTS = ["#ff7a8a", "#4fb7e8", "#7bd389"];

export type DeliveryStopRig = {
  distance: number;
  side: number;
  house: THREE.Group;
  parcel: THREE.Group;
  duck: DuckResident;
  /** Road frame beside the house; duck points are (u across, v along) in it. */
  base: { position: THREE.Vector3; lateral: THREE.Vector3; tangent: THREE.Vector3 };
  rest: { u: number; v: number };
  door: { u: number; v: number };
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function makeTextTexture({
  title,
  subtitle,
  background,
  foreground,
  width = 512,
  height = 256,
}: {
  title: string;
  subtitle?: string;
  background: string;
  foreground: string;
  width?: number;
  height?: number;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.fillStyle = background;
  roundedRect(context, 4, 4, width - 8, height - 8, 22);
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = foreground;
  context.stroke();
  context.fillStyle = foreground;
  context.textAlign = "center";
  context.textBaseline = "middle";
  let titleSize = Math.round(height * 0.32);
  context.font = `800 ${titleSize}px "Malgun Gothic", sans-serif`;
  while (context.measureText(title).width > width - 42 && titleSize > 16) {
    titleSize -= 2;
    context.font = `800 ${titleSize}px "Malgun Gothic", sans-serif`;
  }
  context.fillText(title, width / 2, subtitle ? height * 0.42 : height / 2);
  if (subtitle) {
    context.font = `600 ${Math.round(height * 0.145)}px "Malgun Gothic", sans-serif`;
    context.fillText(subtitle, width / 2, height * 0.72);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeBrandPanelTexture(brand: DeliveryBrand) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (!context) return texture;

  const drawBase = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = brand.secondaryColor;
    roundedRect(context, 4, 4, canvas.width - 8, canvas.height - 8, 24);
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = brand.inkColor;
    context.stroke();
    context.fillStyle = brand.primaryColor;
    context.beginPath();
    context.arc(139, 179, 105, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = brand.inkColor;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = '800 86px "Malgun Gothic", sans-serif';
    context.fillText(brand.name, 252, 137, 365);
    context.font = '700 40px "Malgun Gothic", sans-serif';
    context.fillText(brand.productName, 270, 208, 335);
    context.font = '500 26px "Malgun Gothic", sans-serif';
    context.fillText(brand.slogan, 270, 264, 335);
    texture.needsUpdate = true;
  };

  drawBase();
  const image = new Image();
  image.onload = () => {
    drawBase();
    const scale = Math.min(178 / image.naturalWidth, 274 / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, 139 - width / 2, 180 - height / 2, width, height);
    texture.needsUpdate = true;
  };
  image.src = brand.productImage;
  return texture;
}

function texturedMaterial(imagePath: string, brand: DeliveryBrand, subtitle: string, aspectRatio: number) {
  const canvasWidth = 768;
  const fallback = makeTextTexture({
    title: brand.name,
    subtitle,
    background: brand.secondaryColor,
    foreground: brand.inkColor,
    width: canvasWidth,
    height: Math.round(canvasWidth / aspectRatio),
  });
  const material = new THREE.MeshBasicMaterial({ map: fallback, side: THREE.DoubleSide, toneMapped: false });
  const image = new Image();
  image.onload = () => {
    const canvas = fallback.image as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    if (!context || !imageWidth || !imageHeight) return;
    const scale = Math.min(canvas.width / imageWidth, canvas.height / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    context.fillStyle = brand.secondaryColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    fallback.needsUpdate = true;
  };
  // The text drawing stays visible if a custom image is missing or fails to load.
  image.onerror = () => {};
  image.src = imagePath;
  return material;
}

function markDistance<T extends THREE.Object3D>(object: T, distance: number) {
  object.userData.routeDistance = distance;
  return object;
}

// The taller, uncluttered viewport reveals the ground behind the starting bike.
// Extend scenery only; gameplay still clamps the player's position to zero.
function roadSceneryFrame(distance: number, branch: DetourChoice = "main") {
  const frame = getRouteFrame(distance, branch);
  if (distance < 0) frame.position.addScaledVector(frame.tangent, distance);
  return frame;
}

export function createRoadRibbon(width: number, material: THREE.Material, branch: DetourChoice = "main", y = 0, start: number = -45, end: number = DELIVERY_GAME_CONFIG.totalDistance, offset = 0) {
  const segments = Math.max(12, Math.ceil((end - start) / 3));
  const positions: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const distance = start + (end - start) * index / segments;
    const frame = roadSceneryFrame(distance, branch);
    for (const side of [-1, 1]) {
      const point = frame.position.clone().addScaledVector(frame.lateral, offset + side * width / 2);
      positions.push(point.x, y, point.z);
    }
    if (index < segments) { const n = index * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return new THREE.Mesh(applyRoadSurfaceUV(geometry), material);
}

export function createRoad(art: SceneArt, road: THREE.Material) {
  const group = new THREE.Group();
  const restricted = createRestrictedSurfaceMaterial(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), art.material(TOWN_COLORS.lawn));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.14; group.add(ground);
  group.add(createRoadRibbon(DELIVERY_GAME_CONFIG.roadWidth, road));
  const pavedSections = [[-45, ROAD_CLOSURE.junctionDistance - 20], [ROAD_CLOSURE.mergeEnd + 18, DELIVERY_GAME_CONFIG.totalDistance]];
  for (const [start, end] of pavedSections) addRoadEdges(group, art, restricted, start, end);
  const forkStart = ROAD_CLOSURE.junctionDistance - 18, forkEnd = ROAD_CLOSURE.mergeEnd + 18;
  for (const branch of ["left", "right"] as const) {
    group.add(createRoadRibbon(9.3, art.material(ROAD_SURFACE.sidewalk), branch, -.015, forkStart, forkEnd));
    group.add(createRoadRibbon(8.2, road, branch, branch === "left" ? .027 : .029, forkStart, forkEnd));
  }
  group.add(createLaneDashes(art, -32, DELIVERY_GAME_CONFIG.totalDistance));
  return group;
}

// Bus shoulders, sidewalks, curbs and edge lines on both sides of the main road over [start, end].
export function addRoadEdges(group: THREE.Group, art: SceneArt, restricted: THREE.Material, start: number, end: number) {
  for (const side of [-1, 1]) {
    const shoulder = createRoadRibbon(3.4, restricted, "main", -.015, start, end, side * DELIVERY_GAME_CONFIG.busLaneOffset);
    shoulder.name = `bus-only-shoulder:${side}:${start}`;
    group.add(shoulder);
    group.add(createRoadRibbon(2.3, art.material(ROAD_SURFACE.sidewalk), "main", .025, start, end, side * 8.95));
    group.add(createRoadRibbon(.19, art.material(TOWN_COLORS.curb), "main", .052, start, end, side * 7.8));
    group.add(createRoadRibbon(.12, art.material("#e5e4d4"), "main", .04, start, end, side * (DELIVERY_GAME_CONFIG.roadWidth / 2 - .1)));
  }
}

// Lane dashes every 10 m along [start, end).
export function createLaneDashes(art: SceneArt, start: number, end: number) {
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .018, 3.4), art.material("#fff8e6"), Math.ceil((end - start) / 10 + 1) * 2);
  const dummy = new THREE.Object3D(); let count = 0;
  for (let distance = start; distance < end; distance += 10) {
    const frame = roadSceneryFrame(distance);
    for (const offset of [-DELIVERY_GAME_CONFIG.laneSpacing / 2, DELIVERY_GAME_CONFIG.laneSpacing / 2]) {
      const point = frame.position.clone().addScaledVector(frame.lateral, offset);
      dummy.position.set(point.x, .047, point.z); dummy.rotation.y = frame.yaw; dummy.updateMatrix();
      dashes.setMatrixAt(count++, dummy.matrix);
    }
  }
  dashes.count = count; dashes.instanceMatrix.needsUpdate = true;
  return dashes;
}

export function placeOnRoute(object: THREE.Object3D, distance: number, branch: DetourChoice = "main") {
  const frame = getRouteFrame(distance, branch);
  const lateralOffset = object.position.x;
  object.position.set(frame.position.x + frame.lateral.x * lateralOffset, object.position.y, frame.position.z + frame.lateral.z * lateralOffset);
  object.rotation.y += frame.yaw;
}

export function createDeliveryStop(stop: (typeof DELIVERY_STOPS)[number], art: SceneArt, brand: DeliveryBrand, road: THREE.Material) {
  const index = DELIVERY_STOPS.findIndex((item) => item.id === stop.id);
  const houseTransform = getDeliveryHouseTransform(index);
  const house = art.glbAsset((["delivery_house_01", "delivery_house_02", "delivery_house_03"] as const)[index % 3]);
  const [doorX, doorY, doorZ] = house.userData.anchors.entrance as number[];
  house.userData.entranceLocal = [doorX, doorY, doorZ + .2];
  house.userData.roofMarkerLocal = [0, new THREE.Box3().setFromObject(house).max.y + .6, 0];
  art.shadow(house, 9.1, 7.1);
  house.userData.routeDistance = stop.distance; // distance culling hides objects without it
  house.position.copy(houseTransform.position);
  house.rotation.y = houseTransform.yaw;
  house.name = `delivery-house-${stop.id}`;
  house.userData.deliveryStopId = stop.id;
  const marker = markDistance(new THREE.Group(), stop.distance);
  const side = stop.side === "left" ? -1 : 1;
  const frame = getRouteFrame(stop.distance + DELIVERY_HOUSE.along);
  // The resident duck waits on the sidewalk in front of its door.
  const duck = createDuckResident(art, DUCK_SHIRTS[index % DUCK_SHIRTS.length]);
  marker.add(duck.group);
  house.updateMatrixWorld(true);
  const doorWorld = house.localToWorld(new THREE.Vector3(...house.userData.entranceLocal as [number, number, number])).sub(frame.position);
  const base = { position: frame.position.clone(), lateral: frame.lateral.clone(), tangent: frame.tangent.clone() };
  const rest = { u: side * DUCK.restU, v: 0 }, door = { u: doorWorld.dot(base.lateral), v: doorWorld.dot(base.tangent) };

  const zone = createDeliveryZone();
  const zoneGroup = new THREE.Group();
  zoneGroup.position.set(base.position.x, ZONE.y, base.position.z);
  zoneGroup.rotation.y = frame.yaw;
  zoneGroup.add(zone);
  marker.add(zoneGroup);

  const parcel = new THREE.Group();
  art.put(parcel, art.box(.6, .8, .46, brand.secondaryColor, .05), 0, 0, 0);
  art.put(parcel, new THREE.Mesh(new THREE.PlaneGeometry(.57, .8), texturedMaterial(brand.productImage, brand, brand.productName, .57 / .8)), 0, 0, .24);
  parcel.visible = false;
  parcel.rotation.y = frame.yaw;
  marker.add(parcel);
  marker.userData.stopId = stop.id;
  const rig: DeliveryStopRig = { distance: stop.distance, side, house, parcel, duck, base, rest, door };
  return { house, marker, rig };
}


function createBus(placement: BusPlacement, art: SceneArt, resources: OutdoorAdResources) {
  // v5 GLB bus in its own colours (2.6 x 3.0 x 6.0 m, the same box the ad panels were placed on).
  // Its front is +Z; mirrored front-to-back (not turned) so it drives toward -Z with indicator_left still on the left.
  const group = new THREE.Group(), model = art.glbAsset("mover_bus");
  model.scale.z = -1; group.add(model);
  art.shadow(group, 4.1, 7.8, .2, .1);
  for (const slot of BUS_AD_PANELS.filter(ad => ad.busId === placement.id)) {
    const panel = resources.panel(slot, slot.width);
    panel.position.set(...slot.position);
    panel.rotation.set(...slot.rotationDegrees.map(deg => THREE.MathUtils.degToRad(deg)) as [number, number, number]);
    group.add(panel);
  }
  group.position.x = (placement.side === "left" ? -1 : 1) * DELIVERY_GAME_CONFIG.busLaneOffset;
  return group;
}

export function createObstacle(placement: ObstaclePlacement, art: SceneArt): ObstacleRig {
  const group = markDistance(new THREE.Group(), placement.distance);
  group.position.x = obstacleCenterX(placement);
  group.position.z = -placement.distance;
  group.userData.obstacleId = placement.id;
  // Materials stay transparent so a hit can fade the obstacle (GLB props get their own fadeable copy).
  const mat = (color: string, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : "#000000", emissiveIntensity: emissive, transparent: true, opacity: 1 });
  const rbox = (w: number, h: number, d: number, material: THREE.Material, radius = .05) =>
    new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), material);
  const add = (mesh: THREE.Mesh, x: number, y: number, z = 0) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const shadow = new THREE.MeshBasicMaterial({ color: "#344944", transparent: true, opacity: 0.2 });
  const width = obstacleSpan(placement) * DELIVERY_GAME_CONFIG.laneSpacing - 0.3;
  const shadowMesh = placement.span && placement.span > 1
    ? new THREE.Mesh(new THREE.PlaneGeometry(width + 0.4, 1.6), shadow)
    : new THREE.Mesh(new THREE.CircleGeometry(1.55, 18), shadow);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.025;
  group.add(shadowMesh);

  const GLB = { cones: "obstacle_cones", barrier: "obstacle_barrier", plank: "obstacle_plank", crates: "obstacle_crates", overhead: "obstacle_overhead", signbeam: "obstacle_signbeam" } as const;
  if (placement.kind in GLB) {
    // v5 GLBs at their final size (heights match OBSTACLE_CLEARANCE). Beams span the road;
    // one-lane props repeat once per lane.
    const name = GLB[placement.kind as keyof typeof GLB], fullRoad = placement.kind === "overhead" || placement.kind === "signbeam";
    const span = fullRoad ? 1 : obstacleSpan(placement);
    for (let lane = 0; lane < span; lane++) {
      const prop = art.glbAsset(name, true);
      // Visual only: lift the duck beam's underside from 1.55 m to ~2.0 m so the 85% rider reads as fitting under it ducked.
      if (placement.kind === "overhead") prop.scale.y = 2.0 / 1.55;
      prop.position.x = (lane - (span - 1) / 2) * DELIVERY_GAME_CONFIG.laneSpacing;
      group.add(prop);
    }
    if (placement.kind === "signbeam") {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.0), new THREE.MeshBasicMaterial({ map: makeTextTexture({ title: "높이 제한", background: "#2f7fd6", foreground: "#ffffff", width: 512, height: 192 }), toneMapped: false }));
      add(plate, 0, 2.85, .3);
    }
  } else {
    const kraft = mat("#f0b273", .12), tape = mat("#fff3c4", .2);
    add(rbox(1.15, .92, .94, kraft, .05), 0, .48).rotation.y = .18;
    add(rbox(.18, .94, .96, tape, .02), 0, .48).rotation.y = .18;
  }
  // The procedural box is drawn ~25% taller/deeper so it reads early; GLB props are already final size.
  if (!(placement.kind in GLB)) group.scale.set(1, 1.25, 1.25);

  return { id: placement.id, distance: placement.distance, x: group.position.x, halfWidth: 1.2 + (obstacleSpan(placement) - 1) * DELIVERY_GAME_CONFIG.laneSpacing / 2, group };
}


// Original, unbranded critters/props. Groups face the route; the scene moves
// them and calls animate(t, moving, seconds) every frame.
export function createMover(placement: MoverPlacement, art: SceneArt, resources: OutdoorAdResources): MoverRig {
  if (placement.kind === "bus") {
    const group = createBus({ id: `mover-${placement.id}`, distance: placement.distance, brandId: "green", mode: "moving", side: "right", speed: 8 }, art, resources);
    // The GLB's left indicator blinks while the bus pulls out.
    const indicator = group.getObjectByName("indicator_left")!;
    return { placement, group, animate: (t, moving) => { indicator.visible = moving && t < 5 && Math.sin(t * 9) > 0; } };
  }
  if (placement.kind === "ducks") return createDucks(placement, art);
  if (placement.kind === "boom") return createBoomGate(placement, art);
  if (placement.kind === "slider") return createSlider(placement, art);
  if (placement.kind === "dropper") return createDropper(placement, art);
  if (placement.kind === "drum") return createDrum(placement, art);
  if (placement.kind === "geyser") return createGeyser(placement, art);
  if (placement.kind === "lanegate") return createLaneGate(placement, art);
  if (placement.kind === "cart") return createCart(placement, art);
  if (placement.kind === "pigeons") return createPigeons(placement, art);
  return createCat(placement, art);
}

function createDuck(art: SceneArt, mother: boolean) {
  // GLB faces +Z; turned to face -x (the family walks right to left across the road).
  const duck = new THREE.Group(), model = art.glbAsset(mother ? "mover_duck_mother" : "mover_duckling");
  model.rotation.y = -Math.PI / 2; duck.add(model);
  return { duck };
}

function createDucks(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), facing = new THREE.Group(); group.add(facing);
  art.shadow(facing, 4, .8);
  // Mother leads five ducklings: a line ~3.6 m long to time a gap around.
  const family = [createDuck(art, true), ...[0, 1, 2, 3, 4].map(() => createDuck(art, false))];
  family.forEach(({ duck }, n) => { duck.position.x = n === 0 ? -1.5 : -.8 + n * .55; facing.add(duck); });
  let lastX = 0;
  return { placement, group, animate: (t, moving, seconds, pose) => {
    // Built facing -x; turn around when walking the other way.
    if (Math.abs(pose.x - lastX) > .001) facing.rotation.y = pose.x > lastX ? Math.PI : 0;
    lastX = pose.x;
    family.forEach(({ duck }, n) => {
      const step = moving ? t * 11 + n * 1.3 : seconds * 2 + n;
      duck.rotation.x = Math.sin(step) * (moving ? .12 : .03);
      duck.position.y = moving ? Math.abs(Math.sin(step)) * .03 : 0;
    });
  } };
}

function createPigeons(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  const birds = Array.from({ length: 9 }, (_, n) => {
    const bird = new THREE.Group();
    const body = art.sphere(.13, n % 3 ? "#9aa5ad" : "#b9c2c8"); body.scale.set(1.5, 1, 1); bird.add(body);
    art.put(bird, art.sphere(.08, "#6f7f8a"), .17, .09, 0);
    const wings = [-1, 1].map(side => { const wing = art.box(.22, .02, .2, "#87939b"); wing.position.set(-.02, .04, side * .12); bird.add(wing); return wing; });
    // Scattered across the three lanes, a different flight path for each bird.
    const home = new THREE.Vector3(((n * 37) % 9 - 4) * .8, .13, ((n * 53) % 7 - 3) * .7);
    bird.position.copy(home); bird.rotation.y = n * 1.7; group.add(bird);
    return { bird, wings, home, away: new THREE.Vector3((n % 2 ? 1 : -1) * (3 + n % 4), 7 + n % 3 * 2, -4 - n % 5) };
  });
  return { placement, group, animate: (t, moving, seconds) => {
    birds.forEach(({ bird, wings, home, away }, n) => {
      const f = moving ? THREE.MathUtils.smoothstep(t, 0, 2.6) : 0;
      bird.position.lerpVectors(home, home.clone().add(away), f);
      const flap = moving ? Math.sin(seconds * 30 + n) * .9 : 0;
      wings.forEach((wing, side) => { wing.rotation.x = (side ? 1 : -1) * flap; });
      if (!moving) bird.position.y = home.y + Math.max(0, Math.sin(seconds * 3 + n * 2)) * .03; // pecking
    });
  } };
}

// Milk boosters: a glowing milk bottle with a halo ring, bobbing and spinning.
// Bottles are made as BOOSTERS grows (the challenge course appends as it goes); index n matches `collected`.
function createBoosterField(root: THREE.Group, art: SceneArt): BoosterField {
  const make = (booster: (typeof BOOSTERS)[number]) => {
    const group = new THREE.Group();
    const bottle = art.glbAsset("prop_booster_milk_bottle"); group.add(bottle); // children[0]: bobs in update()
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.75, .05, 8, 32), new THREE.MeshBasicMaterial({ color: "#9fdcff", transparent: true, opacity: .7, toneMapped: false }));
    halo.rotation.x = Math.PI / 2; halo.position.y = .05; group.add(halo);
    art.shadow(group, 1.2, 1.2);
    const frame = getRouteFrame(booster.distance, booster.branch ?? "main");
    const home = frame.position.addScaledVector(frame.lateral, (booster.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing);
    group.position.copy(home); root.add(group);
    return { group, bottle, halo, booster };
  };
  const bottles = BOOSTERS.map(make);
  return { update: (position, collected, seconds) => {
    while (bottles.length < BOOSTERS.length) bottles.push(make(BOOSTERS[bottles.length]));
    bottles.forEach(({ group, halo, booster }, n) => {
      const relative = booster.distance - position;
      group.visible = !collected?.has(n) && relative > -15 && relative < 150;
      if (!group.visible) return;
      group.rotation.y = seconds * 2;
      group.children[0].position.y = .25 + Math.sin(seconds * 3 + n) * .12;
      halo.scale.setScalar(1 + Math.sin(seconds * 4) * .12);
    });
  } };
}

// Collapsed road: a dark pit across every lane and both kerbs, ragged asphalt
// at the edges, and a warning sign ahead pointing riders to the centre ramp.
export function createGap(gap: Gap, art: SceneArt) {
  const objects: THREE.Object3D[] = [];
  const width = DELIVERY_GAME_CONFIG.roadWidth + 3.6, length = gap.end - gap.start, slices = Math.ceil(length / 2.5);
  for (let n = 0; n < slices; n++) {
    const d = gap.start + (n + .5) * length / slices;
    const slice = markDistance(new THREE.Group(), d);
    art.put(slice, art.box(width, .05, length / slices + .08, "#1f1b18"), 0, .03, 0);
    // Deeper-looking core with a lighter ring of broken asphalt.
    art.put(slice, art.box(width - 1.2, .06, length / slices + .1, "#0f0d0c"), 0, .035, 0);
    placeOnRoute(slice, d, gap.branch); objects.push(slice);
  }
  for (const [edge, facing] of [[gap.start, 1], [gap.end, -1]] as const) {
    const lip = markDistance(new THREE.Group(), edge);
    for (let n = 0; n < 9; n++) {
      const chunk = art.box(.7 + (n % 3) * .3, .14, .5 + (n % 2) * .3, n % 2 ? "#6c6f6b" : "#575a57");
      chunk.position.set(-width / 2 + .6 + n * (width - 1.2) / 8, .06, facing * (.15 + (n % 3) * .12));
      chunk.rotation.set((n % 2 ? .25 : -.2) * facing, n * .7, (n % 3 - 1) * .15);
      lip.add(chunk);
    }
    placeOnRoute(lip, edge, gap.branch); objects.push(lip);
  }
  const sign = markDistance(new THREE.Group(), gap.start - 32);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.7), new THREE.MeshBasicMaterial({
    map: makeTextTexture({ title: "도로 붕괴!", subtitle: "가운데 점프대로 건너세요", background: "#ffe08a", foreground: "#7a3d1c", width: 640, height: 300 }), toneMapped: false,
  }));
  board.scale.set(3.5 / 3.6, 1.6 / 1.7, 1); board.position.set(0, 1.83, .12); sign.add(board); // on the GLB's blank front panel
  sign.add(art.glbAsset("prop_road_closed_sign"));
  sign.position.x = DELIVERY_GAME_CONFIG.roadWidth / 2 + 1.2;
  placeOnRoute(sign, gap.start - 32, gap.branch); objects.push(sign);
  return objects;
}

// Orange launch ramp with white chevrons and corner flags; its high end is the launch point.
export function createRamp(ramp: Ramp, art: SceneArt) {
  const group = markDistance(new THREE.Group(), ramp.distance), length = 3.2;
  // GLB wedge (3.2 m long, .8 m rise) climbs toward -Z, the launch end.
  group.add(art.glbAsset("prop_ramp"));
  art.shadow(group, 2.8, 3.8);
  group.position.x = (ramp.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
  placeOnRoute(group, ramp.distance - length / 2, ramp.branch);
  return group;
}

// Railway-style boom gate: striped arm over the whole road, posts on both kerbs,
// red lamps that flash while the arm is down.
function createBoomGate(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = art.glbAsset("mover_boom"), half = DELIVERY_GAME_CONFIG.roadWidth / 2 + .9;
  const pivot = group.getObjectByName("arm")!; // GLB pivot sits on the left post at y=1.0
  const lamps = [-1, 1].map(side => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }));
    lamp.position.set(side * half, 1.45, .15); group.add(lamp); return lamp;
  });
  return { placement, group, animate: (_t, _moving, seconds, pose) => {
    pivot.rotation.z = pose.lift * Math.PI * .45;
    lamps.forEach((lamp, n) => { lamp.visible = pose.lift < .9 && Math.sin(seconds * 9 + n * Math.PI) > 0; });
  } };
}

// A red-and-white barrier on castors that sweeps across all three lanes.
function createSlider(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = art.glbAsset("mover_slider");
  art.shadow(group, 2.8, 1.1);
  // Blinks over the GLB's amber lamp.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffb33b", toneMapped: false }));
  lamp.position.set(-.92, 1.52, 0); group.add(lamp);
  return { placement, group, animate: (_t, _moving, seconds) => { lamp.visible = Math.sin(seconds * 8) > 0; } };
}

// Something dropped from above: a parcel, a flowerpot or a watermelon. Its
// shadow appears and grows first, so a quick lane change or a jump avoids it;
// then it rests where it landed.
function createDropper(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  const shadow = art.shadow(group, 1.8, 1.6);
  const thing = new THREE.Group(); group.add(thing);
  thing.add(art.glbAsset(placement.look === "pot" ? "mover_dropper_pot" : placement.look === "melon" ? "mover_dropper_melon" : "mover_dropper_parcel"));
  return { placement, group, animate: (_t, moving, _seconds, pose) => {
    thing.visible = moving; shadow.visible = moving;
    thing.position.y = pose.y;
    thing.rotation.z = pose.y > .05 ? pose.y * .12 : 0;
    thing.rotation.y = placement.look === "melon" && pose.y > .05 ? pose.y * .5 : 0;
    shadow.scale.setScalar(.4 + .6 * (1 - pose.y / DROP.height));
  } };
}

// A manhole in one lane: the cover rattles and puffs (warning), then a column of
// steam blasts up. Three side by side, on staggered timers, make a rolling wave.
function createGeyser(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = art.glbAsset("mover_geyser");
  const cover = group.getObjectByName("cover")!, coverY = cover.position.y;
  const steam = new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: .8, toneMapped: false, depthWrite: false });
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(.5, .72, 3, 14, 1, true), steam); group.add(plume);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.85, 14, 10), steam); group.add(cap);
  const puffs = [0, 1, 2].map(n => { const puff = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), steam); group.add(puff); return puff; });
  return { placement, group, animate: (_t, _moving, seconds, pose) => {
    const blast = pose.lift, warn = pose.y;
    plume.visible = cap.visible = blast > .02;
    plume.scale.set(1, Math.max(.01, blast), 1); plume.position.y = coverY + 1.5 * blast;
    cap.position.y = coverY + 3 * blast + .2; cap.scale.setScalar(.6 + .4 * blast);
    cover.position.y = coverY + (warn > 0 ? Math.abs(Math.sin(seconds * 40)) * .05 * warn : 0) + blast * .12;
    cover.rotation.z = warn > 0 ? Math.sin(seconds * 37) * .08 * warn : 0;
    puffs.forEach((puff, n) => {
      puff.visible = warn > 0 && blast < .1;
      const f = (seconds * 1.4 + n / 3) % 1;
      puff.position.set((n - 1) * .25, coverY + .2 + f * 1.1 * warn, 0); puff.scale.setScalar(.5 + f * warn);
    });
  } };
}

// One barrier arm over one lane, with a red/green lamp. Three of these on
// staggered timers: read the lamps and slip through whichever lane is open.
function createLaneGate(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = art.glbAsset("mover_lanegate");
  const pivot = group.getObjectByName("arm")!, red = group.getObjectByName("lamp_red")!, green = group.getObjectByName("lamp_green")!;
  return { placement, group, animate: (_t, _moving, seconds, pose) => {
    pivot.rotation.z = pose.lift * Math.PI * .45;
    const closed = pose.lift < .35;
    red.visible = closed || (pose.lift < .9 && Math.sin(seconds * 14) > 0); // flickers as it moves
    green.visible = !closed && pose.lift >= .9;
  } };
}

// A runaway shopping cart full of milk crates, racing kerb to kerb.
function createCart(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), facing = new THREE.Group(); group.add(facing);
  art.shadow(facing, 1.6, 1.2);
  // The GLB rolls along +Z (wheel axles on x); turned so it races along +x.
  const body = art.glbAsset("mover_cart"); body.rotation.y = Math.PI / 2; facing.add(body);
  const wheels = ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].map(name => body.getObjectByName(name)!);
  let lastX = 0, dir = 1;
  return { placement, group, animate: (t, moving, _seconds, pose) => {
    if (Math.abs(pose.x - lastX) > .001) dir = pose.x > lastX ? 1 : -1;
    lastX = pose.x; facing.rotation.y = dir > 0 ? 0 : Math.PI;
    wheels.forEach(w => { w.rotation.x = moving ? t * 22 : 0; });
    body.rotation.z = moving ? Math.sin(t * 17) * .03 : 0; body.position.y = moving ? Math.abs(Math.sin(t * 17)) * .03 : 0;
  } };
}

// A blue milk drum on its side, rolling toward the rider.
function createDrum(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  art.shadow(group, 1.3, 1);
  const roll = new THREE.Group(); roll.position.y = .42; group.add(roll);
  // GLB axis runs along z with its base at y=0: turned onto x and centred on the roll axis.
  const drum = art.glbAsset("mover_drum"); drum.rotation.y = Math.PI / 2; drum.position.y = -.42; roll.add(drum);
  return { placement, group, animate: (t, moving) => { roll.rotation.x = moving ? -Math.min(26, 7 * t) / .42 : 0; } };
}

function createCat(placement: MoverPlacement, art: SceneArt): MoverRig {
  // GLB faces +Z; turned to face +x (it walks across the road).
  const group = new THREE.Group();
  art.shadow(group, 1.25, .7);
  const turn = new THREE.Group(); group.add(turn);
  const cat = art.glbAsset("mover_cat"); cat.rotation.y = Math.PI / 2; turn.add(cat);
  const body = cat.getObjectByName("body_head")!, bodyY = body.position.y, tail = cat.getObjectByName("tail")!;
  const legs = ["leg_fl", "leg_fr", "leg_bl", "leg_br"].map(name => cat.getObjectByName(name)!);
  let lastX = 0;
  return { placement, group, animate: (t, moving, seconds, pose) => {
    // Turn around at each kerb.
    if (Math.abs(pose.x - lastX) > .001) turn.rotation.y = pose.x < lastX ? Math.PI : 0;
    lastX = pose.x;
    const stride = moving ? t * 9 : 0;
    // Diagonal pairs swing together, like a real walk (about the model's own x axis).
    legs.forEach((hip, n) => { hip.rotation.x = moving ? Math.sin(stride + (n === 0 || n === 3 ? 0 : Math.PI)) * .5 : 0; });
    body.position.y = bodyY + (moving ? Math.abs(Math.sin(stride)) * .025 : 0);
    tail.rotation.y = Math.sin(seconds * 3) * .3; tail.rotation.x = Math.sin(seconds * 2) * .1;
  } };
}

function createDestination(brand: DeliveryBrand, art: SceneArt) {
  const group = markDistance(new THREE.Group(), DELIVERY_GAME_CONFIG.totalDistance);
  art.shadow(group, 25, 14);
  const apartment = art.glbAsset("destination_apartment"); group.add(apartment);
  const { entrance, sign: signAt } = apartment.userData.anchors as Record<string, [number, number, number]>;
  group.userData.entranceLocal = [entrance[0], entrance[1], entrance[2] + .2];
  // Name boards are drawn in code just in front of the GLBs' blank panels.
  const board = (title: string, panel: THREE.Object3D, at: [number, number, number], width: number, height: number, offset: THREE.Vector3) => {
    const mesh = panel as THREE.Mesh; mesh.geometry.computeBoundingBox();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      map: makeTextTexture({ title, background: "#fbf6e6", foreground: "#42645a", width: 1024, height: Math.round(1024 * height / width) }), toneMapped: false,
    }));
    art.put(group, plane, at[0] + offset.x, at[1] + offset.y, at[2] + offset.z + mesh.geometry.boundingBox!.max.z + .04);
  };
  board("햇살 아파트 101동", apartment.getObjectByName("sign")!, signAt, 8, 1.1, new THREE.Vector3());
  const arrivalZone = new THREE.Mesh(new THREE.PlaneGeometry(9.3, 9), new THREE.MeshBasicMaterial({ color: "#f7dfa1", transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }));
  arrivalZone.rotation.x = -Math.PI / 2; art.put(group, arrivalZone, 0, .06, 7.5);
  art.merge(group);
  return group;
}

/** `challenge`: skip the fixed 1 km town (road, street, ads, buses, stops, destination); challenge-world.ts streams its own. */
export function buildDeliveryWorld(scene: THREE.Scene, brand: DeliveryBrand, challenge = false) {
  const root = new THREE.Group();
  scene.add(root);
  const worldObjects: THREE.Object3D[] = [];
  const movingBuses: MovingBusRig[] = [];
  const obstacles: ObstacleRig[] = [];
  const movers: MoverRig[] = [];
  const deliveryStops: DeliveryStopRig[] = [];
  const art = createSceneArt();
  const road = createRoadSurfaceMaterial();
  const advertisements = resolveAdvertisements();
  const outdoorResources = createOutdoorAdResources();
  const adViews = advertisementSightlines(advertisements);
  const horizon = art.horizon();
  root.add(horizon);
  if (!challenge) {
    root.add(createRoad(art, road));

    // Templates share geometry/materials. Batch nearby static facades by material
    // once, then let the existing distance culling hide whole small street blocks.
    const streetChunks = new Map<number, THREE.Group>();
    for (const item of buildStreetLayout(advertisements)) {
      const chunkId = Math.floor(item.distance / STREET_BUILDINGS.chunkLength);
      let chunk = streetChunks.get(chunkId);
      if (!chunk) {
        chunk = markDistance(new THREE.Group(), (chunkId + .5) * STREET_BUILDINGS.chunkLength);
        chunk.name = `commercial-street-${chunkId}`;
        streetChunks.set(chunkId, chunk);
      }
      const model = art.building(item, true), transform = streetTransform(item);
      model.position.copy(transform.position); model.rotation.y = transform.yaw;
      chunk.add(model);
    }
    for (const chunk of streetChunks.values()) { art.merge(chunk); root.add(chunk); worldObjects.push(chunk); }

    for (const item of SCENERY_ITEMS) {
      if (item.type === "house" || item.type === "shop") continue;
      if (!sceneryHasClearance(item, advertisements)) continue;
      let object: THREE.Object3D;
      if (item.type === "tree") object = art.tree(item);
      else if (item.type === "lamp") object = art.lamp(item);
      else if (item.type === "bus-stop") object = art.shelter(item);
      else object = art.building(item);
      placeOnRoute(object, item.distance);
      const bounds = new THREE.Box3().setFromObject(object);
      if (adViews.some(({ from, to }) => {
        const hit = new THREE.Ray(from, to.clone().sub(from).normalize()).intersectBox(bounds, new THREE.Vector3());
        return hit && from.distanceTo(hit) < from.distanceTo(to);
      })) continue;
      root.add(object);
      worldObjects.push(object);
    }

    for (const placement of advertisements) {
      const ad = createOutdoorAdvertisement(placement, art, outdoorResources);
      root.add(ad);
      worldObjects.push(ad);
    }
    for (const placement of OVERHEAD_ADS) {
      const overhead = createOverheadAdvertisement(placement, art, outdoorResources);
      root.add(overhead); worldObjects.push(overhead);
    }

    for (const placement of BUS_PLACEMENTS) {
      const bus = createBus(placement, art, outdoorResources);
      if (placement.mode === "parked") {
        bus.position.x = (placement.side === "left" ? -1 : 1) * DELIVERY_GAME_CONFIG.busLaneOffset;
        bus.position.y = 0;
        placeOnRoute(bus, placement.distance);
        markDistance(bus, placement.distance);
        worldObjects.push(bus);
      } else {
        bus.visible = false;
        movingBuses.push({ placement, group: bus });
      }
      root.add(bus);
    }
  }

  for (const placement of OBSTACLE_PLACEMENTS) {
    const obstacle = createObstacle(placement, art);
    placeOnRoute(obstacle.group, placement.distance, placement.branch);
    obstacles.push(obstacle);
    worldObjects.push(obstacle.group);
    root.add(obstacle.group);
  }

  for (const ramp of RAMPS) {
    const object = createRamp(ramp, art);
    root.add(object); worldObjects.push(object);
  }
  const boosters = createBoosterField(root, art);
  for (const gap of GAPS) for (const object of createGap(gap, art)) { root.add(object); worldObjects.push(object); }

  for (const placement of MOVER_PLACEMENTS) {
    const mover = createMover(placement, art, outdoorResources);
    mover.group.visible = false;
    movers.push(mover); root.add(mover.group);
  }

  if (!challenge) for (const stop of DELIVERY_STOPS) {
    const { house, marker, rig } = createDeliveryStop(stop, art, brand, road);
    deliveryStops.push(rig);
    root.add(house, marker);
    worldObjects.push(house, marker);
  }

  const destination = createDestination(brand, art);
  const destinationFrame = getRouteFrame(DELIVERY_GAME_CONFIG.totalDistance);
  destination.position.copy(destinationFrame.position).addScaledVector(destinationFrame.tangent, 7);
  destination.rotation.y = destinationFrame.yaw;
  if (!challenge) root.add(destination);
  const bicycle = art.bicycle(brand, makeBrandPanelTexture(brand), texturedMaterial(brand.productImage, brand, brand.productName, .32 / .53));
  root.add(bicycle.group);

  return { root, movers, boosters, bicycle, worldObjects, movingBuses, obstacles, deliveryStops, destination, horizon, road, art, outdoorResources } satisfies DeliveryWorld;
}
