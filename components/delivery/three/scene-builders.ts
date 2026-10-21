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
  wheels: THREE.Group[];
  pedal: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
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

function createRoadRibbon(width: number, material: THREE.Material, branch: DetourChoice = "main", y = 0, start: number = -45, end: number = DELIVERY_GAME_CONFIG.totalDistance, offset = 0) {
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
  for (const [start, end] of pavedSections) {
    for (const side of [-1, 1]) {
      const shoulder = createRoadRibbon(3.4, restricted, "main", -.015, start, end, side * DELIVERY_GAME_CONFIG.busLaneOffset);
      shoulder.name = `bus-only-shoulder:${side}:${start}`;
      group.add(shoulder);
      group.add(createRoadRibbon(2.3, art.material(ROAD_SURFACE.sidewalk), "main", .025, start, end, side * 8.95));
      group.add(createRoadRibbon(.19, art.material(TOWN_COLORS.curb), "main", .052, start, end, side * 7.8));
      group.add(createRoadRibbon(.12, art.material("#e5e4d4"), "main", .04, start, end, side * (DELIVERY_GAME_CONFIG.roadWidth / 2 - .1)));
    }
  }
  const forkStart = ROAD_CLOSURE.junctionDistance - 18, forkEnd = ROAD_CLOSURE.mergeEnd + 18;
  for (const branch of ["left", "right"] as const) {
    group.add(createRoadRibbon(9.3, art.material(ROAD_SURFACE.sidewalk), branch, -.015, forkStart, forkEnd));
    group.add(createRoadRibbon(8.2, road, branch, branch === "left" ? .027 : .029, forkStart, forkEnd));
  }
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .018, 3.4), art.material("#fff8e6"), Math.ceil((DELIVERY_GAME_CONFIG.totalDistance + 40) / 10) * 2);
  const dummy = new THREE.Object3D(); let count = 0;
  for (let distance = -32; distance < DELIVERY_GAME_CONFIG.totalDistance; distance += 10) {
    const frame = roadSceneryFrame(distance);
    for (const offset of [-DELIVERY_GAME_CONFIG.laneSpacing / 2, DELIVERY_GAME_CONFIG.laneSpacing / 2]) {
      const point = frame.position.clone().addScaledVector(frame.lateral, offset);
      dummy.position.set(point.x, .047, point.z); dummy.rotation.y = frame.yaw; dummy.updateMatrix();
      dashes.setMatrixAt(count++, dummy.matrix);
    }
  }
  dashes.count = count; dashes.instanceMatrix.needsUpdate = true; group.add(dashes);
  return group;
}

function placeOnRoute(object: THREE.Object3D, distance: number, branch: DetourChoice = "main") {
  const frame = getRouteFrame(distance, branch);
  const lateralOffset = object.position.x;
  object.position.set(frame.position.x + frame.lateral.x * lateralOffset, object.position.y, frame.position.z + frame.lateral.z * lateralOffset);
  object.rotation.y += frame.yaw;
}

export function createDeliveryStop(stop: (typeof DELIVERY_STOPS)[number], art: SceneArt, brand: DeliveryBrand, road: THREE.Material) {
  const index = DELIVERY_STOPS.findIndex((item) => item.id === stop.id);
  const houseTransform = getDeliveryHouseTransform(index);
  const house = art.building({ id: stop.id, distance: stop.distance, side: stop.side, type: "house", variant: index });
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
  const brand = DELIVERY_BRANDS[placement.brandId], group = new THREE.Group();
  art.shadow(group, 4.1, 7.8, .2, .1);
  art.put(group, art.box(2.6, 2.05, 6.0, brand.primaryColor, .19), 0, 1.48, 0);
  art.put(group, art.box(2.5, .24, 5.8, "#fff7e7", .1), 0, 2.58, 0);
  art.put(group, art.box(2.4, .14, 5.6, TOWN_COLORS.metal, .045), 0, .59, 0);
  for (const side of [-1, 1]) {
    for (const z of [-1.9, -.6, .7, 2.0]) art.put(group, art.box(.045, .68, 1.08, "#517878", .04), side * 1.312, 2.08, z);
    for (const z of [-1.9, 1.9]) {
      const tire = art.cylinder(.46, .46, .22, "#354d49"); tire.rotation.z = Math.PI / 2; art.put(group, tire, side * 1.33, .5, z);
      const hub = art.cylinder(.23, .23, .235, "#e4e3d2"); hub.rotation.z = Math.PI / 2; art.put(group, hub, side * 1.35, .5, z);
    }
    for (const z of [-3.015, 3.015]) art.put(group, art.box(.38, .17, .04, z < 0 ? "#fff3cd" : "#db816b", .03), side * .82, .9, z);
  }
  for (const z of [-3.01, 3.01]) {
    art.put(group, art.box(2.1, .77, .025, "#6a9a98", .07), 0, 2.05, z);
    art.put(group, art.box(.55, .18, .035, "#f8eed7", .025), 0, .85, z * 1.004);
  }
  art.merge(group);
  for (const slot of BUS_AD_PANELS.filter(ad => ad.busId === placement.id)) {
    const panel = resources.panel(slot, slot.width);
    panel.position.set(...slot.position);
    panel.rotation.set(...slot.rotationDegrees.map(deg => THREE.MathUtils.degToRad(deg)) as [number, number, number]);
    group.add(panel);
  }
  group.position.x = (placement.side === "left" ? -1 : 1) * DELIVERY_GAME_CONFIG.busLaneOffset;
  return group;
}

