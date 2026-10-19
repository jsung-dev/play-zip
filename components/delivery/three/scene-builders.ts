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
import { DELIVERY_STOPS, ROAD_CLOSURE, TURN_LANE, TURN_LANE_CONNECTIONS, getExtraLaneX, turnLaneSide, getRouteFrame, getDrivewayFrame, getDrivewayLength, getDrivewayExitDistance, getDrivewayDeliveryInterval, getDeliveryHouseTransform, type DetourChoice } from "@/data/delivery-map";
import { createSceneArt, TOWN_COLORS, type SceneArt } from "./scene-art";
import { applyRoadSurfaceUV, createRoadSurfaceMaterial, createRestrictedSurfaceMaterial, ROAD_SURFACE } from "./road-surface";
import { resolveAdvertisements, sceneryHasClearance } from "./scene-layout";
import { BUS_AD_PANELS, DESTINATION_OVERHEAD_AD } from "@/data/delivery-outdoor-ads";
import { createOutdoorAdResources, type OutdoorAdResources } from "./outdoor-ad-material";
import { createOutdoorAdvertisement, createOverheadAdvertisement } from "./outdoor-ad-model";
import { buildStreetLayout, STREET_BUILDINGS, streetTransform, advertisementSightlines } from "./street-layout";
import { obstacleCenterX, obstacleSpan } from "../delivery-jump";
import { BALL_MOTION, MOVER_PLACEMENTS, type MoverPlacement } from "../delivery-movers";
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

export type MoverRig = { placement: MoverPlacement; group: THREE.Group; animate: (t: number, moving: boolean, seconds: number) => void };

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

