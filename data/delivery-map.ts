import * as THREE from "three";
import { DELIVERY_GAME_CONFIG } from "./delivery-game";

export type DetourChoice = "main" | "left" | "right";

export type DrivewayState = {
  stopIndex: number;
  progress: number;
  entryPosition: number;
  entryLaneX: number;
};

export type DeliveryStop = {
  id: string;
  distance: number;
  address: string;
  side: "left" | "right";
  color: string;
};

export const DELIVERY_STOPS: DeliveryStop[] = [
  { id: "stop-01", distance: 190, address: "포근빌라 202호", side: "left", color: "#e5c7a2" },
  { id: "stop-02", distance: 390, address: "민트하우스 3동", side: "right", color: "#cce3c5" },
  { id: "stop-03", distance: 820, address: "달빛주택 101호", side: "left", color: "#d8cdee" },
];

export const ROAD_CLOSURE = {
  distance: 570,
  junctionDistance: 495,
  stopBeforeMeters: 3,
  detourOffset: 17,
  rampMeters: 75,
  mergeStart: 635,
  mergeEnd: 680,
} as const;

const routeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -150),
  new THREE.Vector3(-15, 0, -275),
  new THREE.Vector3(70, 0, -365),
  new THREE.Vector3(190, 0, -430),
  new THREE.Vector3(230, 0, -560),
  new THREE.Vector3(210, 0, -700),
  new THREE.Vector3(100, 0, -820),
  new THREE.Vector3(-30, 0, -900),
  new THREE.Vector3(-80, 0, -1_025),
  new THREE.Vector3(-80, 0, -1_170),
], false, "centripetal");

function smoothStep(value: number) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function basePointAt(distance: number) {
  return routeCurve.getPointAt(THREE.MathUtils.clamp(distance / DELIVERY_GAME_CONFIG.totalDistance, 0, 1));
}

function detourOffsetAt(distance: number, branch: DetourChoice) {
  if (branch === "main") return 0;
  const side = branch === "left" ? -1 : 1;
  const outward = smoothStep((distance - ROAD_CLOSURE.junctionDistance) / ROAD_CLOSURE.rampMeters);
  const inward = 1 - smoothStep((distance - ROAD_CLOSURE.mergeStart) / (ROAD_CLOSURE.mergeEnd - ROAD_CLOSURE.mergeStart));
  return side * ROAD_CLOSURE.detourOffset * Math.min(outward, inward);
}

function positionAt(distance: number, branch: DetourChoice) {
  const point = basePointAt(distance);
  const tangent = routeCurve.getTangentAt(THREE.MathUtils.clamp(distance / DELIVERY_GAME_CONFIG.totalDistance, 0, 1));
  const offset = detourOffsetAt(distance, branch);
  point.x += -tangent.z * offset;
  point.z += tangent.x * offset;
  return point;
}

export function getRouteFrame(distance: number, branch: DetourChoice = "main") {
  const safeDistance = THREE.MathUtils.clamp(distance, 0, DELIVERY_GAME_CONFIG.totalDistance);
  const point = positionAt(safeDistance, branch);
  const from = positionAt(Math.max(0, safeDistance - 0.8), branch);
  const to = positionAt(Math.min(DELIVERY_GAME_CONFIG.totalDistance, safeDistance + 0.8), branch);
  const tangent = to.sub(from).normalize();
  const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  return {
    position: point,
    tangent,
    lateral,
    yaw: Math.atan2(-tangent.x, -tangent.z),
  };
}

export function getDetourOffset(distance: number, branch: DetourChoice) {
  return detourOffsetAt(distance, branch);
}

// The same short curve drives the pavement, bicycle, camera and delivery pad.
const drivewayCurves = new Map<number, THREE.CubicBezierCurve3>();
export function getDrivewayCurve(stopIndex: number) {
  const cached = drivewayCurves.get(stopIndex);
  if (cached) return cached;
  const stop = DELIVERY_STOPS[stopIndex];
  const frame = getRouteFrame(stop.distance);
  const side = stop.side === "left" ? -1 : 1;
  const start = frame.position.clone().addScaledVector(frame.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing);
  const end = frame.position.clone()
    .addScaledVector(frame.lateral, side * DELIVERY_GAME_CONFIG.drivewaySideOffset)
    .addScaledVector(frame.tangent, DELIVERY_GAME_CONFIG.drivewayForwardOffset);
  const curve = new THREE.CubicBezierCurve3(start, start.clone().addScaledVector(frame.tangent, 9), end.clone().addScaledVector(frame.tangent, -9), end);
  drivewayCurves.set(stopIndex, curve);
  return curve;
}

export function getDrivewayLength(stopIndex: number) {
  return getDrivewayCurve(stopIndex).getLength();
}

export function getDrivewayFrame(stopIndex: number, progress: number, entry?: Pick<DrivewayState, "entryPosition" | "entryLaneX">) {
  const curve = getDrivewayCurve(stopIndex);
  const length = curve.getLength();
  const t = THREE.MathUtils.clamp(progress / length, 0, 1);
  const point = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  if (entry) {
    const entryFrame = getRouteFrame(entry.entryPosition);
    const actualEntry = entryFrame.position.addScaledVector(entryFrame.lateral, entry.entryLaneX);
    // A forgiving entrance window without teleporting to the curve's center.
    point.addScaledVector(actualEntry.sub(curve.v0), 1 - smoothStep(progress / 7));
  }
  return { position: point, tangent, lateral: new THREE.Vector3(-tangent.z, 0, tangent.x), yaw: Math.atan2(-tangent.x, -tangent.z) };
}

export function isAtDrivewayDelivery(driveway: DrivewayState | null, stopIndex: number) {
  return driveway?.stopIndex === stopIndex
    && driveway.progress >= getDrivewayLength(stopIndex) - DELIVERY_GAME_CONFIG.drivewayDeliveryDepth;
}