function createObstacle(placement: ObstaclePlacement): ObstacleRig {
  const group = markDistance(new THREE.Group(), placement.distance);
  group.position.x = obstacleCenterX(placement);
  group.position.z = -placement.distance;
  group.userData.obstacleId = placement.id;
  // Bright, toy-like props with soft edges. Materials stay transparent so a hit
  // can fade the obstacle; each prop is ~25% taller/deeper so it reads early.
  const mat = (color: string, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : "#000000", emissiveIntensity: emissive, transparent: true, opacity: 1 });
  const rbox = (w: number, h: number, d: number, material: THREE.Material, radius = .05) =>
    new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), material);
  const add = (mesh: THREE.Mesh, x: number, y: number, z = 0) => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const white = mat("#ffffff", .25), ink = mat("#3f4d4b");
  const shadow = new THREE.MeshBasicMaterial({ color: "#344944", transparent: true, opacity: 0.2 });
  const width = obstacleSpan(placement) * DELIVERY_GAME_CONFIG.laneSpacing - 0.3;
  const shadowMesh = placement.span && placement.span > 1
    ? new THREE.Mesh(new THREE.PlaneGeometry(width + 0.4, 1.6), shadow)
    : new THREE.Mesh(new THREE.CircleGeometry(1.55, 18), shadow);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.025;
  group.add(shadowMesh);

  if (placement.kind === "cones") {
    const orange = mat("#ff7a1a", .18);
    for (const x of [-0.76, 0, 0.76]) {
      add(rbox(.62, .1, .62, ink, .04), x, .05);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.86, 18), orange), x, 0.54);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 18), white), x, 0.42);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 18), white), x, 0.7);
      add(new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), orange), x, .97);
    }
  } else if (placement.kind === "barrier") {
    const red = mat("#ff4d5a", .15);
    add(rbox(2.3, .8, .2, red, .08), 0, .95);
    for (const x of [-0.8, -0.4, 0, 0.4, 0.8]) add(rbox(.2, .78, .22, white, .03), x, .95, .01).rotation.z = -0.55;
    for (const x of [-0.83, 0.83]) { add(rbox(.14, .86, .16, ink, .04), x, .45); add(rbox(.5, .08, .5, ink, .03), x, .04); }
    add(new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 10), mat("#ffd23d", .8)), -.85, 1.45);
  } else if (placement.kind === "overhead") {
    // A low striped beam on two posts across the whole road, with hanging flags: duck under it.
    const red = mat("#ff4d5a", .2);
    add(rbox(width + .3, .5, .42, red, .1), 0, 1.5);
    for (let x = -width / 2 + .5; x <= width / 2 - .4; x += .9) add(rbox(.34, .52, .44, white, .03), x, 1.5).rotation.z = -.55;
    for (const side of [-1, 1]) {
      add(rbox(.26, 1.75, .3, ink, .05), side * (width / 2 + .1), .88);
      add(rbox(.6, .08, .6, ink, .03), side * (width / 2 + .1), .04);
    }
    for (const x of [-width / 4, width / 4]) add(rbox(.5, .42, .05, mat("#ffd23d", .5), .03), x, 1.05);
  } else if (placement.kind === "plank") {
    // Speed-bump board: sunny yellow with white chevrons and red end reflectors.
    add(rbox(width, .24, .55, mat("#ffcf33", .2), .08), 0, .17);
    for (let x = -width / 2 + .45; x <= width / 2 - .4; x += .75) add(rbox(.32, .03, .5, white, .01), x, .3).rotation.y = .5;
    for (const side of [-1, 1]) add(rbox(.22, .2, .57, mat("#ff4d5a", .3), .05), side * (width / 2 - .11), .18);
  } else if (placement.kind === "crates") {
    // A row of plain milk crates in bright colours; no logos or brand marks.
    const colours = ["#38b6ff", "#ff6fa8", "#5fd36a", "#ffb02e"].map(c => mat(c, .15)), slot = mat("#ffffff", .05);
    const count = Math.round(width / 0.62);
    for (let index = 0; index < count; index += 1) {
      const x = -width / 2 + (index + 0.5) * (width / count), w = width / count - 0.06;
      add(rbox(w, .44, .6, colours[(index + Math.round(placement.distance)) % colours.length], .05), x, .22);
      add(rbox(w + .02, .06, .62, white, .02), x, .44);
      for (const y of [.14, .28]) add(rbox(w * .62, .05, .02, slot, .01), x, y, .31);
    }
  } else {
    const kraft = mat("#f0b273", .12), tape = mat("#fff3c4", .2);
    add(rbox(1.15, .92, .94, kraft, .05), 0, .48).rotation.y = .18;
    add(rbox(.18, .94, .96, tape, .02), 0, .48).rotation.y = .18;
  }
  // Taller and deeper (not wider: lanes stay readable side by side).
  group.scale.set(1, 1.25, 1.25);

  return { id: placement.id, distance: placement.distance, x: group.position.x, halfWidth: 1.2 + (obstacleSpan(placement) - 1) * DELIVERY_GAME_CONFIG.laneSpacing / 2, group };
}