export type DeliveryStopRig = {
  distance: number;
  side: number;
  house: THREE.Group;
  parcel: THREE.Group;
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
  // The barrier's inaccessible continuation, BELOW both usable bypasses.
  // Their existing gray ribbons cover the join, without changing route vertices.
  const closed = createRoadRibbon(DELIVERY_GAME_CONFIG.roadWidth, restricted, "main", .014, ROAD_CLOSURE.distance, ROAD_CLOSURE.mergeEnd);
  closed.name = "closed-main-road"; group.add(closed);
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
  // Reuse the roadside shoulder only at each junction. Main road and its two
  // lane dividers stay untouched. Shared materials/geometry keep this light.
  const stripeMaterial = art.material("#fff8e6");
  const stripeGeometry = new THREE.BoxGeometry(.12, .018, 2.6);
  for (const connection of TURN_LANE_CONNECTIONS) {
    const side = turnLaneSide(connection), positions: number[] = [], indices: number[] = [];
    const far = connection.distance - connection.direction * (TURN_LANE.approach + TURN_LANE.taper);
    const near = connection.distance + connection.direction * TURN_LANE.tail;
    const start = Math.min(far, near), end = Math.max(far, near), segments = 40;
    for (let n = 0; n <= segments; n++) {
      const distance = start + (end-start) * n / segments, frame = getRouteFrame(distance);
      const laneOuter = Math.abs(getExtraLaneX(connection, distance)) + TURN_LANE.halfWidth;
      // After the same grace point where the rider merges, taper only the
      // painted asphalt edge into the main road. No square shoulder cut-off.
      const pastJoin = (distance - connection.distance) * connection.direction;
      const tailBlend = THREE.MathUtils.smoothstep(pastJoin, TURN_LANE.grace, TURN_LANE.tail);
      const outer = Math.max(DELIVERY_GAME_CONFIG.roadWidth / 2,
        THREE.MathUtils.lerp(laneOuter, DELIVERY_GAME_CONFIG.roadWidth / 2, tailBlend));
      for (const x of [3.65, outer]) {
        const p = frame.position.clone().addScaledVector(frame.lateral, side * x);
        positions.push(p.x, .06, p.z);
      }
      if (n < segments) { const k = n*2; indices.push(k,k+1,k+2,k+1,k+3,k+2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const surface = new THREE.Mesh(applyRoadSurfaceUV(geometry),road); surface.name = `turn-lane-${connection.stopIndex}-${connection.entryEnd}`; group.add(surface);
    for (let ahead = 6; ahead <= TURN_LANE.approach; ahead += 7) {
      const distance = connection.distance - connection.direction * ahead, frame = getRouteFrame(distance);
      const stripe = new THREE.Mesh(stripeGeometry,stripeMaterial);
      stripe.position.copy(frame.position).addScaledVector(frame.lateral,side * 3.75);
      stripe.position.y=.09; stripe.rotation.y=frame.yaw; group.add(stripe);
    }
  }
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
  const length = getDrivewayLength(index);
  const zone = getDrivewayDeliveryInterval(index);
  const frame = getDrivewayFrame(index, (zone.start + zone.end) / 2);
  const houseTransform = getDeliveryHouseTransform(index);
  const house = art.building({ id: stop.id, distance: stop.distance, side: stop.side, type: "house", variant: index });
  house.position.copy(houseTransform.position);
  house.rotation.y = houseTransform.yaw;
  house.name = `delivery-house-${stop.id}`;
  house.userData.deliveryStopId = stop.id;
  const marker = markDistance(new THREE.Group(), stop.distance);
  const width = DELIVERY_GAME_CONFIG.drivewayWidth;
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: "#fae4ab", side: THREE.DoubleSide, toneMapped: false });
  // Do not leave the decorative ivory/yellow rim across the main-road join.
  // Recolor only overlapping triangles; retain every vertex and all road paths.
  const mainRoadSamples = Array.from({length: Math.ceil(getDrivewayExitDistance(index) - stop.distance + 16) + 1}, (_, n) => getRouteFrame(stop.distance - 8 + n).position);
  const blendJoinedEdge = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>) => {
    const geometry = mesh.geometry, position = geometry.getAttribute("position"), triangles = geometry.index!;
    geometry.clearGroups();
    let previousMaterial = -1, start = 0;
    for (let n = 0; n < triangles.count; n += 3) {
      const onRoad = [0,1,2].some(corner => {
        const vertex = triangles.getX(n + corner), x = position.getX(vertex), z = position.getZ(vertex);
        return mainRoadSamples.some(point => (point.x-x)**2 + (point.z-z)**2 <= 7.8**2);
      });
      const nextMaterial = onRoad ? 0 : 1;
      if (nextMaterial !== previousMaterial) {
        if (previousMaterial >= 0) geometry.addGroup(start, n-start, previousMaterial);
        start = n; previousMaterial = nextMaterial;
      }
    }
    geometry.addGroup(start, triangles.count-start, previousMaterial);
    return new THREE.Mesh(geometry, [road, mesh.material]);
  };
  const ribbon = (ribbonWidth: number, material: THREE.Material, start = 0, end = length, offset = 0, y = .065) => {
    const positions: number[] = [], indices: number[] = [];
    for (let n = 0; n <= 40; n++) {
      const distance = start + (end - start) * n / 40;
      const segment = getDrivewayFrame(index, distance);
      if (distance > length) segment.position.addScaledVector(segment.tangent, distance - length);
      // Match the fourth lane's 3m mouth, then ease into the unchanged 4.4m
      // alley. The old 7.6m decorative flare left gray triangles on the walk.
      // This is pavement skin only; driveway curves, entries and bounds stay put.
      const joinDistance = Math.min(distance, length - distance);
      const flare = THREE.MathUtils.lerp(TURN_LANE.halfWidth * 2, width,
        THREE.MathUtils.smoothstep(joinDistance, 0, 6)) - width;
      const pavedWidth = ribbonWidth > 1 ? ribbonWidth + flare : ribbonWidth;
      const edgeOffset = offset + Math.sign(offset) * flare / 2;
      for (const side of [-1, 1]) {
        const point = segment.position.clone().addScaledVector(segment.lateral, edgeOffset + side * pavedWidth / 2);
        positions.push(point.x, y, point.z);
      }
      if (n < 40) { const i = n * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return new THREE.Mesh(applyRoadSurfaceUV(geometry), material);
  };
  marker.add(blendJoinedEdge(ribbon(width + .5, art.material(ROAD_SURFACE.sidewalk))));
  marker.add(ribbon(width, road, 0, length, 0, .076));
  // Fade the borders into the main road instead of drawing a barrier at either join.
  for (const offset of [-width / 2, width / 2]) marker.add(blendJoinedEdge(ribbon(.12, edgeMaterial, 3, length - 3, offset, .095)));

  // Current-target guidance is rendered separately from permanent road geometry.
  const furniture = new THREE.Group();
  const side = stop.side === "left" ? -1 : 1;
  furniture.position.copy(frame.position); furniture.rotation.y = frame.yaw;
  marker.add(furniture);
  for (const z of [-5.5, 5.5]) {
    const x = side * (width / 2 + 1);
    art.put(furniture, art.box(.8, .48, 1.3, "#cfbea2", .07), x, .24, z);
    const bush = art.sphere(.55, "#8ca77f"); bush.scale.z = 1.5;
    art.put(furniture, bush, x, .7, z);
  }

  const parcel = new THREE.Group();
  art.put(parcel, art.box(.6, .8, .46, brand.secondaryColor, .05), 0, 0, 0);
  art.put(parcel, new THREE.Mesh(new THREE.PlaneGeometry(.57, .8), texturedMaterial(brand.productImage, brand, brand.productName, .57 / .8)), 0, 0, .24);
  parcel.visible = false;
  parcel.rotation.y = frame.yaw;
  marker.add(parcel);
  marker.userData.stopId = stop.id;
  const rig: DeliveryStopRig = { distance: stop.distance, side, house, parcel };
  return { house, marker, rig };
}

function createRoadClosure() {
  const group = new THREE.Group();
  const frame = getRouteFrame(ROAD_CLOSURE.distance);
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(DELIVERY_GAME_CONFIG.roadWidth, 1.25, 0.45), new THREE.MeshLambertMaterial({ color: "#f0c35d" }));
  barrier.position.y = 0.78;
  group.add(barrier);
  for (let index = -4; index <= 4; index += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.3, 0.48), new THREE.MeshLambertMaterial({ color: index % 2 ? "#fff1d2" : "#df8067" }));
    stripe.position.set(index * 1.15, 0.78, 0.25);
    stripe.rotation.z = -0.36;
    group.add(stripe);
  }
  const notice = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.15), new THREE.MeshBasicMaterial({ map: makeTextTexture({ title: "앞길 공사 중", subtitle: "갈림길로 돌아가 우회하세요", background: "#fff0d1", foreground: "#8b5645" }), toneMapped: false }));
  notice.position.set(0, 2.4, 0.28);
  group.add(notice);
  group.position.copy(frame.position);
  group.position.y = 0;
  group.rotation.y = frame.yaw;
  markDistance(group, ROAD_CLOSURE.distance);
  group.userData.roadClosure = true;
  return group;
}

