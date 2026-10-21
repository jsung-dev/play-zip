import assert from "node:assert/strict";
import { getDeliveryNavigation } from "../components/delivery/delivery-navigation";
import { DRIVE_BY, DRIVE_BY_TEXT, houseDistance } from "../components/delivery/delivery-driveby";

const base = { position: 0, speed: 20, stopIndex: 0, stopDwell: 0, deliverySuccessRemaining: 0, detour: "main" as const };
const h = houseDistance(0);
const cases = [
  { input: base, direction: "forward", text: "직진" },
  { input: { ...base, position: h - DRIVE_BY.warnAhead + 1 }, direction: "left", text: DRIVE_BY_TEXT.warn },
  { input: { ...base, position: h - DRIVE_BY.windowAhead + 1 }, direction: "stop", text: DRIVE_BY_TEXT.window },
  { input: { ...base, position: h + DRIVE_BY.windowBehind + 1, stopIndex: 1 }, direction: "forward", text: "직진" },
  { input: { ...base, position: 380, stopIndex: 1 }, direction: "right", text: DRIVE_BY_TEXT.warn },
  { input: { ...base, position: 470, stopIndex: 2 }, direction: "fork", text: "가운데 길" },
  { input: { ...base, position: 490, stopIndex: 2, detour: "right" as const }, direction: "right", text: "오른쪽 길" },
  { input: { ...base, position: 490, stopIndex: 2, detour: "left" as const }, direction: "left", text: "왼쪽 길" },
  { input: { ...base, position: h, stopIndex: 1, deliverySuccessRemaining: 2 }, direction: "complete", text: "배달 완료!" },
  { input: { ...base, position: 900, stopIndex: 3 }, direction: "forward", text: "직진" },
];
for (const test of cases) {
  const actual = getDeliveryNavigation(test.input);
  assert.equal(actual.direction, test.direction);
  assert.equal(actual.instruction, test.text);
  assert(actual.remaining >= 0);
}
assert.equal(getDeliveryNavigation({ ...base, position: h - 40 }).remaining, 40);
assert.equal(getDeliveryNavigation({ ...base, position: 1000, stopIndex: 3 }, true).instruction, "상품 전달 중");
assert.equal(getDeliveryNavigation({ ...base, stopIndex: 1, deliverySuccessRemaining: 2 }).destination, "민트하우스 3동");
console.log("Navigation: warning, jump prompt, open three-way fork, completion and arrival verified.");