// Original, unbranded critters/props. Groups face the route; the scene moves
// them and calls animate(t, moving, seconds) every frame.
function createMover(placement: MoverPlacement, art: SceneArt, resources: OutdoorAdResources): MoverRig {
  if (placement.kind === "bus") {
    const group = createBus({ id: `mover-${placement.id}`, distance: placement.distance, brandId: "green", mode: "moving", side: "right", speed: 8 }, art, resources);
    // Left indicator at the front corner: blinks while the bus pulls out.
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(.32, .22, .1), new THREE.MeshBasicMaterial({ color: "#ffb33b", toneMapped: false }));
    indicator.position.set(-1.2, .95, -3.06); group.add(indicator);
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

function createDuck(art: SceneArt, scale: number, body: string) {
  // Faces -x (the family walks right to left across the road).
  const duck = new THREE.Group();
  const torso = art.sphere(.26, body); torso.scale.set(1.25, .9, 1); torso.position.y = .3; duck.add(torso);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.1, .2, 6), art.material(body)); tail.rotation.z = -Math.PI / 2.6; tail.position.set(.33, .38, 0); duck.add(tail);
  art.put(duck, art.sphere(.16, body), -.24, .56, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 6), art.material("#f39a3d")); beak.rotation.z = Math.PI / 2; beak.position.set(-.42, .53, 0); duck.add(beak);
  for (const z of [-.08, .08]) art.put(duck, art.sphere(.028, "#2f3a37"), -.33, .62, z);
  const feet = [-.07, .07].map(z => art.put(duck, art.box(.12, .03, .07, "#f39a3d"), -.02, .02, z));
  duck.scale.setScalar(scale);
  return { duck, feet };
}

