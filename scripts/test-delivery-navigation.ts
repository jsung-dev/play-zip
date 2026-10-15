import assert from "node:assert/strict";
import { getDeliveryNavigation } from "../components/delivery/delivery-navigation";
import { getDrivewayLength } from "../data/delivery-map";

const base = { position: 0, speed: 0, stopIndex: 0, stopDwell: 0, deliverySuccessRemaining: 0, closureReached: false, detour: "main" as const, driveway: null };
const cases = [
  { input: base, direction: "forward", text: "직진" },
  { input: { ...base, position: 140 }, direction: "left", text: "왼쪽 입구로" },
  { input: { ...base, position: 210 }, direction: "reverse", text: "후진해서 입구로" },
  { input: { ...base, position: 350, stopIndex: 1 }, direction: "right", text: "오른쪽 입구로" },
  { input: { ...base, position: 470, stopIndex: 2 }, direction: "fork", text: "좌우 우회로" },
  { input: { ...base, position: 490, stopIndex: 2, detour: "right" as const }, direction: "right", text: "오른쪽 우회로" },
  { input: { ...base, position: 567, stopIndex: 2, closureReached: true }, direction: "reverse", text: "후진해서 갈림길로" },
  { input: { ...base, position: 490, stopIndex: 2, closureReached: true }, direction: "fork", text: "좌우 우회로" },
  { input: { ...base, position: 190, driveway: { stopIndex: 0, progress: 10, entryPosition: 190, entryLaneX: -2.5 } }, direction: "forward", text: "집 앞까지 직진" },
  { input: { ...base, position: 190, driveway: { stopIndex: 0, progress: getDrivewayLength(0), entryPosition: 190, entryLaneX: -2.5 } }, direction: "stop", text: "멈춰서 배달" },
  { input: { ...base, position: 190, stopDwell: .5, driveway: { stopIndex: 0, progress: getDrivewayLength(0), entryPosition: 190, entryLaneX: -2.5 } }, direction: "delivery", text: "상품 전달 중" },
  { input: { ...base, position: 190, stopIndex: 1, deliverySuccessRemaining: 2 }, direction: "complete", text: "배달 완료!" },
  { input: { ...base, position: 190, stopIndex: 1, driveway: { stopIndex: 0, progress: 12, entryPosition: 190, entryLaneX: -2.5 } }, direction: "reverse", text: "후진해서 큰길로" },
  { input: { ...base, position: 900, stopIndex: 3 }, direction: "forward", text: "직진" },
];
for (const test of cases) {
  const actual = getDeliveryNavigation(test.input);
  assert.equal(actual.direction, test.direction);
  assert.equal(actual.instruction, test.text);
  assert(actual.instruction.length <= 12, "Keep one short instruction, not a paragraph");
  assert(actual.remaining >= 0);
}
assert.equal(getDeliveryNavigation({ ...base, position: 567, stopIndex: 2, closureReached: true }).remaining, 72);
assert.equal(getDeliveryNavigation({ ...base, position: 1000, stopIndex: 3 }, true).instruction, "상품 전달 중");
assert.equal(getDeliveryNavigation({ ...base, stopIndex: 1, deliverySuccessRemaining: 2 }).destination, "포근빌라 202호");
console.log("Single-line navigation: entrances, missed stops, detour, reverse, delivery and final arrival verified.");
