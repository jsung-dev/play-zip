import * as THREE from "three";
import { DELIVERY_GAME_CONFIG } from "./delivery-game";

export type DetourChoice = "main" | "left" | "right";

export type DrivewayState = {
  stopIndex: number;
  progress: number;
  entryPosition: number;
  entryLaneX: number;
  entryEnd?: "entrance" | "exit";
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

// Only the three delivery spurs change: keep the entrance, then reconnect to
// the same side of the main road. Pavement, driving and guidance share this path.
export const DRIVEWAY_ROUTE = { exitAdvance: 38, passMargin: 6, houseOffset: 7.2 } as const;
// Local fourth lanes use the roadside shoulder. The sidewalk starts at x=7.8.
export const TURN_LANE = { approach: 40, taper: 12, grace: 2, tail: 8, halfWidth: 1.5 } as const;
export type TurnLaneConnection = { stopIndex: number; entryEnd: "entrance" | "exit"; direction: 1 | -1; distance: number };
export const TURN_LANE_CONNECTIONS: TurnLaneConnection[] = DELIVERY_STOPS.flatMap((stop, stopIndex) => [
  {stopIndex, entryEnd: "entrance" as const, direction: 1 as const, distance: stop.distance},
  {stopIndex, entryEnd: "exit" as const, direction: -1 as const, distance: stop.distance + DRIVEWAY_ROUTE.exitAdvance},
]);
export function turnLaneSide(connection: TurnLaneConnection) { return DELIVERY_STOPS[connection.stopIndex].side === "left" ? -1 : 1; }
export function turnLaneAhead(connection: TurnLaneConnection, position: number) { return (connection.distance - position) * connection.direction; }
export function turnLaneOpening(connection: TurnLaneConnection, position: number) {
  return smoothStep((TURN_LANE.approach + TURN_LANE.taper - turnLaneAhead(connection, position)) / TURN_LANE.taper);
}
export function getPhysicalTurnLane(position: number, side?: number) {
  return TURN_LANE_CONNECTIONS.find(connection => {
    const ahead = turnLaneAhead(connection, position);
    return (side === undefined || turnLaneSide(connection) === side) && ahead >= -TURN_LANE.tail && ahead <= TURN_LANE.approach + TURN_LANE.taper;
  }) ?? null;
}
export function getExtraLaneX(connection: TurnLaneConnection, position: number) {
  return turnLaneSide(connection) * DELIVERY_GAME_CONFIG.laneSpacing * (1 + turnLaneOpening(connection, position));
}
const drivewayCurves = new Map<number, THREE.CurvePath<THREE.Vector3>>();
const deliveryCenters = new Map<number, number>();
export function getDrivewayExitDistance(stopIndex: number) {
  return DELIVERY_STOPS[stopIndex].distance + DRIVEWAY_ROUTE.exitAdvance;
}

export function getDrivewayCurve(stopIndex: number) {
  const cached = drivewayCurves.get(stopIndex);
  if (cached) return cached;
  const stop = DELIVERY_STOPS[stopIndex];
  const frame = getRouteFrame(stop.distance);
  const side = stop.side === "left" ? -1 : 1;
  const start = frame.position.clone().addScaledVector(frame.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing * 2);
  const end = frame.position.clone()
    .addScaledVector(frame.lateral, side * DELIVERY_GAME_CONFIG.drivewaySideOffset)
    .addScaledVector(frame.tangent, DELIVERY_GAME_CONFIG.drivewayForwardOffset);
  const entrance = new THREE.CubicBezierCurve3(start, start.clone().addScaledVector(frame.tangent, 9), end.clone().addScaledVector(frame.tangent, -9), end);
  const exitFrame = getRouteFrame(getDrivewayExitDistance(stopIndex));
  const exit = exitFrame.position.clone().addScaledVector(exitFrame.lateral, side * DELIVERY_GAME_CONFIG.laneSpacing * 2);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  curve.add(entrance);
  curve.add(new THREE.CubicBezierCurve3(end, end.clone().addScaledVector(frame.tangent, 14), exit.clone().addScaledVector(exitFrame.tangent, -14), exit));
  deliveryCenters.set(stopIndex, entrance.getLength());
  drivewayCurves.set(stopIndex, curve);
  return curve;
}

export function getDrivewayLength(stopIndex: number) {
  return getDrivewayCurve(stopIndex).getLength();
}

export function getDrivewayPavedWidth(stopIndex: number, progress: number) {
  const toJoin = Math.max(0, Math.min(progress, getDrivewayLength(stopIndex) - progress));
  return DELIVERY_GAME_CONFIG.drivewayWidth + 3.2 * (1 - smoothStep(toJoin / 6));
}

export function getDrivewayDeliveryInterval(stopIndex: number) {
  getDrivewayCurve(stopIndex);
  const center = deliveryCenters.get(stopIndex)!;
  const halfDepth = DELIVERY_GAME_CONFIG.drivewayDeliveryDepth / 2;
  return { start: center - halfDepth, end: center + halfDepth, width: DELIVERY_GAME_CONFIG.drivewayWidth };
}

/** Houses stand on the sidewalk side of the main road, facing it (no alley). */
export const DELIVERY_HOUSE = {
  /** Meters past the stop's route distance where the bike halts beside the house. */
  along: 9.5,
  /** Lateral distance of the house origin: sidewalk outer edge 10.1 + front 3.894 + setback .55 (checked in test-delivery-driveby). */
  offset: 14.544,
} as const;

export function getDeliveryHouseTransform(stopIndex: number) {
  const stop = DELIVERY_STOPS[stopIndex], side = stop.side === "left" ? -1 : 1;
  const frame = getRouteFrame(stop.distance + DELIVERY_HOUSE.along);
  return { position: frame.position.clone().addScaledVector(frame.lateral, side * DELIVERY_HOUSE.offset), yaw: frame.yaw - side * Math.PI / 2 };
}

export function getDrivewayFrame(stopIndex: number, progress: number, entry?: Pick<DrivewayState, "entryPosition" | "entryLaneX" | "entryEnd">) {
  const curve = getDrivewayCurve(stopIndex);
  const length = curve.getLength();
  const t = THREE.MathUtils.clamp(progress / length, 0, 1);
  // CurvePath.getPoint is already arc-length parameterized across its curves.
  const point = curve.getPoint(t);
  const tangent = curve.getTangent(t).normalize();
  if (entry) {
    const entryFrame = getRouteFrame(entry.entryPosition);
    const actualEntry = entryFrame.position.addScaledVector(entryFrame.lateral, entry.entryLaneX);
    // A forgiving entrance window without teleporting to the curve's center.
    const atExit = entry.entryEnd === "exit";
    point.addScaledVector(actualEntry.sub(curve.getPoint(atExit ? 1 : 0)), 1 - smoothStep((atExit ? length - progress : progress) / 7));
  }
  return { position: point, tangent, lateral: new THREE.Vector3(-tangent.z, 0, tangent.x), yaw: Math.atan2(-tangent.x, -tangent.z) };
}

export function isAtDrivewayDelivery(driveway: DrivewayState | null, stopIndex: number) {
  if (driveway?.stopIndex !== stopIndex) return false;
  const zone = getDrivewayDeliveryInterval(stopIndex);
  return driveway.progress >= zone.start && driveway.progress <= zone.end;
}