function createDucks(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), facing = new THREE.Group(); group.add(facing);
  art.shadow(facing, 4, .8);
  // Mother leads five ducklings: a line ~3.6 m long to time a gap around.
  const family = [createDuck(art, 1.45, "#fff8ec"), ...[.66, .62, .6, .58, .55].map(scale => createDuck(art, scale, "#ffd84a"))];
  family.forEach(({ duck }, n) => { duck.position.x = n === 0 ? -1.5 : -.8 + n * .55; facing.add(duck); });
  let lastX = 0;
  return { placement, group, animate: (t, moving, seconds, pose) => {
    // Built facing -x; turn around when walking the other way.
    if (Math.abs(pose.x - lastX) > .001) facing.rotation.y = pose.x > lastX ? Math.PI : 0;
    lastX = pose.x;
    family.forEach(({ duck, feet }, n) => {
      const step = moving ? t * 11 + n * 1.3 : seconds * 2 + n;
      duck.rotation.x = Math.sin(step) * (moving ? .12 : .03);
      duck.position.y = moving ? Math.abs(Math.sin(step)) * .03 : 0;
      feet.forEach((foot, side) => { foot.position.y = .02 + (moving ? Math.max(0, Math.sin(step + side * Math.PI)) * .05 : 0); });
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
function createBoosterField(root: THREE.Group, art: SceneArt): BoosterField {
  const profile = [[0, 0], [.2, 0], [.24, .06], [.24, .42], [.2, .52], [.1, .62], [.09, .76], [0, .76]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.MeshLambertMaterial({ color: "#fbfdff", emissive: "#bfe6ff", emissiveIntensity: .55 });
  const bottles = BOOSTERS.map(booster => {
    const group = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), glass); bottle.scale.setScalar(1.6); group.add(bottle);
    art.put(group, art.cylinder(.16, .16, .1, "#3fa7e0"), 0, 1.27, 0); // cap
    const label = art.cylinder(.39, .39, .22, "#3fa7e0"); label.position.y = .45; group.add(label);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.75, .05, 8, 32), new THREE.MeshBasicMaterial({ color: "#9fdcff", transparent: true, opacity: .7, toneMapped: false }));
    halo.rotation.x = Math.PI / 2; halo.position.y = .05; group.add(halo);
    art.shadow(group, 1.2, 1.2);
    const frame = getRouteFrame(booster.distance, booster.branch ?? "main");
    const home = frame.position.addScaledVector(frame.lateral, (booster.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing);
    group.position.copy(home); root.add(group);
    return { group, bottle, halo, booster };
  });
  return { update: (position, collected, seconds) => {
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
function createGap(gap: Gap, art: SceneArt) {
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
  board.position.y = 2.6; sign.add(board);
  art.put(sign, art.box(3.8, 1.9, .1, "#6f7768"), 0, 2.6, -.07);
  art.put(sign, art.box(.12, 1.8, .12, "#6f7768"), 0, .9, -.07);
  sign.position.x = DELIVERY_GAME_CONFIG.roadWidth / 2 + 1.2;
  placeOnRoute(sign, gap.start - 32, gap.branch); objects.push(sign);
  return objects;
}

// Orange launch ramp with white chevrons and corner flags; its high end is the launch point.
function createRamp(ramp: Ramp, art: SceneArt) {
  const group = markDistance(new THREE.Group(), ramp.distance), rise = .8, length = 3.2;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(length, 0), new THREE.Vector2(length, rise)]);
  const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: false }), art.material("#ff9a3c"));
  wedge.rotation.y = Math.PI / 2; wedge.position.set(-1.1, .02, length / 2); group.add(wedge);
  const slope = Math.atan2(rise, length);
  for (let n = 0; n < 3; n++) {
    // Chevron (two angled bars) pointing up the slope.
    const z = length / 2 - .75 - n * .95, y = .04 + rise * (length / 2 - z) / length;
    for (const side of [-1, 1]) {
      // Each bar slants inward toward the front, so the chevron points up the ramp.
      const bar = art.box(.95, .03, .2, "#ffffff"); bar.rotation.set(slope, -side * .45, 0);
      bar.position.set(side * .4, y + .02, z); group.add(bar);
    }
  }
  for (const side of [-1, 1]) {
    art.put(group, art.cylinder(.035, .035, 1.3, "#f4f1e8"), side * 1.15, .85, -length / 2);
    const flag = art.box(.02, .3, .42, "#ef5b5b"); art.put(group, flag, side * 1.15, 1.35, -length / 2 + .22);
  }
  art.shadow(group, 2.8, 3.8);
  group.position.x = (ramp.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
  placeOnRoute(group, ramp.distance - length / 2, ramp.branch);
  return group;
}

// Railway-style boom gate: striped arm over the whole road, posts on both kerbs,
// red lamps that flash while the arm is down.
function createBoomGate(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), half = DELIVERY_GAME_CONFIG.roadWidth / 2 + .9;
  for (const side of [-1, 1]) {
    art.put(group, art.box(.45, 1.5, .45, "#f4f1e8", .08), side * half, .75, 0);
    art.put(group, art.box(.6, .12, .6, "#3f4d4b", .04), side * half, .06, 0);
  }
  const lamps = [-1, 1].map(side => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 10), new THREE.MeshBasicMaterial({ color: "#ff3b3b", toneMapped: false }));
    lamp.position.set(side * half, 1.65, .15); group.add(lamp); return lamp;
  });
  const pivot = new THREE.Group(); pivot.position.set(-half, 1.0, 0); group.add(pivot);
  const length = half * 2 - .3;
  for (let n = 0; n < 10; n++) art.put(pivot, art.box(length / 10 + .01, .18, .14, n % 2 ? "#ffffff" : "#ff4d5a", .05), (n + .5) * length / 10, 0, 0);
  return { placement, group, animate: (_t, _moving, seconds, pose) => {
    pivot.rotation.z = pose.lift * Math.PI * .45;
    lamps.forEach((lamp, n) => { lamp.visible = pose.lift < .9 && Math.sin(seconds * 9 + n * Math.PI) > 0; });
  } };
}

