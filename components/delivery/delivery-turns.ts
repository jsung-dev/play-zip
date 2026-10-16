import { DELIVERY_GAME_CONFIG as config } from "@/data/delivery-game";
import { TURN_LANE, TURN_LANE_CONNECTIONS, getPhysicalTurnLane, getExtraLaneX, turnLaneAhead, turnLaneSide, getDrivewayLength, type DrivewayState, type TurnLaneConnection } from "@/data/delivery-map";

export type TravelDirection = 1 | -1;
// Derived from actual fourth-lane occupancy, no longer a queued input command.
export type TurnChoice = TurnLaneConnection;

/** Every physical junction is usable, independent of the current mission. */
export function getDeliveryJunction(position: number, direction: TravelDirection = 1): TurnChoice | null {
  return TURN_LANE_CONNECTIONS.find(connection => connection.direction === direction
    && turnLaneAhead(connection, position) >= -TURN_LANE.grace
    && turnLaneAhead(connection, position) <= TURN_LANE.approach) ?? null;
}

export function laneTargetX(target: number, position: number) {
  if (target >= 0 && target <= 2) return (target - 1) * config.laneSpacing;
  const side = target < 0 ? -1 : 1, connection = getPhysicalTurnLane(position, side);
  return connection ? getExtraLaneX(connection, position) : side * config.laneSpacing;
}

export function nextDeliveryLane(position: number, target: number, horizontal: -1 | 1) {
  const connection = getPhysicalTurnLane(position);
  const available = connection && turnLaneAhead(connection, position) >= -TURN_LANE.grace
    && turnLaneAhead(connection, position) <= TURN_LANE.approach;
  const minimum = available && turnLaneSide(connection) < 0 ? -1 : 0;
  const maximum = available && turnLaneSide(connection) > 0 ? 3 : 2;
  return Math.max(minimum, Math.min(maximum, target + horizontal));
}

/** Keep a rider on the tapered merge; normalize only once the lane ends. */
export function settledDeliveryLane(position: number, target: number) {
  if (target >= 0 && target <= 2) return target;
  const connection = getPhysicalTurnLane(position, target < 0 ? -1 : 1);
  return connection && turnLaneAhead(connection, position) >= -TURN_LANE.grace ? target : Math.max(0, Math.min(2, target));
}

export function occupiedDeliveryTurn(position: number, direction: TravelDirection, laneX: number): TurnChoice | null {
  const junction = getDeliveryJunction(position, direction);
  return junction && laneX * turnLaneSide(junction) > config.laneSpacing * 1.5 ? junction : null;
}

export function enterTurnLane(position: number, speed: number, laneX: number): DrivewayState | null {
  if (!speed) return null;
  const connection = occupiedDeliveryTurn(position, speed > 0 ? 1 : -1, laneX);
  if (!connection || turnLaneAhead(connection, position) > 0) return null;
  return {stopIndex: connection.stopIndex, entryEnd: connection.entryEnd, entryPosition: position, entryLaneX: laneX,
    progress: connection.entryEnd === "entrance" ? 0 : getDrivewayLength(connection.stopIndex)};
}

/** Ad buses wait for a clear shoulder instead of occupying the player's turn lane. */
export function busTurnLaneClear(from: number, to: number, side: "left" | "right") {
  return !TURN_LANE_CONNECTIONS.some(connection => {
    if (turnLaneSide(connection) !== (side === "left" ? -1 : 1)) return false;
    const a = connection.distance - connection.direction * (TURN_LANE.approach + TURN_LANE.taper);
    const b = connection.distance + connection.direction * TURN_LANE.tail;
    return Math.max(from,to) + 5 >= Math.min(a,b) && Math.min(from,to) - 5 <= Math.max(a,b);
  });
}