function createAdvanceDetourSign() {
  const distance = ROAD_CLOSURE.junctionDistance - 55;
  const group = markDistance(new THREE.Group(), distance);
  const frameMaterial = new THREE.MeshLambertMaterial({ color: "#6f7768" });
  const backing = new THREE.Mesh(new THREE.BoxGeometry(5.25, 2.3, 0.16), frameMaterial);
  backing.position.y = 3.2;
  const graphic = new THREE.Mesh(
    new THREE.PlaneGeometry(5.08, 2.13),
    new THREE.MeshBasicMaterial({
      map: makeTextTexture({ title: "앞길 공사 · 갈림길", subtitle: "왼쪽 또는 오른쪽 차선으로", background: "#fff0cf", foreground: "#694f42", width: 768, height: 320 }),
      toneMapped: false,
    }),
  );
  graphic.position.set(0, 3.2, 0.09);
  group.add(backing, graphic);
  for (const x of [-1.65, 1.65]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.05, 0.14), frameMaterial);
    leg.position.set(x, 1.1, -0.06);
    group.add(leg);
  }
  group.position.set(-8.7, 0.1, -distance);
  return group;
}

function createDetourArrow(branch: Exclude<DetourChoice, "main">, distance: number) {
  const frame = getRouteFrame(distance, branch);
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 5.2);
  arrowShape.lineTo(1.2, 2.8);
  arrowShape.lineTo(0.48, 2.8);
  arrowShape.lineTo(0.48, 0);
  arrowShape.lineTo(-0.48, 0);
  arrowShape.lineTo(-0.48, 2.8);
  arrowShape.lineTo(-1.2, 2.8);
  arrowShape.closePath();
  const shapeGeometry = new THREE.ShapeGeometry(arrowShape);
  const flatPositions: number[] = [];
  const source = shapeGeometry.getAttribute("position");
  for (let index = 0; index < source.count; index += 1) {
    const side = source.getX(index);
    const forward = source.getY(index);
    const point = frame.position.clone()
      .addScaledVector(frame.lateral, side)
      .addScaledVector(frame.tangent, forward);
    flatPositions.push(point.x, 0.055, point.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(flatPositions, 3));
  geometry.setIndex(shapeGeometry.getIndex());
  geometry.computeVertexNormals();
  shapeGeometry.dispose();
  const arrow = markDistance(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#fff5d2", side: THREE.DoubleSide })), distance);
  arrow.userData.detour = branch;
  return arrow;
}

function createForkDirectionSign(branch: Exclude<DetourChoice, "main">) {
  const distance = ROAD_CLOSURE.junctionDistance + 7;
  const group = markDistance(new THREE.Group(), distance);
  const left = branch === "left";
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), new THREE.MeshLambertMaterial({ color: "#70877d" }));
  post.position.y = 1.7;
  const backing = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.2, 0.16), new THREE.MeshLambertMaterial({ color: left ? "#6d9d83" : "#887ca7" }));
  backing.position.y = 3.65;
  const graphic = new THREE.Mesh(new THREE.PlaneGeometry(5.62, 2.03), new THREE.MeshBasicMaterial({
    map: makeTextTexture({ title: left ? "← 왼쪽 길" : "오른쪽 길 →", subtitle: "공사 구간 우회", background: left ? "#e6f4e3" : "#eee7f7", foreground: left ? "#42634f" : "#5b4e71", width: 768, height: 300 }),
    toneMapped: false,
  }));
  graphic.position.set(0, 3.65, 0.09);
  group.add(post, backing, graphic);
  group.position.set(left ? -7.6 : 7.6, 0, 0);
  return group;
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
  if (placement.kind === "ball") return createBeachBall(placement, art);
  if (placement.kind === "ducks") return createDucks(placement, art);
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
  const group = new THREE.Group();
  art.shadow(group, 2.6, .8);
  const family = [createDuck(art, 1.35, "#fff8ec"), ...[.62, .58, .55].map(scale => createDuck(art, scale, "#f6d65a"))];
  family.forEach(({ duck }, n) => { duck.position.x = n === 0 ? -.6 : .2 + n * .5; group.add(duck); });
  return { placement, group, animate: (t, moving, seconds) => {
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

function createBeachBall(placement: MoverPlacement, art: SceneArt): MoverRig {
  const group = new THREE.Group(), { radius, toward, across } = BALL_MOTION;
  const shadow = art.shadow(group, radius * 2.4, radius * 2.4);
  // Six bright panels with white caps, painted per vertex so the spin reads clearly.
  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const panels = ["#ef5b5b", "#fff6e4", "#3fa7e0", "#fff6e4", "#f6c445", "#fff6e4"].map(c => new THREE.Color(c)), cap = new THREE.Color("#ffffff");
  const position = geometry.attributes.position, colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const panel = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    (Math.abs(y) > radius * .88 ? cap : panels[panel]).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ball = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(ball);
  // Rolling: moving toward the rider (+z locally) and across (-x).
  const velocity = new THREE.Vector3(-across, 0, toward), axis = new THREE.Vector3(0, 1, 0).cross(velocity).normalize(), speed = velocity.length();
  return { placement, group, animate: (t, moving) => {
    const hop = moving ? Math.abs(Math.sin(t * 4.2)) * .22 : 0;
    ball.position.y = radius + hop;
    ball.quaternion.setFromAxisAngle(axis, speed * t / radius);
    shadow.scale.setScalar(1 - hop * .8);
  } };
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
  return { placement, group, animate: (t, moving, seconds) => {
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
  const overhead = createOverheadAdvertisement(DESTINATION_OVERHEAD_AD, art, outdoorResources);
  root.add(overhead); worldObjects.push(overhead);

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

  const closure = createRoadClosure();
  root.add(closure);
  worldObjects.push(closure);
  const advanceSign = createAdvanceDetourSign();
  placeOnRoute(advanceSign, ROAD_CLOSURE.junctionDistance - 55);
  root.add(advanceSign);
  worldObjects.push(advanceSign);
  for (const branch of ["left", "right"] as const) {
    const sign = createForkDirectionSign(branch);
    placeOnRoute(sign, ROAD_CLOSURE.junctionDistance + 7);
    root.add(sign);
    worldObjects.push(sign);
    for (const offset of [18, 47]) {
      const arrow = createDetourArrow(branch, ROAD_CLOSURE.junctionDistance + offset);
      root.add(arrow);
      worldObjects.push(arrow);
    }
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