// A red-and-white barrier on castors that sweeps across all three lanes.
function createSlider(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  art.shadow(group, 2.8, 1.1);
  art.put(group, art.box(2.3, .9, .3, "#ff4d5a", .1), 0, .85, 0);
  for (const x of [-.8, -.4, 0, .4, .8]) { const stripe = art.box(.2, .88, .32, "#ffffff", .04); stripe.rotation.z = -.55; art.put(group, stripe, x, .85, .005); }
  for (const x of [-.9, .9]) { art.put(group, art.box(.12, .5, .12, "#3f4d4b"), x, .3, 0); art.put(group, art.cylinder(.12, .12, .1, "#3f4d4b"), x, .1, 0); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), new THREE.MeshBasicMaterial({ color: "#ffb33b", toneMapped: false }));
  lamp.position.set(0, 1.42, 0); group.add(lamp);
  return { placement, group, animate: (_t, _moving, seconds) => { lamp.visible = Math.sin(seconds * 8) > 0; } };
}

// Something dropped from above: a parcel, a flowerpot or a watermelon. Its
// shadow appears and grows first, so a quick lane change or a jump avoids it;
// then it rests where it landed.
function createDropper(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  const shadow = art.shadow(group, 1.8, 1.6);
  const thing = new THREE.Group(); group.add(thing);
  if (placement.look === "pot") {
    art.put(thing, art.cylinder(.55, .38, .62, "#d9733f"), 0, .31, 0);
    art.put(thing, art.cylinder(.62, .62, .12, "#e8895a"), 0, .66, 0);
    art.put(thing, art.sphere(.5, "#5fbf6a"), 0, 1.0, 0);
    for (const [x, z, c] of [[-.3, .1, "#ff6fa8"], [.28, -.12, "#ffd23d"], [.05, .3, "#ff6fa8"]] as const) art.put(thing, art.sphere(.16, c), x, 1.32, z);
  } else if (placement.look === "melon") {
    const melon = art.sphere(.62, "#4fb85f"); melon.scale.set(1.15, .95, 1); art.put(thing, melon, 0, .6, 0);
    for (const rot of [0, Math.PI / 3, -Math.PI / 3]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(.62, .035, 6, 24), art.material("#2f8f45"));
      stripe.scale.set(1.15, .95, 1); stripe.rotation.set(0, rot, 0); stripe.position.y = .6; thing.add(stripe);
    }
    art.put(thing, art.cylinder(.05, .06, .16, "#7a5a2b"), 0, 1.2, 0);
  } else {
    art.put(thing, art.box(1.3, .95, 1.1, "#f0b273", .06), 0, .48, 0);
    art.put(thing, art.box(.2, .97, 1.12, "#fff3c4", .02), 0, .48, 0);
    art.put(thing, art.box(1.32, .2, .2, "#fff3c4", .02), 0, .97, 0);
  }
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
  const group = new THREE.Group();
  art.put(group, art.cylinder(.78, .78, .04, "#3f4d4b"), 0, .02, 0);
  const cover = art.cylinder(.6, .6, .06, "#8a9a96"); art.put(group, cover, 0, .07, 0);
  const steam = new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: .8, toneMapped: false, depthWrite: false });
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(.5, .72, 3, 14, 1, true), steam); group.add(plume);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.85, 14, 10), steam); group.add(cap);
  const puffs = [0, 1, 2].map(n => { const puff = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), steam); group.add(puff); return puff; });
  return { placement, group, animate: (_t, _moving, seconds, pose) => {
    const blast = pose.lift, warn = pose.y;
    plume.visible = cap.visible = blast > .02;
    plume.scale.set(1, Math.max(.01, blast), 1); plume.position.y = 1.5 * blast;
    cap.position.y = 3 * blast + .2; cap.scale.setScalar(.6 + .4 * blast);
    cover.position.y = .07 + (warn > 0 ? Math.abs(Math.sin(seconds * 40)) * .05 * warn : 0) + blast * .12;
    cover.rotation.z = warn > 0 ? Math.sin(seconds * 37) * .08 * warn : 0;
    puffs.forEach((puff, n) => {
      puff.visible = warn > 0 && blast < .1;
      const f = (seconds * 1.4 + n / 3) % 1;
      puff.position.set((n - 1) * .25, .25 + f * 1.1 * warn, 0); puff.scale.setScalar(.5 + f * warn);
    });
  } };
}

