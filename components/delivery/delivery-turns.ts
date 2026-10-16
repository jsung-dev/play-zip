import { DELIVERY_STOPS, getDrivewayExitDistance, getDrivewayLength, type DrivewayState } from "@/data/delivery-map";

export type TravelDirection = 1 | -1;
export type TurnChoice = { stopIndex: number; entryEnd: "entrance" | "exit"; direction: TravelDirection; distance: number };
export const TURN_SELECTION = { approach: 40, grace: 2 } as const;

/** Every physical junction is usable, independent of the current mission. */
export function getDeliveryJunction(position: number, direction: TravelDirection = 1): TurnChoice | null {
  const candidates = DELIVERY_STOPS.map((stop, stopIndex): TurnChoice => ({
    stopIndex, direction, entryEnd: direction > 0 ? "entrance" : "exit",
    distance: direction > 0 ? stop.distance : getDrivewayExitDistance(stopIndex),
  })).filter(junction => {
    const ahead = (junction.distance - position) * direction;
    return ahead >= -TURN_SELECTION.grace && ahead <= TURN_SELECTION.approach;
  });
  candidates.sort((a, b) => Math.abs(a.distance - position) - Math.abs(b.distance - position));
  return candidates[0] ?? null;
}

export function turnChoiceIsValid(choice: TurnChoice, position: number, direction: TravelDirection) {
  const ahead = (choice.distance - position) * choice.direction;
  return choice.direction === direction && ahead >= -TURN_SELECTION.grace && ahead <= TURN_SELECTION.approach + 1;
}

/** A new left/right action chooses a turn; merely occupying a lane never does. */
export function chooseDeliveryTurn(position: number, direction: TravelDirection, horizontal: -1 | 1) {
  const junction = getDeliveryJunction(position, direction);
  if (!junction) return undefined; // Ordinary lane change, outside a junction.
  const side = DELIVERY_STOPS[junction.stopIndex].side === "left" ? -1 : 1;
  return side === horizontal ? junction : null; // Opposite input explicitly chooses straight.
}

export function enterSelectedTurn(choice: TurnChoice | null, position: number, speed: number, laneX: number): DrivewayState | null {
  if (!choice || speed * choice.direction <= 0 || (position - choice.distance) * choice.direction < 0) return null;
  if (!turnChoiceIsValid(choice, position, choice.direction)) return null;
  return {stopIndex: choice.stopIndex, entryEnd: choice.entryEnd, entryPosition: position, entryLaneX: laneX,
    progress: choice.entryEnd === "entrance" ? 0 : getDrivewayLength(choice.stopIndex)};
}