// One barrier arm over one lane, with a red/green lamp. Three of these on
// staggered timers: read the lamps and slip through whichever lane is open.
function createLaneGate(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), half = DELIVERY_GAME_CONFIG.laneSpacing / 2 - .08;
  art.put(group, art.box(.4, 1.6, .4, "#f4f1e8", .08), -half, .8, 0);
  art.put(group, art.box(.5, .1, .5, "#3f4d4b", .04), -half, .05, 0);
  art.put(group, art.box(.14, .55, .14, "#f4f1e8", .04), half, .28, 0);
  const lamp = (color: string) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), new THREE.MeshBasicMaterial({ color, toneMapped: false })); m.position.set(-half, 1.78, .1); group.add(m); return m; };
  const red = lamp("#ff3b3b"), green = lamp("#3be07a");
  const pivot = new THREE.Group(); pivot.position.set(-half, 1.0, 0); group.add(pivot);
  const length = half * 2;
  for (let n = 0; n < 6; n++) art.put(pivot, art.box(length / 6 + .01, .18, .14, n % 2 ? "#ffffff" : "#ff4d5a", .05), (n + .5) * length / 6, 0, 0);
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
  const body = new THREE.Group(); body.position.y = .12; facing.add(body);
  art.put(body, art.box(1.2, .06, .8, "#cfd8d6", .02), 0, .3, 0);
  for (const [x, z, w, d] of [[0, .4, 1.2, .05], [0, -.4, 1.2, .05], [.6, 0, .05, .8], [-.6, 0, .05, .8]] as const) art.put(body, art.box(w, .5, d, "#e8eeec", .02), x, .56, z);
  art.put(body, art.box(.08, .08, .9, "#3f4d4b", .02), -.7, .98, 0);
  art.put(body, art.box(.06, .7, .06, "#3f4d4b"), -.66, .66, .4); art.put(body, art.box(.06, .7, .06, "#3f4d4b"), -.66, .66, -.4);
  for (const [x, c] of [[-.25, "#38b6ff"], [.25, "#ff6fa8"]] as const) art.put(body, art.box(.42, .36, .6, c, .04), x, .55, 0);
  art.put(body, art.box(.4, .3, .55, "#ffb02e", .04), 0, .88, 0);
  const wheels = [[.45, .35], [.45, -.35], [-.45, .35], [-.45, -.35]].map(([x, z]) => { const w = art.cylinder(.12, .12, .08, "#3f4d4b"); w.rotation.x = Math.PI / 2; art.put(body, w, x, .0, z); return w; });
  let lastX = 0, dir = 1;
  return { placement, group, animate: (t, moving, _seconds, pose) => {
    if (Math.abs(pose.x - lastX) > .001) dir = pose.x > lastX ? 1 : -1;
    lastX = pose.x; facing.rotation.y = dir > 0 ? 0 : Math.PI;
    wheels.forEach(w => { w.rotation.y = moving ? t * 22 : 0; });
    body.rotation.z = moving ? Math.sin(t * 17) * .03 : 0; body.position.y = .12 + (moving ? Math.abs(Math.sin(t * 17)) * .03 : 0);
  } };
}

// A blue milk drum on its side, rolling toward the rider.
function createDrum(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group();
  art.shadow(group, 1.3, 1);
  const roll = new THREE.Group(); roll.position.y = .42; group.add(roll);
  const body = art.cylinder(.42, .42, 1, "#3fa7e0"); body.rotation.z = Math.PI / 2; roll.add(body);
  for (const x of [-.3, .3]) { const band = art.cylinder(.44, .44, .1, "#ffffff"); band.rotation.z = Math.PI / 2; band.position.x = x; roll.add(band); }
  const cap = art.cylinder(.2, .2, .06, "#1f6fa8"); cap.rotation.z = Math.PI / 2; cap.position.x = .53; roll.add(cap);
  return { placement, group, animate: (t, moving) => { roll.rotation.x = moving ? -Math.min(26, 7 * t) / .42 : 0; } };
}

function createCat(placement: MoverPlacement, art: SceneArt): MoverRig {
  // Faces +x (it walks across the road). Rounded parts, cream belly and muzzle,
  // jointed legs and a swaying tail; slightly larger than life so it reads.
  const group = new THREE.Group(), fur = "#ffa64a", dark = "#e07a2a", cream = "#fff4e2", pink = "#f4a3a8", ink = "#2f3a37";
  art.shadow(group, 1.25, .7);
  const body = new THREE.Group(); body.position.y = .42; group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .5, 6, 14), art.material(fur));
  torso.rotation.z = Math.PI / 2; body.add(torso);
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(.15, .38, 6, 12), art.material(cream));
  belly.rotation.z = Math.PI / 2; belly.position.y = -.06; body.add(belly);
  for (const x of [-.18, 0, .18]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(.19, .025, 6, 16, Math.PI * .9), art.material(dark));
    stripe.rotation.set(0, Math.PI / 2, Math.PI * .05); stripe.position.set(x, .005, 0); body.add(stripe);
  }
  const head = new THREE.Group(); head.position.set(.42, .2, 0); body.add(head);
  head.add(art.sphere(.2, fur));
  for (const z of [-.1, .1]) {
    art.put(head, art.sphere(.08, cream), .13, -.06, z * .7);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.075, .16, 4), art.material(fur)); ear.position.set(.02, .2, z); ear.rotation.y = Math.PI / 4; head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 4), art.material(pink)); inner.position.set(.05, .19, z); inner.rotation.y = Math.PI / 4; head.add(inner);
    art.put(head, art.sphere(.035, ink), .17, .05, z * .75);
    art.put(head, art.sphere(.012, "#ffffff"), .2, .065, z * .7);
  }
  art.put(head, art.sphere(.03, pink), .21, -.02, 0);
  const legs = [[.22, .11], [.22, -.11], [-.22, .11], [-.22, -.11]].map(([x, z]) => {
    const hip = new THREE.Group(); hip.position.set(x, -.12, z); body.add(hip);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .2, 4, 8), art.material(fur)); leg.position.y = -.14; hip.add(leg);
    art.put(hip, art.sphere(.055, cream), 0, -.28, 0);
    return hip;
  });
  const tail: THREE.Group[] = [];
  let joint: THREE.Object3D = body;
  for (let n = 0; n < 5; n++) {
    const segment = new THREE.Group(); segment.position.set(n ? -.1 : -.42, n ? .02 : .08, 0); joint.add(segment);
    art.put(segment, art.sphere(.05 - n * .004, n === 4 ? dark : fur), -.05, 0, 0);
    tail.push(segment); joint = segment;
  }
  group.scale.setScalar(1.3);
  let lastX = 0;
  return { placement, group, animate: (t, moving, seconds, pose) => {
    // Built facing +x; turn around at each kerb.
    if (Math.abs(pose.x - lastX) > .001) group.children.forEach(child => { child.rotation.y = pose.x < lastX ? Math.PI : 0; });
    lastX = pose.x;
    const stride = moving ? t * 9 : 0;
    // Diagonal pairs swing together, like a real walk.
    legs.forEach((hip, n) => { hip.rotation.z = moving ? Math.sin(stride + (n === 0 || n === 3 ? 0 : Math.PI)) * .5 : 0; });
    body.position.y = .42 + (moving ? Math.abs(Math.sin(stride)) * .025 : 0);
    head.rotation.z = moving ? Math.sin(stride * 2) * .05 : Math.sin(seconds * 1.5) * .08;
    tail.forEach((segment, n) => { segment.rotation.z = .35 + Math.sin(seconds * 3 - n * .6) * .18; segment.rotation.y = Math.sin(seconds * 2 - n * .5) * .15; });
  } };
}

function createDestination(brand: DeliveryBrand, art: SceneArt) {
  const group = markDistance(new THREE.Group(), DELIVERY_GAME_CONFIG.totalDistance);
  group.userData.entranceLocal = [0, 1.64, 3.1];
  art.shadow(group, 25, 14);
  art.put(group, art.box(18, .3, 9, TOWN_COLORS.pavement, .1), 0, .15, 1.2);
  art.put(group, art.box(17, 11, 5.4, "#f1e8d5", .12), 0, 5.65, 0);
  art.put(group, art.box(4.1, 11.15, 5.6, "#c7dcd2", .08), 0, 5.68, .02);
  art.put(group, art.box(17.6, .37, 5.9, "#70948b", .08), 0, 11.32, 0);
  for (let row = 0; row < 5; row++) {
    for (const x of [-6.7, -4.45, 4.45, 6.7]) art.windowOn(group, x, 1.75 + row * 1.85, 2.74, 1.12, 1.1);
    if (row > 1) art.windowOn(group, 0, 1.75 + row * 1.85, 2.85, 1.55, 1.1);
  }
  art.put(group, art.box(3.4, 2.9, .16, "#5c8680", .06), 0, 1.6, 2.95);
  art.put(group, art.box(2.7, 2.3, .045, "#91bdb6"), 0, 1.64, 3.05);
  art.put(group, art.box(.09, 2.4, .045, "#fbf4df"), 0, 1.64, 3.1);
  art.put(group, art.box(5.0, .22, 2.0, "#73968a", .05), 0, 3.2, 3.15);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.1), new THREE.MeshBasicMaterial({
    map: makeTextTexture({ title: "햇살 아파트 101동", background: "#fbf6e6", foreground: "#42645a", width: 1024, height: 160 }), toneMapped: false,
  }));
  art.put(group, sign, 0, 4.3, 2.97);
  for (const side of [-1, 1]) {
    art.put(group, art.box(3.3, .65, 1.4, "#c9b89a", .09), side * 6.7, .65, 3.6);
    for (const x of [-.9, 0, .9]) { const bush = art.sphere(.8, "#83a383"); bush.scale.y = .8; art.put(group, bush, side * 6.7 + x, 1.35, 3.6); }
  }
  const arrivalZone = new THREE.Mesh(new THREE.PlaneGeometry(9.3, 9), new THREE.MeshBasicMaterial({ color: "#f7dfa1", transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }));
  arrivalZone.rotation.x = -Math.PI / 2; art.put(group, arrivalZone, 0, .06, 7.5);
  art.merge(group);
  return group;
}

export function buildDeliveryWorld(scene: THREE.Scene, brand: DeliveryBrand) {
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
  root.add(createRoad(art, road));
  const horizon = art.horizon();
  root.add(horizon);

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

  for (const placement of OBSTACLE_PLACEMENTS) {
    const obstacle = createObstacle(placement);
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

  for (const stop of DELIVERY_STOPS) {
    const { house, marker, rig } = createDeliveryStop(stop, art, brand, road);
    deliveryStops.push(rig);
    root.add(house, marker);
    worldObjects.push(house, marker);
  }

  const destination = createDestination(brand, art);
  const destinationFrame = getRouteFrame(DELIVERY_GAME_CONFIG.totalDistance);
  destination.position.copy(destinationFrame.position).addScaledVector(destinationFrame.tangent, 7);
  destination.rotation.y = destinationFrame.yaw;
  root.add(destination);
  const bicycle = art.bicycle(brand, makeBrandPanelTexture(brand), texturedMaterial(brand.productImage, brand, brand.productName, .32 / .53));
  root.add(bicycle.group);

  return { root, movers, boosters, bicycle, worldObjects, movingBuses, obstacles, deliveryStops, destination, horizon } satisfies DeliveryWorld;
}
